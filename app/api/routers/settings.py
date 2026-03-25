import json
import subprocess
import shlex
import time
import re
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from ...config import AUDIOBOOK_DIR, PROJECTS_DIR
from ...state import get_jobs, put_job, update_job
from ...jobs import enqueue
from ...models import Job
from ..utils import list_audiobooks
router = APIRouter(prefix="/api", tags=["settings"])
SAFE_AUDIOBOOK_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")


def _find_named_file(base_dir: Path, filename: str) -> Optional[Path]:
    if not SAFE_AUDIOBOOK_NAME_RE.fullmatch(filename):
        raise ValueError(f"Invalid filename: {filename}")
    if not base_dir.exists():
        return None
    for entry in base_dir.iterdir():
        if entry.is_file() and entry.name == filename:
            return entry.resolve()
    return None

@router.get("/audiobooks")
def api_list_audiobooks():
    return JSONResponse(list_audiobooks())

@router.delete("/audiobook/{filename}")
def delete_audiobook(filename: str, project_id: Optional[str] = Query(None)):
    from ...config import get_project_m4b_dir
    path = None
    if project_id:
        try:
            path = _find_named_file(get_project_m4b_dir(project_id), filename)
        except (ValueError, TypeError):
            return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=403)

    if not path:
        try:
            path = _find_named_file(AUDIOBOOK_DIR, filename)
        except (ValueError, TypeError):
            return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=403)

    if not path and not project_id:
        for p_dir in PROJECTS_DIR.iterdir():
            if p_dir.is_dir():
                try:
                    possible = _find_named_file(p_dir / "m4b", filename)
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

@router.post("/trigger_backfill")
def api_trigger_backfill():
    # Logic to trigger backfill
    return JSONResponse({"status": "ok"})
