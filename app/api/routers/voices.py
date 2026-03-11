import uuid
import os
import shutil
import time
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Form, File, UploadFile
from fastapi.responses import JSONResponse
from ...db import (
    get_characters, create_character, update_character, delete_character,
    list_speakers, create_speaker, get_speaker, update_speaker, delete_speaker,
    update_voice_profile_references
)
from ... import config
from ...state import get_settings, update_settings
from ...jobs import get_speaker_settings, update_speaker_settings, enqueue
from ...models import Job
from ...state import put_job, update_job

router = APIRouter(prefix="/api", tags=["voices"])

@router.get("/speaker-profiles")
def list_speaker_profiles():
    if not config.VOICES_DIR.exists():
        return []

    dirs = sorted([d for d in config.VOICES_DIR.iterdir() if d.is_dir()], key=lambda x: x.name)
    settings = get_settings()
    default_speaker = settings.get("default_speaker_profile")

    # Auto-set default if only one exists
    if dirs:
        names = [d.name for d in dirs]
        if len(dirs) == 1 and default_speaker != names[0]:
            default_speaker = names[0]
            update_settings({"default_speaker_profile": default_speaker})
        elif default_speaker and default_speaker not in names:
            default_speaker = names[0] if len(dirs) > 0 else None
            update_settings({"default_speaker_profile": default_speaker})

    profiles = []
    for d in dirs:
        raw_wavs = sorted([f.name for f in d.glob("*.wav") if f.name != "sample.wav"])
        spk_settings = get_speaker_settings(d.name)
        built_samples = spk_settings.get("built_samples", [])

        samples = []
        is_rebuild_required = False
        for w in raw_wavs:
            is_new = w not in built_samples
            samples.append({"name": w, "is_new": is_new})
            if is_new: is_rebuild_required = True

        if len([b for b in built_samples if (d / b).exists()]) < len(built_samples):
             is_rebuild_required = True

        test_wav = config.VOICES_DIR / d.name / "sample.wav"
        if not test_wav.exists() and len(raw_wavs) > 0:
            is_rebuild_required = True

        profiles.append({
            "name": d.name,
            "is_default": d.name == default_speaker,
            "wav_count": len(raw_wavs),
            "samples_detailed": samples,
            "samples": raw_wavs,
            "is_rebuild_required": is_rebuild_required,
            "speed": spk_settings["speed"],
            "test_text": spk_settings["test_text"],
            "speaker_id": spk_settings.get("speaker_id"),
            "variant_name": spk_settings.get("variant_name"),
            "preview_url": f"/out/voices/{d.name}/sample.wav" if test_wav.exists() else None
        })
    return profiles

@router.post("/speaker-profiles")
def api_create_speaker_profile(
    speaker_id: str = Form(...),
    variant_name: str = Form(...)
):
    name = f"{speaker_id}_{variant_name}"
    path = config.VOICES_DIR / name
    if path.exists():
        return JSONResponse({"status": "error", "message": "Profile already exists"}, status_code=400)

    path.mkdir(parents=True, exist_ok=True)
    update_speaker_settings(name, speaker_id=speaker_id, variant_name=variant_name)
    return JSONResponse({"status": "ok", "name": name})

@router.get("/projects/{project_id}/characters")
def api_list_characters(project_id: str):
    return JSONResponse(get_characters(project_id))

@router.post("/projects/{project_id}/characters")
def api_create_character_route(project_id: str, name: str = Form(...), speaker_profile_name: Optional[str] = Form(None)):
    cid = create_character(project_id, name, speaker_profile_name)
    return JSONResponse({"status": "ok", "id": cid, "character_id": cid})

@router.put("/characters/{character_id}")
def api_update_character_route(character_id: str, name: Optional[str] = Form(None), speaker_profile_name: Optional[str] = Form(None), color: Optional[str] = Form(None)):
    updates = {}
    if name is not None: updates["name"] = name
    if speaker_profile_name is not None: updates["speaker_profile_name"] = speaker_profile_name
    if color is not None: updates["color"] = color
    update_character(character_id, **updates)
    return JSONResponse({"status": "ok"})

@router.delete("/characters/{character_id}")
def api_delete_character_route(character_id: str):
    delete_character(character_id)
    return JSONResponse({"status": "ok"})

@router.get("/speakers")
def api_list_speakers_route():
    return JSONResponse(list_speakers())

