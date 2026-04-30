import json
import logging
from typing import Optional

from fastapi import APIRouter, Form, File, UploadFile
from fastapi.responses import JSONResponse

from ...db import (
    create_project,
    get_project,
    list_projects,
    update_project,
    delete_project,
    reorder_chapters,
)
from ...config import get_project_dir, find_existing_project_dir
from ...constants import DEFAULT_VOICE_SENTINEL
from ...domain.projects.migration import migrate_project_to_v2

from .projects_helpers import _store_project_cover
from .projects_backups import router as backups_router
from .projects_assembly import router as assembly_router

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])

# Include sub-routers for backups and assembly
router.include_router(backups_router)
router.include_router(assembly_router)


@router.get("")
def api_list_projects():
    projects = list_projects()
    for p in projects:
        migrate_project_to_v2(p["id"])
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
def api_get_project(project_id: str):
    migrate_project_to_v2(project_id)
    p = get_project(project_id)
    if not p:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
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
        cover_path = await _store_project_cover(pid, get_project_dir(pid), cover)
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
