import logging
import socket
import json
import os
import subprocess
import re
import sys
from pathlib import Path
from typing import Optional, List
from .. import config
from ..pathing import safe_join, safe_join_flat, find_secure_file, secure_join_flat
from ..subprocess_utils import coerce_subprocess_output, write_subprocess_output
from ..textops import split_by_chapter_markers, write_chapters_to_folder, split_into_parts

logger = logging.getLogger(__name__)
SAFE_FILE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")
FFPROBE_AUDIOBOOK_CMD = (
    "ffprobe",
    "-v",
    "error",
    "-show_entries",
    "format=duration:format_tags=title",
    "-of",
    "json",
)


def _contained_audiobook_path(root: Path, filename: str) -> Optional[Path]:
    if not SAFE_FILE_RE.fullmatch(filename):
        return None
    if Path(filename).suffix.lower() != ".m4b":
        return None
    return find_secure_file(root, filename)


def probe_audiobook_metadata(root: Path, filename: str) -> dict:
    trusted_path = _contained_audiobook_path(root, filename)
    if not trusted_path:
        return {}
    try:
        resolved = trusted_path.resolve()
        base_resolved = root.resolve()
        resolved.relative_to(base_resolved)
    except (OSError, ValueError, RuntimeError):
         logger.error(f"Blocking out-of-bounds metadata probe: {trusted_path}")
         return {}

    probe_res = subprocess.run(
        [*FFPROBE_AUDIOBOOK_CMD, os.fspath(resolved)],
        capture_output=True,
        text=True,
        check=True,
        timeout=3,
    )
    stdout = coerce_subprocess_output(getattr(probe_res, "stdout", ""))
    stderr = coerce_subprocess_output(getattr(probe_res, "stderr", ""))
    write_subprocess_output(stdout=stdout, stderr=stderr)
    probe_data = json.loads(stdout)
    if not isinstance(probe_data, dict):
        return {}
    return probe_data


def preferred_audiobook_download_filename(title: str, fallback_filename: str) -> str:
    stem = (title or "").strip()
    if not stem:
        return fallback_filename
    stem = re.sub(r'[\\/:*?"<>|]+', "", stem)
    stem = re.sub(r"\s+", " ", stem).strip().rstrip(".")
    if not stem:
        return fallback_filename
    if Path(stem).suffix.lower() == ".m4b":
        return stem
    return f"{stem}.m4b"

def read_preview(path: Path, max_chars: int = 8000) -> str:
    if not path.exists():
        return ""
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
        if len(content) > max_chars:
            return content[:max_chars] + ("\n\n...[preview truncated]..." if len(content) > max_chars else "")
        return content
    except Exception:
        logger.debug("Failed to read preview from %s", path, exc_info=True)
        return ""

def output_exists(engine: str, chapter_file: str):
    if not SAFE_FILE_RE.fullmatch(chapter_file):
        return False
    chapter_name = Path(chapter_file).stem
    from ..voice_engines import is_tts_engine
    if is_tts_engine(engine) or engine == "mixed":
        return bool(find_secure_file(config.XTTS_OUT_DIR, f"{chapter_name}.wav")) or \
               bool(find_secure_file(config.XTTS_OUT_DIR, f"{chapter_name}.mp3"))
    elif engine == "audiobook":
        return bool(find_secure_file(config.AUDIOBOOK_DIR, f"{chapter_name}.m4b"))
    return False

def xtts_outputs_for(chapter_file: str, project_id: Optional[str] = None):
    if not SAFE_FILE_RE.fullmatch(chapter_file):
        return []
    outputs = []
    chapter_name = chapter_file
    # Check global
    for ext in [".wav", ".mp3"]:
        p = find_secure_file(config.XTTS_OUT_DIR, f"{chapter_name}{ext}")
        if p:
            outputs.append(f"/out/xtts/{chapter_name}{ext}")

    # Check project
    if project_id:
        try:
            proj_audio = config.get_project_audio_dir(project_id)
            for ext in [".wav", ".mp3"]:
                p = find_secure_file(proj_audio, f"{chapter_name}{ext}")
                if p:
                    outputs.append(f"/out/projects/{project_id}/audio/{chapter_name}{ext}")
        except OSError:
            pass

    return outputs