@router.post("/speakers")
def api_create_speaker_route(name: str = Form(...), default_profile_name: Optional[str] = Form(None)):
    sid = create_speaker(name, default_profile_name)
    return JSONResponse({"status": "ok", "id": sid, "speaker_id": sid})

@router.put("/speakers/{speaker_id}")
def api_update_speaker_route(speaker_id: str, name: Optional[str] = Form(None), default_profile_name: Optional[str] = Form(None)):
    updates = {}
    if name is not None: updates["name"] = name
    if default_profile_name is not None: updates["default_profile_name"] = default_profile_name
    update_speaker(speaker_id, **updates)
    return JSONResponse({"status": "ok"})

@router.delete("/speakers/{speaker_id}")
def api_delete_speaker_route(speaker_id: str):
    delete_speaker(speaker_id)
    return JSONResponse({"status": "ok"})

@router.post("/voices/rename-profile")
def api_rename_voice_profile(old_name: str = Form(...), new_name: str = Form(...)):
    import json
    old_dir = config.VOICES_DIR / old_name
    new_dir = config.VOICES_DIR / new_name
    if old_dir.exists() and not new_dir.exists():
        os.rename(old_dir, new_dir)
        update_voice_profile_references(old_name, new_name)

        # Sync settings
        settings = get_settings()
        if settings.get("default_speaker_profile") == old_name:
            update_settings({"default_speaker_profile": new_name})

        # Update profile.json if it exists
        meta_path = new_dir / "profile.json"
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text())
                # If renaming a variant profile (e.g. "Sally - Happy" -> "Sally - Excited")
                # find the dash and update variant_name
                if " - " in new_name:
                    meta["variant_name"] = new_name.split(" - ", 1)[1]
                meta_path.write_text(json.dumps(meta, indent=2))
            except: pass

        return JSONResponse({"status": "ok", "new_name": new_name})
    return JSONResponse({"status": "error", "message": "Directory rename failed"}, status_code=400)

@router.post("/speaker-profiles/{name}/test-text")
def update_speaker_test_text(name: str, text: str = Form(...)):
    update_speaker_settings(name, test_text=text)
    return JSONResponse({"status": "ok", "test_text": text})

@router.post("/speaker-profiles/{name}/speed")
def update_speaker_speed(name: str, speed: float = Form(...)):
    update_speaker_settings(name, speed=speed)
    return JSONResponse({"status": "ok", "speed": speed})

@router.post("/speaker-profiles/{name}/build")
async def build_speaker_profile(
    name: str,
    files: List[UploadFile] = File(default=[])
):
    path = config.VOICES_DIR / name
    path.mkdir(parents=True, exist_ok=True)

    saved_files = []
    for f in files:
        if not f.filename: continue
        content = await f.read()
        dest = path / f.filename
        dest.write_bytes(content)
        saved_files.append(f.filename)

    # Create build job
    jid = f"build-{uuid.uuid4().hex[:8]}"
    j = Job(
        id=jid,
        engine="voice_build",
        chapter_file="", # Required by model
        status="queued",
        created_at=time.time(),
        speaker_profile=name
    )
    put_job(j)
    enqueue(j)
    return JSONResponse({"status": "ok", "job_id": jid})

@router.post("/speaker-profiles/{name}/rename")
def api_rename_voice_profile_path(name: str, new_name: str = Form(...)):
    from .voices import api_rename_voice_profile
    return api_rename_voice_profile(old_name=name, new_name=new_name)

@router.post("/speaker-profiles/build")
async def legacy_build_speaker_profile(
    name: str = Form(...),
    files: List[UploadFile] = File(default=[])
):
    return await build_speaker_profile(name, files)

@router.post("/speaker-profiles/test")
def legacy_test_speaker_profile(name: str = Form(...)):
    return test_speaker_profile(name)

@router.delete("/speaker-profiles/{name}")
def delete_speaker_profile(name: str):
    path = config.VOICES_DIR / name
    if path.exists():
        shutil.rmtree(path)
        return JSONResponse({"status": "ok"})
    return JSONResponse({"status": "error", "message": "Not found"}, status_code=404)

@router.post("/speaker-profiles/{name}/test")
def test_speaker_profile(name: str):
    jid = f"test-{uuid.uuid4().hex[:8]}"
    j = Job(
        id=jid,
        engine="voice_test",
        chapter_file="", # Required by model
        status="queued",
        created_at=time.time(),
        speaker_profile=name
    )
    put_job(j)
    enqueue(j)
    return JSONResponse({"status": "ok", "job_id": jid})
