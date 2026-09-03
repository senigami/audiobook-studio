import logging
from typing import Optional
from fastapi import APIRouter, Form
from fastapi.responses import JSONResponse
from . import voices_management
from ... import db

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/speakers")
def api_list_speakers_route():
    db.speakers.sync_speakers_from_profiles()
    return JSONResponse(db.list_speakers())

@router.post("/speakers")
def api_create_speaker_route(name: str = Form(...), default_profile_name: Optional[str] = Form(None)):
    sid = db.create_speaker(name, default_profile_name)
    linked_profile_name = voices_management._ensure_default_speaker_profile(sid, name, default_profile_name)
    if linked_profile_name != default_profile_name:
        db.update_speaker(sid, default_profile_name=linked_profile_name)
    return JSONResponse({"status": "ok", "id": sid, "speaker_id": sid})

@router.put("/speakers/{speaker_id}")
@router.post("/speakers/{speaker_id}")
@router.patch("/speakers/{speaker_id}")
def api_update_speaker_route(
    speaker_id: str,
    name: Optional[str] = Form(None),
    new_name: Optional[str] = Form(None), # Alias for name
    default_profile_name: Optional[str] = Form(None),
):
    old_spk = db.get_speaker(speaker_id)
    if not old_spk:
        return JSONResponse({"status": "error", "message": "Speaker not found"}, status_code=404)

    updates = {}
    target_name = name or new_name
    if target_name is not None: updates["name"] = target_name
    if default_profile_name is not None: updates["default_profile_name"] = default_profile_name

    db.update_speaker(speaker_id, **updates)

    if target_name and target_name != old_spk["name"]:
        # Renaming narrator: rename all profile directories on disk
        voices_management._rename_profile_folders(old_spk["name"], target_name)

    return JSONResponse({"status": "ok"})

@router.delete("/speakers/{speaker_id}")
def api_delete_speaker_route(speaker_id: str):
    db.delete_speaker(speaker_id)
    return JSONResponse({"status": "ok"})
