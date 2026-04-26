import logging
from typing import Optional
from fastapi import APIRouter, Form, Request
from fastapi.responses import JSONResponse
from ... import db

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/projects/{project_id}/characters")
def api_list_characters(project_id: str):
    return JSONResponse({"status": "ok", "characters": db.get_characters(project_id)})

@router.post("/projects/{project_id}/characters")
def api_create_character_route(
    project_id: str,
    name: str = Form(...),
    speaker_profile_name: Optional[str] = Form(None),
    color: Optional[str] = Form(None)
):
    normalized_profile_name = (speaker_profile_name or "").strip() or None
    cid = db.create_character(project_id, name, normalized_profile_name, color=color)
    return JSONResponse({"status": "ok", "id": cid, "character_id": cid})

@router.put("/characters/{character_id}")
async def api_update_character_route(
    character_id: str,
    request: Request,
    name: Optional[str] = Form(None),
    speaker_profile_name: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
):
    updates = {}
    if name is not None: updates["name"] = name
    form = await request.form()
    if "speaker_profile_name" in form:
        updates["speaker_profile_name"] = (str(form.get("speaker_profile_name") or "").strip() or None)
    if color is not None: updates["color"] = color
    db.update_character(character_id, **updates)
    return JSONResponse({"status": "ok"})

@router.delete("/characters/{character_id}")
def api_delete_character_route(character_id: str):
    db.delete_character(character_id)
    return JSONResponse({"status": "ok"})
