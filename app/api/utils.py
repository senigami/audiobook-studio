import re
import socket
import json
import subprocess
import shlex
from pathlib import Path
from typing import Optional, List
from .. import config
from ..pathing import safe_basename, safe_join, safe_join_flat, safe_stem
from ..textops import split_by_chapter_markers, write_chapters_to_folder, split_into_parts

def read_preview(path: Path, max_chars: int = 8000) -> str:
    if not path.exists():
        return ""
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
        if len(content) > max_chars:
            return content[:max_chars] + ("\n\n...[preview truncated]..." if len(content) > max_chars else "")
        return content
    except:
        return ""

def output_exists(engine: str, chapter_file: str):
    chapter_name = safe_basename(chapter_file)
    if engine == "xtts":
        try:
            return safe_join(config.XTTS_OUT_DIR, f"{chapter_file}.wav").exists() or safe_join(config.XTTS_OUT_DIR, f"{chapter_file}.mp3").exists()
        except ValueError:
            return False
    elif engine == "audiobook":
        try:
            return safe_join(config.AUDIOBOOK_DIR, f"{chapter_file}.m4b").exists()
        except ValueError:
            return False
    return False

def xtts_outputs_for(chapter_file: str, project_id: Optional[str] = None):
    outputs = []
    chapter_name = safe_basename(chapter_file)
    # Check global
    for ext in [".wav", ".mp3"]:
        try:
            p = safe_join(config.XTTS_OUT_DIR, f"{chapter_file}{ext}")
            if p.exists():
                outputs.append(f"/out/xtts/{chapter_name}{ext}")
        except ValueError:
            return []

    # Check project
    if project_id:
        proj_audio = config.get_project_audio_dir(project_id)
        for ext in [".wav", ".mp3"]:
            try:
                p = safe_join(proj_audio, f"{chapter_file}{ext}")
                if p.exists():
                    outputs.append(f"/out/projects/{project_id}/audio/{chapter_name}{ext}")
            except ValueError:
                return []

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
    except:
        return False

def process_and_split_file(filename: str, mode: str = "parts", max_chars: int = None) -> List[Path]:
    """Helper to split a file into chapters/parts in the CHAPTER_DIR."""
    if max_chars is None:
        max_chars = config.PART_CHAR_LIMIT

    safe_filename = safe_basename(filename)
    path = safe_join_flat(config.UPLOAD_DIR, safe_filename)
    if not path.exists():
        raise FileNotFoundError(f"Upload not found: {safe_filename}")

    full_text = path.read_text(encoding="utf-8", errors="replace")
    mode_clean = str(mode).strip().lower()

    if mode_clean == "chapter":
        chapters = split_by_chapter_markers(full_text)
        if not chapters:
            raise ValueError("No chapter markers found. Expected: Chapter 1: Title")
        return write_chapters_to_folder(chapters, config.CHAPTER_DIR, prefix="chapter", include_heading=True)
    else:
        stem = safe_stem(safe_filename)
        chapters = split_into_parts(full_text, max_chars, start_index=1)
        return write_chapters_to_folder(chapters, config.CHAPTER_DIR, prefix=stem, include_heading=False)

def list_audiobooks():
    """Lists all audiobooks from legacy and project-specific directories."""
    res = []
    m4b_files = []
    if config.AUDIOBOOK_DIR.exists():
        for p in config.AUDIOBOOK_DIR.glob("*.m4b"):
            m4b_files.append((p, f"/out/audiobook/{p.name}"))

    if config.PROJECTS_DIR.exists():
        for proj_dir in config.PROJECTS_DIR.iterdir():
            if proj_dir.is_dir():
                m4b_dir = proj_dir / "m4b"
                if m4b_dir.exists():
                    for p in m4b_dir.glob("*.m4b"):
                        m4b_files.append((p, f"/projects/{proj_dir.name}/m4b/{p.name}"))

    m4b_files.sort(key=lambda x: x[0].stat().st_mtime, reverse=True)

    for p, url in m4b_files:
        st = p.stat()
        item = {
            "filename": p.name, 
            "title": p.name, 
            "cover_url": None, 
            "url": url,
            "created_at": st.st_mtime,
            "size_bytes": st.st_size
        }
        try:
            probe_cmd = f"ffprobe -v error -show_entries format=duration:format_tags=title -of json {shlex.quote(str(p))}"
            probe_res = subprocess.run(shlex.split(probe_cmd), capture_output=True, text=True, check=True, timeout=3)
            probe_data = json.loads(probe_res.stdout)
            if "format" in probe_data:
                fmt = probe_data["format"]
                if "duration" in fmt:
                    item["duration_seconds"] = float(fmt["duration"])
                if "tags" in fmt and "title" in fmt["tags"]:
                    item["title"] = fmt["tags"]["title"]
        except: pass

        target_jpg = p.with_suffix(".jpg")
        if target_jpg.exists() and target_jpg.stat().st_size > 0:
            if "/out/audiobook/" in url:
                item["cover_url"] = f"/out/audiobook/{target_jpg.name}"
            else:
                item["cover_url"] = url.replace(".m4b", ".jpg")
        res.append(item)
    return res
