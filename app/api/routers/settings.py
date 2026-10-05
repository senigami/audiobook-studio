import json
import subprocess
import shlex
import time
import re
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from ...core.config import PROJECTS_DIR, get_project_m4b_dir
from ...db.state import get_jobs, put_job, update_job

from ...db.models import Job
from ..utils import list_audiobooks
router = APIRouter(prefix="/api", tags=["settings"])
SAFE_AUDIOBOOK_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")

@router.get("/audiobooks")
def api_list_audiobooks():
    return JSONResponse(list_audiobooks())

@router.delete("/audiobook/{filename}")
def delete_audiobook(filename: str, project_id: Optional[str] = Query(None)):
    from ...storage.manager import get_storage_manager
    storage = get_storage_manager()
    path = None

    if project_id:
        try:
            if not SAFE_AUDIOBOOK_NAME_RE.fullmatch(filename):
                raise ValueError(f"Invalid filename: {filename}")
            ctx = storage.get_project_context(project_id)
            project_m4b_dir = ctx.m4b_dir
            if project_m4b_dir.exists():
                cand = project_m4b_dir / filename
                if cand.exists() and storage.is_safe(cand):
                    path = cand
        except (ValueError, TypeError):
            return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=403)

    if not path and not project_id:
        # Search all projects (Global list)
        for project_id_cand in storage.list_projects():
             try:
                 ctx = storage.get_project_context(project_id_cand)
                 m4b_dir = ctx.m4b_dir
                 if m4b_dir.exists():
                     cand = m4b_dir / filename
                     if cand.exists() and storage.is_safe(cand):
                         path = cand
                         break
             except ValueError:
                 continue

    if path and path.exists() and storage.is_safe(path):
        path.unlink()
        # Clean up sidecar files
        for ext in [".jpg", ".png", ".jpeg", ".webp", ".description"]:
            sidecar = path.with_suffix(ext)
            if sidecar.exists() and storage.is_safe(sidecar):
                sidecar.unlink()
        return JSONResponse({"status": "ok", "message": f"Deleted {filename}"})

    return JSONResponse({"status": "error", "message": "File not found"}, status_code=404)

