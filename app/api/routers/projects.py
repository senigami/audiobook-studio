import uuid
import time
import json
import re
import logging
import os
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Form, File, UploadFile, Request, Query
from fastapi.responses import JSONResponse
from ...db import (
    create_project, get_project, list_projects, update_project, 
    delete_project, list_chapters as db_list_chapters, reorder_chapters
)
from ...config import COVER_DIR, XTTS_OUT_DIR, get_project_dir, get_project_cover_dir, find_existing_project_dir, find_existing_project_subdir
import urllib.parse
from ...jobs import enqueue
from ...engines import get_audio_duration
from ...state import put_job, update_job, get_jobs
from ...models import Job
from ...pathing import safe_basename, safe_join, safe_join_flat
from ...api.utils import preferred_audiobook_download_filename

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])


async def _store_project_cover(project_id: str, project_dir: Path, cover: UploadFile) -> str:
    safe_cover_name = safe_basename(cover.filename)
    ext = Path(safe_cover_name).suffix.lower() or ".jpg"
    project_root = os.path.abspath(os.path.normpath(os.fspath(project_dir)))
    cover_dir_path = os.path.abspath(os.path.normpath(os.path.join(project_root, "cover")))
    if not cover_dir_path.startswith(project_root + os.sep):
        raise ValueError(f"Invalid project cover directory for id: {project_id}")
    cover_dir = Path(cover_dir_path)
    cover_dir.mkdir(parents=True, exist_ok=True)
    cover_filename = f"cover{ext}"
    cover_path_str = os.path.abspath(os.path.normpath(os.path.join(cover_dir_path, cover_filename)))
    if not cover_path_str.startswith(cover_dir_path + os.sep):
        raise ValueError(f"Invalid project cover filename for id: {project_id}")
    cover_p = Path(cover_path_str)

    for existing in cover_dir.iterdir():
        if existing.is_file() and existing.name != cover_filename:
            existing.unlink(missing_ok=True)

    content = await cover.read()
    cover_p.write_bytes(content)
    return f"/projects/{project_id}/cover/{cover_filename}"

@router.get("")
def api_list_projects():
    return JSONResponse(list_projects())

@router.post("/{project_id}/reorder_chapters")
def api_reorder_chapters_route(project_id: str, chapter_ids: str = Form(...)):
    try:
        ids_list = json.loads(chapter_ids)
        reorder_chapters(ids_list)
        return JSONResponse({"status": "ok"})
    except Exception:
        logger.warning("Failed to reorder chapters for project %s", project_id, exc_info=True)
        return JSONResponse({"status": "error", "message": "Invalid chapter order"}, status_code=400)

@router.get("/{project_id}")
def api_get_project(project_id: str):
    p = get_project(project_id)
    if not p:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    return JSONResponse(p)

@router.post("")
async def api_create_project(
    name: str = Form(...),
    series: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    cover: Optional[UploadFile] = File(None)
):
    pid = create_project(name, series, author, None)
    if cover:
        cover_path = await _store_project_cover(pid, get_project_dir(pid), cover)
        update_project(pid, cover_image_path=cover_path)
    return JSONResponse({"status": "ok", "project_id": pid})

@router.put("/{project_id}")
async def api_update_project(
    project_id: str,
    name: Optional[str] = Form(None),
    series: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    cover: Optional[UploadFile] = File(None)
):
    p = get_project(project_id)
    if not p:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

    updates = {}
    if name is not None: updates["name"] = name
    if series is not None: updates["series"] = series
    if author is not None: updates["author"] = author

    if cover:
        project_dir = find_existing_project_dir(project_id) or get_project_dir(project_id)
        updates["cover_image_path"] = await _store_project_cover(project_id, project_dir, cover)

    if updates:
        update_project(project_id, **updates)

    return JSONResponse({"status": "ok", "project_id": project_id})

@router.delete("/{project_id}")
def api_delete_project(project_id: str):
    success = delete_project(project_id)
    if success:
        return JSONResponse({"status": "ok"})
    return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

@router.get("/{project_id}/audiobooks")
def api_list_project_audiobooks(project_id: str):
    project = get_project(project_id)
    if not project:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

    m4b_dir = find_existing_project_subdir(project_id, "m4b")
    m4b_files = []
    if m4b_dir and m4b_dir.exists():
        for p in m4b_dir.iterdir():
            if not p.is_file() or p.suffix.lower() != ".m4b":
                continue
            encoded_name = urllib.parse.quote(p.name)
            m4b_files.append((p, f"/projects/{project_id}/m4b/{encoded_name}"))

    seen_paths = set()
    unique_files = []
    for p, url in m4b_files:
        if p not in seen_paths:
            seen_paths.add(p)
            unique_files.append((p, url))

    res = []
    unique_files.sort(key=lambda x: x[0].stat().st_mtime, reverse=True)

    import subprocess
    import shlex
    for p, url in unique_files:
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
            probe_cmd = [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration:format_tags=title",
                "-of",
                "json",
                str(p),
            ]
            probe_res = subprocess.run(probe_cmd, capture_output=True, text=True, check=True, timeout=3)
            probe_data = json.loads(probe_res.stdout)
            if "format" in probe_data:
                fmt = probe_data["format"]
                if "duration" in fmt:
                    item["duration_seconds"] = float(fmt["duration"])
                if "tags" in fmt and "title" in fmt["tags"]:
                    item["title"] = fmt["tags"]["title"]
        except Exception:
            logger.warning("Failed to probe audiobook metadata for %s", p, exc_info=True)

        item["download_filename"] = preferred_audiobook_download_filename(item["title"], p.name)

        # Look for cover image with multiple extensions
        item["cover_url"] = None
        for ext in [".jpg", ".png", ".jpeg", ".webp"]:
            target_img = p.with_suffix(ext)
            if target_img.exists() and target_img.stat().st_size > 0:
                encoded_ext = urllib.parse.quote(target_img.name)
                item["cover_url"] = f"/projects/{project_id}/m4b/{encoded_ext}"
                break
        res.append(item)
    return res

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
            cover_path = str(safe_join_flat(COVER_DIR, filename))
        elif cover_path.startswith(f'/projects/{project_id}/'):
            filename = cover_path.replace(f'/projects/{project_id}/', '')
            cover_path = str(safe_join(get_project_dir(project_id), filename))

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
        dur = get_audio_duration(safe_join_flat(src_dir, fname))
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
