"""Pronunciation lexicon CRUD routes.

Mounted under /api/projects/{project_id}/lexicon by the projects router.

All endpoints validate that the project exists before operating on the
lexicon table, consistent with other project-scoped resources.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Form
from fastapi.responses import JSONResponse

from ...db import get_project, get_lexicon, add_lexicon_entry, update_lexicon_entry, delete_lexicon_entry

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/projects/{project_id}/lexicon")
def api_get_lexicon(project_id: str):
    """List all lexicon entries for a project."""
    p = get_project(project_id)
    if not p:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    entries = get_lexicon(project_id)
    return JSONResponse({"status": "ok", "entries": entries})


@router.post("/projects/{project_id}/lexicon")
def api_create_lexicon_entry(
    project_id: str,
    word: str = Form(...),
    replacement: str = Form(...),
):
    """Create a new lexicon entry for a project."""
    p = get_project(project_id)
    if not p:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    try:
        entry_id = add_lexicon_entry(project_id, word, replacement)
    except ValueError as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=400)
    return JSONResponse({"status": "ok", "id": entry_id})


@router.put("/projects/{project_id}/lexicon/{entry_id}")
def api_update_lexicon_entry(
    project_id: str,
    entry_id: str,
    word: Optional[str] = Form(None),
    replacement: Optional[str] = Form(None),
):
    """Update an existing lexicon entry."""
    p = get_project(project_id)
    if not p:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    ok = update_lexicon_entry(entry_id, word=word, replacement=replacement)
    if not ok:
        return JSONResponse({"status": "error", "message": "Entry not found"}, status_code=404)
    return JSONResponse({"status": "ok"})


@router.delete("/projects/{project_id}/lexicon/{entry_id}")
def api_delete_lexicon_entry(project_id: str, entry_id: str):
    """Delete a lexicon entry."""
    p = get_project(project_id)
    if not p:
        return JSONResponse({"status": "error", "message": "Project not found"}, status_code=404)
    ok = delete_lexicon_entry(entry_id)
    if not ok:
        return JSONResponse({"status": "error", "message": "Entry not found"}, status_code=404)
    return JSONResponse({"status": "ok"})