def legacy_list_chapters():
    config.CHAPTER_DIR.mkdir(parents=True, exist_ok=True)
    return sorted(config.CHAPTER_DIR.glob("*.txt"))

def is_react_dev_active():
    """Checks if the React dev server is running on 127.0.0.1:5173"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.5)
        result = sock.connect_ex(('127.0.0.1', 5173))
        sock.close()
        return result == 0
    except Exception:
        logger.debug("React dev server check failed", exc_info=True)
        return False

def process_and_split_file(filename: str, mode: str = "parts", max_chars: int = None) -> List[Path]:
    """Helper to split a file into chapters/parts in the CHAPTER_DIR."""
    if max_chars is None:
        max_chars = config.PART_CHAR_LIMIT

    if not SAFE_FILE_RE.fullmatch(filename):
        raise FileNotFoundError(f"Upload not found: {filename}")
    path = find_secure_file(config.UPLOAD_DIR, filename)
    if not path:
        raise FileNotFoundError(f"Upload not found: {filename}")

    full_text = path.read_text(encoding="utf-8", errors="replace")
    mode_clean = str(mode).strip().lower()

    if mode_clean == "chapter":
        chapters = split_by_chapter_markers(full_text)
        if not chapters:
            raise ValueError("No chapter markers found. Expected: Chapter 1: Title")
        return write_chapters_to_folder(chapters, config.CHAPTER_DIR, prefix="chapter", include_heading=True)
    else:
        stem = path.stem
        chapters = split_into_parts(full_text, max_chars, start_index=1)
        return write_chapters_to_folder(chapters, config.CHAPTER_DIR, prefix=stem, include_heading=False)

def list_audiobooks():
    """Lists all audiobooks from legacy and project-specific directories."""
    res = []
    m4b_files = []
    if config.AUDIOBOOK_DIR.exists():
        for p in config.AUDIOBOOK_DIR.glob("*.m4b"):
            if not SAFE_FILE_RE.fullmatch(p.name):
                continue
            m4b_files.append((p.name, config.AUDIOBOOK_DIR, f"/out/audiobook/{p.name}"))

    if config.PROJECTS_DIR.exists():
        for proj_dir in config.PROJECTS_DIR.iterdir():
            if proj_dir.is_dir():
                try:
                    m4b_dir = secure_join_flat(proj_dir, "m4b")
                except ValueError:
                    continue
                if m4b_dir.exists():
                    for p in m4b_dir.glob("*.m4b"):
                        if not SAFE_FILE_RE.fullmatch(p.name):
                            continue
                        m4b_files.append((p.name, m4b_dir, f"/projects/{proj_dir.name}/m4b/{p.name}"))

    m4b_files.sort(key=lambda x: _contained_audiobook_path(x[1], x[0]).stat().st_mtime, reverse=True)

    for filename, root_dir, url in m4b_files:
        p = _contained_audiobook_path(root_dir, filename)
        if p is None:
            continue

        # Rule 9: Explicit containment check for scanner locality before stat sink
        try:
            resolved = p.resolve()
            base_resolved = root_dir.resolve()
            resolved.relative_to(base_resolved)
        except (OSError, ValueError, RuntimeError):
             continue

        st = resolved.stat()
        item = {
            "filename": p.name, 
            "title": p.name, 
            "cover_url": None, 
            "url": url,
            "created_at": st.st_mtime,
            "size_bytes": st.st_size,
            "duration_seconds": 0.0,
            "download_filename": p.name,
        }
        try:
            probe_data = probe_audiobook_metadata(root_dir, p.name)
            if "format" in probe_data:
                fmt = probe_data["format"]
                if "duration" in fmt:
                    item["duration_seconds"] = float(fmt["duration"])
                if "tags" in fmt and "title" in fmt["tags"]:
                    item["title"] = fmt["tags"]["title"]
        except Exception:
            logger.debug("Failed to probe audiobook metadata for %s", p, exc_info=True)

        item["download_filename"] = preferred_audiobook_download_filename(item["title"], p.name)

        target_jpg = p.with_suffix(".jpg")
        if target_jpg.exists() and target_jpg.stat().st_size > 0:
            if "/out/audiobook/" in url:
                item["cover_url"] = f"/out/audiobook/{target_jpg.name}"
            else:
                item["cover_url"] = url.replace(".m4b", ".jpg")
        res.append(item)
    return res
