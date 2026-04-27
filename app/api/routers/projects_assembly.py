import logging
import time
import uuid
import urllib.parse
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Form, HTTPException, Body
from fastapi.responses import JSONResponse

from ...db import (
    get_project,
    get_chapter,
    list_chapters as db_list_chapters,
)
from ...config import COVER_DIR, XTTS_OUT_DIR, get_project_dir, find_existing_project_subdir
from ...pathing import safe_join, safe_join_flat, find_secure_file
from ...api.utils import SAFE_FILE_RE, preferred_audiobook_download_filename, probe_audiobook_metadata
from ...jobs import enqueue
from ...state import put_job, update_job, get_jobs
from ...models import Job
from ...engines import get_audio_duration

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/{project_id}/audiobooks")
def api_list_project_audiobooks(project_id: str):
    project = get_project(project_id)
    if not project:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

    m4b_dir = find_existing_project_subdir(project_id, "m4b")
    m4b_files = []
    if m4b_dir and m4b_dir.exists():
        for p in m4b_dir.iterdir():
            if not p.is_file() or p.suffix.lower() != ".m4b" or not SAFE_FILE_RE.fullmatch(p.name):
                continue
            encoded_name = urllib.parse.quote(p.name)
            m4b_files.append((p.name, f"/projects/{project_id}/m4b/{encoded_name}"))

    seen_paths = set()
    unique_files = []
    for filename, url in m4b_files:
        if filename not in seen_paths:
            seen_paths.add(filename)
            unique_files.append((filename, url))

    res = []
    # Sort unique files by mtime
    valid_files = []
    for filename, url in unique_files:
        # Rule 8 match
        p = find_secure_file(m4b_dir, filename)
        if p:
            valid_files.append((filename, url, p))

    valid_files.sort(key=lambda x: x[2].stat().st_mtime, reverse=True)

    for filename, url, p in valid_files:
        st = p.stat()
        item = {
            "filename": p.name,
            "title": p.name,
            "cover_url": None,
            "url": url,
            "created_at": st.st_mtime,
            "size_bytes": st.st_size,
            "download_filename": p.name,
        }
        try:
            probe_data = probe_audiobook_metadata(m4b_dir, p.name)
            if "format" in probe_data:
                fmt = probe_data["format"]
                if "duration" in fmt:
                    item["duration_seconds"] = float(fmt["duration"])
                if "tags" in fmt and "title" in fmt["tags"]:
                    item["title"] = fmt["tags"]["title"]
        except Exception:
            logger.warning("Failed to probe audiobook metadata for %s", p, exc_info=True)

        item["download_filename"] = preferred_audiobook_download_filename(item["title"], p.name)

        # Read description from sidecar file if it exists
        import os
        trusted_m4b_root = os.path.abspath(os.path.realpath(os.fspath(m4b_dir)))
        description_filename = p.name + ".description"
        # Since p was found via find_secure_file, we know it is in m4b_dir.
        # We derive description_path from m4b_dir and description_filename.
        description_full_path = os.path.normpath(os.path.join(trusted_m4b_root, description_filename))

        if description_full_path.startswith(trusted_m4b_root + os.sep) and os.path.exists(description_full_path):
            try:
                with open(description_full_path, "r", encoding="utf-8") as f:
                    item["description"] = f.read().strip()
            except Exception:
                pass

        # Look for cover image with multiple extensions
        item["cover_url"] = None
        for ext in [".jpg", ".png", ".jpeg", ".webp"]:
            cover_filename = p.stem + ext
            cover_full_path = os.path.normpath(os.path.join(trusted_m4b_root, cover_filename))
            if cover_full_path.startswith(trusted_m4b_root + os.sep) and os.path.exists(cover_full_path) and os.path.getsize(cover_full_path) > 0:
                encoded_ext = urllib.parse.quote(cover_filename)
                item["cover_url"] = f"/projects/{project_id}/m4b/{encoded_ext}"
                break
        res.append(item)
    return res

@router.patch("/{project_id}/audiobooks/{filename}")
def api_update_audiobook_metadata(project_id: str, filename: str, description: str = Body(..., embed=True)):
    """Update metadata (description) for a project assembly."""
    try:
        if get_project(project_id) is None:
            return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

        from ...config import find_existing_project_dir
        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)
        from ...pathing import secure_join_flat
        try:
            m4b_dir = secure_join_flat(project_dir, "m4b")
        except ValueError:
             return JSONResponse({"status": "error", "message": "Invalid m4b directory"}, status_code=403)

        # Store description in sidecar file
        import os
        trusted_m4b_root = os.path.abspath(os.path.realpath(os.fspath(m4b_dir)))
        # Rule 8: match from m4b dir for local proof
        audiobook_found_path = None
        for entry in os.scandir(trusted_m4b_root):
            if entry.is_file() and entry.name == filename:
                cand_path = os.path.abspath(os.path.realpath(entry.path))
                if cand_path.startswith(trusted_m4b_root + os.sep):
                    audiobook_found_path = cand_path
                    break

        if not audiobook_found_path:
            return JSONResponse({"status": "error", "message": "Audiobook not found"}, status_code=404)

        description_filename = filename + ".description"
        description_full_path = os.path.normpath(os.path.join(trusted_m4b_root, description_filename))

        # Rule 9: Locally visible containment check
        if not description_full_path.startswith(trusted_m4b_root + os.sep):
             return JSONResponse({"status": "error", "message": "Invalid description path"}, status_code=403)

        with open(description_full_path, "w", encoding="utf-8") as f:
            f.write(description)

        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Failed to update audiobook metadata for {filename}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during audiobook metadata update"}, status_code=500)

