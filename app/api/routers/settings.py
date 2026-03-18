import json
import subprocess
import shlex
import time
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from ...config import AUDIOBOOK_DIR, PROJECTS_DIR
from ...state import get_jobs, put_job, update_job
from ...jobs import enqueue
from ...models import Job
from ..utils import list_audiobooks
from ...pathing import safe_join

router = APIRouter(prefix="/api", tags=["settings"])

@router.get("/audiobooks")
def api_list_audiobooks():
    return JSONResponse(list_audiobooks())

@router.delete("/audiobook/{filename}")
def delete_audiobook(filename: str, project_id: Optional[str] = Query(None)):
    from ...config import get_project_m4b_dir
    path = None
    if project_id:
        try:
            p_path = safe_join(get_project_m4b_dir(project_id), filename)
            if p_path.exists():
                path = p_path
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=403)

    if not path:
        try:
            l_path = safe_join(AUDIOBOOK_DIR, filename)
            if l_path.exists():
                path = l_path
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=403)

    if not path and not project_id:
        for p_dir in PROJECTS_DIR.iterdir():
            if p_dir.is_dir():
                try:
                    possible = safe_join(p_dir / "m4b", filename)
                    if possible.exists():
                        path = possible
                        break
                except ValueError:
                    continue

    if path and path.exists():
        path.unlink()
        jpg_path = path.with_suffix(".jpg")
        if jpg_path.exists(): jpg_path.unlink()
        return JSONResponse({"status": "ok", "message": f"Deleted {filename}"})

    return JSONResponse({"status": "error", "message": "File not found"}, status_code=404)

@router.post("/trigger_backfill")
def api_trigger_backfill():
    # Logic to trigger backfill
    return JSONResponse({"status": "ok"})
