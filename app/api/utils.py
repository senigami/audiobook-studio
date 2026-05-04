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

def exists(engine, chapter_file, project_id=None, chapter_id=None):
    if not project_id:
        return False

    if engine == "audiobook":
        if not chapter_file:
            return False
        chapter_name = Path(chapter_file).stem
        from ..config import get_project_m4b_dir
        pdir = get_project_m4b_dir(project_id)
        return bool(find_secure_file(pdir, f"{chapter_name}.m4b"))

    from ..voice_engines import is_tts_engine
    if is_tts_engine(engine) or engine == "mixed":
        if chapter_id:
            # Authoritative v2 check
            p = config.resolve_chapter_asset_path(project_id, chapter_id, "audio", filename=chapter_file)
            return bool(p and p.exists())

        return False
    return False





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

def list_audiobooks():
    """Returns all m4b files across all projects."""
    from ..config import PROJECTS_DIR
    m4b_files = []
    if PROJECTS_DIR.exists():
        for p_dir in PROJECTS_DIR.iterdir():
            if p_dir.is_dir():
                m4b_dir = p_dir / "m4b"
                if m4b_dir.exists():
                    for p in m4b_dir.glob("*.m4b"):
                        if not SAFE_FILE_RE.fullmatch(p.name):
                            continue
                        m4b_files.append((p.name, m4b_dir, f"/projects/{p_dir.name}/m4b/{p.name}"))

    res = []
    for filename, root, url in m4b_files:
        p = find_secure_file(root, filename)
        if p:
            st = p.stat()
            item = {
                "filename": filename,
                "title": filename,
                "url": url,
                "created_at": st.st_mtime,
                "size_bytes": st.st_size,
                "duration_seconds": 0.0,
                "download_filename": filename
            }
            try:
                probe_data = probe_audiobook_metadata(root, filename)
                if "format" in probe_data:
                    fmt = probe_data["format"]
                    if "duration" in fmt:
                        item["duration_seconds"] = float(fmt["duration"])
                    if "tags" in fmt and "title" in fmt["tags"]:
                        item["title"] = fmt["tags"]["title"]
            except Exception:
                pass
            item["download_filename"] = preferred_audiobook_download_filename(item["title"], filename)
            res.append(item)
    res.sort(key=lambda x: x['created_at'], reverse=True)
    return res