@router.post("/{project_id}/assemble")
def assemble_project(project_id: str, chapter_ids: Optional[str] = Form(None)):
    import json

    project = get_project(project_id)
    if not project:
        return JSONResponse({"error": "Project not found"}, status_code=404)

    chapters = db_list_chapters(project_id)
    if not chapters:
        return JSONResponse({"error": "No chapters found in project"}, status_code=400)

    selected_ids = []
    if chapter_ids:
        try:
            selected_ids = json.loads(chapter_ids)
        except Exception:
            selected_ids = []

    if selected_ids:
        chapters = [c for c in chapters if c['id'] in selected_ids]

    if not chapters:
        return JSONResponse({"error": "No valid chapters selected for assembly"}, status_code=400)

    chapter_list = []
    for c in chapters:
        if c['audio_status'] == 'done' and c['audio_file_path']:
            chapter_list.append({
                'filename': c['audio_file_path'],
                'title': c['title']
            })
        else:
            return JSONResponse({
                "error": f"Chapter '{c['title']}' is not processed yet or audio is missing."
            }, status_code=400)

    book_title = project['name']
    timestamp = time.strftime("%Y-%m-%d_%H-%M-%S")
    # Include project_id for better uniqueness and filtering
    unique_filename = f"{book_title}_{project_id[:8]}_{timestamp}"

    jid = uuid.uuid4().hex[:12]
    cover_path = project.get('cover_image_path', None)
    if cover_path:
        if cover_path.startswith('/out/covers/'):
            filename = cover_path.replace('/out/covers/', '')
            cover_p = find_secure_file(COVER_DIR, filename)
            cover_path = str(cover_p) if cover_p else None
        elif cover_path.startswith(f'/projects/{project_id}/'):
            filename = cover_path.replace(f'/projects/{project_id}/', '')
            # If it's a nested path like 'cover/cover.jpg', we use safe_join
            try:
                # Rule 9: containment check
                cover_p = safe_join(get_project_dir(project_id), filename)
                cover_path = str(cover_p) if cover_p.exists() else None
            except ValueError:
                cover_path = None

    j = Job(
        id=jid,
        project_id=project_id,
        engine="audiobook",
        chapter_file=unique_filename,
        custom_title=book_title,
        status="queued",
        created_at=time.time(),
        safe_mode=False,
        make_mp3=False,
        bypass_pause=True,
        author_meta=project.get('author', ''),
        narrator_meta="Generated by Audiobook Studio",
        chapter_list=chapter_list,
        cover_path=cover_path
    )
    put_job(j)
    update_job(jid, force_broadcast=True, status="queued", project_id=project_id, custom_title=book_title)
    enqueue(j)
    return JSONResponse({"status": "ok", "job_id": jid})

@router.get("/audiobook/prepare")
def prepare_audiobook():
    """Scans folders and returns a preview of chapters/durations for the modal."""
    src_dir = XTTS_OUT_DIR
    if not src_dir.exists():
        return JSONResponse({"title": "", "chapters": []})

    import re
    all_files = [p.name for p in src_dir.iterdir() if p.is_file() and p.suffix.lower() in ('.wav', '.mp3') and not p.name.startswith('seg_')]
    chapters_found = {}
    for f in all_files:
        stem = Path(f).stem
        ext = Path(f).suffix.lower()
        if stem not in chapters_found or ext == '.mp3':
             chapters_found[stem] = f

    def extract_number(filename):
        # Match part numbers or the whole stem to avoid UUID hashes
        match = re.search(r'(?:part_)?(\d+)(?:\.|$|_)', filename, re.IGNORECASE)
        return int(match.group(1)) if match else 0

    sorted_stems = sorted(chapters_found.keys(), key=lambda x: extract_number(x))
    preview = []
    total_sec = 0.0
    existing_jobs = get_jobs()
    job_titles = {j.chapter_file: j.custom_title for j in existing_jobs.values() if j.custom_title}

    for stem in sorted_stems:
        fname = chapters_found[stem]
        import os
        trusted_src_root = os.path.abspath(os.path.realpath(os.fspath(src_dir)))
        full_fname_path = os.path.normpath(os.path.join(trusted_src_root, fname))

        if full_fname_path.startswith(trusted_src_root + os.sep):
            dur = get_audio_duration(Path(full_fname_path))
            display_name = job_titles.get(stem + ".txt") or job_titles.get(stem) or stem
            preview.append({
                "filename": fname,
                "title": display_name,
                "duration": dur
            })
            total_sec += dur

    return {
        "title": "Audiobook Project",
        "chapters": preview,
        "total_duration": total_sec
    }
