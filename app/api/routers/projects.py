import time
import json
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Form, File, UploadFile
from fastapi.responses import JSONResponse

from ...db import (
    create_project,
    get_project,
    list_projects,
    update_project,
    delete_project,
    reorder_chapters,
)
from ...core.config import get_project_dir
from ...core.constants import DEFAULT_VOICE_SENTINEL

from .projects_helpers import _store_project_cover
from .projects_backups import router as backups_router
from .projects_assembly import router as assembly_router

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _schedule_segment_gc(project_id: str) -> None:
    """Run the per-project segment GC pass.  Called as a BackgroundTask.

    Errors are logged and swallowed — a GC failure must never surface to the
    request that triggered the book-open.
    """
    try:
        from app.db.segment_gc import reconcile_orphan_segment_files_for_project  # noqa: PLC0415

        reconcile_orphan_segment_files_for_project(project_id)
    except Exception:
        logger.warning(
            "segment_gc: background sweep failed for project %s", project_id, exc_info=True
        )

# Include sub-routers for backups and assembly
router.include_router(backups_router)
router.include_router(assembly_router)


@router.get("")
def api_list_projects():
    projects = list_projects()
    return JSONResponse(projects)


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
def api_get_project(project_id: str, background_tasks: BackgroundTasks):
    fetch_started_at = time.perf_counter()
    p = get_project(project_id)
    fetch_ms = round((time.perf_counter() - fetch_started_at) * 1000)
    if fetch_ms >= 100:
        logger.info("Project detail DB fetch timing project=%s ms=%s", project_id, fetch_ms)

    if not p:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    background_tasks.add_task(_schedule_segment_gc, project_id)
    total_ms = round((time.perf_counter() - fetch_started_at) * 1000)
    if total_ms >= 100:
        logger.info("Project detail total timing project=%s ms=%s", project_id, total_ms)
    return JSONResponse(p)


@router.post("")
async def api_create_project(
    name: str = Form(...),
    series: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    speaker_profile_name: Optional[str] = Form(None),
    cover: Optional[UploadFile] = File(None)
):
    normalized_profile_name = (speaker_profile_name or "").strip() or None
    pid = create_project(name, series, author, None, normalized_profile_name)
    if cover:
        cover_path = await _store_project_cover(pid, cover)
        update_project(pid, cover_image_path=cover_path)
    return JSONResponse({"status": "ok", "project_id": pid})


@router.put("/{project_id}")
async def api_update_project(
    project_id: str,
    name: Optional[str] = Form(None),
    series: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    speaker_profile_name: Optional[str] = Form(None),
    cover: Optional[UploadFile] = File(None)
):
    p = get_project(project_id)
    if not p:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)

    updates = {}
    if name is not None: updates["name"] = name
    if series is not None: updates["series"] = series
    if author is not None: updates["author"] = author
    if speaker_profile_name is not None:
        normalized_profile_name = (speaker_profile_name.strip() or None)
        if normalized_profile_name == DEFAULT_VOICE_SENTINEL:
            normalized_profile_name = None
        updates["speaker_profile_name"] = normalized_profile_name

    if cover:
        updates["cover_image_path"] = await _store_project_cover(project_id, cover)

    if updates:
        update_project(project_id, **updates)

    return JSONResponse({"status": "ok", "project_id": project_id})


@router.delete("/{project_id}")
def api_delete_project(project_id: str):
    success = delete_project(project_id)
    if success:
        return JSONResponse({"status": "ok"})
    return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
