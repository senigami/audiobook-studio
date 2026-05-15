import logging
import time
import uuid
import urllib.parse
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Form, HTTPException, Body, BackgroundTasks
from fastapi.responses import JSONResponse

from ...db import (
    get_project,
    get_chapter,
    list_chapters as db_list_chapters,
)
from ...core.config import get_project_dir, get_project_m4b_dir
from ...utils.pathing import safe_join, safe_join_flat, find_secure_file
from ...api.utils import SAFE_FILE_RE, preferred_audiobook_download_filename, probe_audiobook_metadata
from ...db.state import put_job, update_job, get_jobs
from ...db.models import Job
from ...engines.audio_ops import get_audio_duration
from ...orchestration.scheduler.orchestrator import create_orchestrator
from ...orchestration.tasks.assembly import AssemblyTask

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/{project_id}/audiobooks")
def api_list_project_audiobooks(project_id: str):
    from ...storage.manager import get_storage_manager
    storage = get_storage_manager()
    try:
        ctx = storage.get_project_context(project_id)
        m4b_dir = ctx.m4b_dir
    except ValueError:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

    m4b_files = []
    if m4b_dir.exists():
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
        p = m4b_dir / filename
        if p.exists() and storage.is_safe(p):
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
        description_filename = p.name + ".description"
        description_path = m4b_dir / description_filename

        if description_path.exists() and storage.is_safe(description_path):
            try:
                with open(description_path, "r", encoding="utf-8") as f:
                    item["description"] = f.read().strip()
            except Exception:
                pass

        # Look for cover image with multiple extensions
        item["cover_url"] = None
        for ext in [".jpg", ".png", ".jpeg", ".webp"]:
            cover_filename = p.stem + ext
            cover_path = m4b_dir / cover_filename
            if cover_path.exists() and storage.is_safe(cover_path) and cover_path.stat().st_size > 0:
                encoded_ext = urllib.parse.quote(cover_filename)
                item["cover_url"] = f"/projects/{project_id}/m4b/{encoded_ext}"
                break
        res.append(item)
    return res

@router.patch("/{project_id}/audiobooks/{filename}")
def api_update_audiobook_metadata(project_id: str, filename: str, description: str = Body(..., embed=True)):
    """Update metadata (description) for a project assembly."""
    try:
        from ...storage.manager import get_storage_manager
        storage = get_storage_manager()
        try:
            ctx = storage.get_project_context(project_id)
            m4b_dir = ctx.m4b_dir
        except ValueError:
            return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

        # Store description in sidecar file
        # Rule 8: match from m4b dir for local proof
        audiobook_path = m4b_dir / filename
        if not audiobook_path.is_file() or not storage.is_safe(audiobook_path):
            return JSONResponse({"status": "error", "message": "Audiobook not found"}, status_code=404)

        description_filename = filename + ".description"
        description_path = m4b_dir / description_filename

        # Rule 9: Locally visible containment check
        if not storage.is_safe(description_path):
             return JSONResponse({"status": "error", "message": "Invalid description path"}, status_code=403)

        with open(description_path, "w", encoding="utf-8") as f:
            f.write(description)

        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Failed to update audiobook metadata for {filename}: {e}", exc_info=True)
        return JSONResponse({"status": "error", "message": "Internal server error during audiobook metadata update"}, status_code=500)




@router.post("/{project_id}/assemble")
def assemble_project(
    project_id: str,
    background_tasks: BackgroundTasks,
    chapter_ids: Optional[str] = Form(None)
):
    import json

    from ...storage.manager import get_storage_manager
    storage = get_storage_manager()
    try:
        ctx = storage.get_project_context(project_id)
        m4b_dir = ctx.m4b_dir
    except ValueError:
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
            full_path = storage.resolve_chapter_asset_path(project_id, c['id'], 'audio', filename=c['audio_file_path'])
            if full_path and full_path.exists():
                chapter_list.append({
                    'filename': str(full_path),
                    'title': c['title']
                })
            else:
                return JSONResponse({
                    "error": f"Chapter '{c['title']}' audio file not found"
                }, status_code=400)
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
    if cover_path and cover_path.startswith(f'/projects/{project_id}/'):
        # If it's a nested path like '/projects/PID/cover/cover.jpg', we resolve via ctx
        filename = cover_path.split('/')[-1]
        cover_p = ctx.cover_dir / filename
        if cover_p.exists() and storage.is_safe(cover_p):
            cover_path = str(cover_p)
        else:
            cover_path = None
    else:
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

    orchestrator = create_orchestrator()
    out_file = m4b_dir / f"{unique_filename}.m4b"
    task = AssemblyTask(
        task_id=jid,
        output_path=out_file,
        project_id=project_id,
        is_audiobook=True,
        book_title=book_title,
        author=project.get('author', ''),
        narrator="Generated by Audiobook Studio",
        chapters=chapter_list,
        cover_path=Path(cover_path) if cover_path else None
    )
    background_tasks.add_task(orchestrator.submit, task)

    return JSONResponse({"status": "ok", "job_id": jid})
