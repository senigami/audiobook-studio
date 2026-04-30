import json
import subprocess
import shlex
import time
import re
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from ...config import AUDIOBOOK_DIR, PROJECTS_DIR, find_existing_project_subdir
from ...state import get_jobs, put_job, update_job
from ...jobs import enqueue
from ...models import Job
from ..utils import list_audiobooks
router = APIRouter(prefix="/api", tags=["settings"])
SAFE_AUDIOBOOK_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")

@router.get("/audiobooks")
def api_list_audiobooks():
    return JSONResponse(list_audiobooks())

@router.delete("/audiobook/{filename}")
def delete_audiobook(filename: str, project_id: Optional[str] = Query(None)):
    path = None
    if project_id:
        try:
            if not SAFE_AUDIOBOOK_NAME_RE.fullmatch(filename):
                raise ValueError(f"Invalid filename: {filename}")
            project_m4b_dir = find_existing_project_subdir(project_id, "m4b")
            if project_m4b_dir and project_m4b_dir.exists():
                path = next(
                    (entry.resolve() for entry in project_m4b_dir.iterdir() if entry.is_file() and entry.name == filename),
                    None
                )
        except (ValueError, TypeError):
            return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=403)

    if not path:
        try:
            if not SAFE_AUDIOBOOK_NAME_RE.fullmatch(filename):
                raise ValueError(f"Invalid filename: {filename}")
            if AUDIOBOOK_DIR.exists():
                path = next(
                    (entry.resolve() for entry in AUDIOBOOK_DIR.iterdir() if entry.is_file() and entry.name == filename),
                    None
                )
        except (ValueError, TypeError):
            return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=403)

    if not path and not project_id:
        for p_dir in PROJECTS_DIR.iterdir():
            if p_dir.is_dir():
                try:
                    if not SAFE_AUDIOBOOK_NAME_RE.fullmatch(filename):
                        raise ValueError(f"Invalid filename: {filename}")
                    m4b_dir = p_dir / "m4b"
                    possible = next(
                        (entry.resolve() for entry in m4b_dir.iterdir() if entry.is_file() and entry.name == filename),
                        None
                    ) if m4b_dir.exists() else None
                    if possible:
                        path = possible
                        break
                except (ValueError, TypeError):
                    continue

    if path and path.exists():
        path.unlink()
        jpg_path = path.with_suffix(".jpg")
        if jpg_path.exists(): jpg_path.unlink()
        return JSONResponse({"status": "ok", "message": f"Deleted {filename}"})

    return JSONResponse({"status": "error", "message": "File not found"}, status_code=404)


