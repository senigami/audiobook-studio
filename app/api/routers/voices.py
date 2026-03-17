import uuid
import os
import shutil
import time
import anyio
import logging
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
from ...state import get_settings, update_settings, get_jobs, put_job, update_job
from ...jobs import get_speaker_settings, update_speaker_settings, enqueue
from ...models import Job
from fastapi import Depends

# Compatibility for tests that monkeypatch these
VOICES_DIR = config.VOICES_DIR

logger = logging.getLogger(__name__)


def get_voices_dir() -> Path:
    return VOICES_DIR

router = APIRouter(prefix="/api", tags=["voices"])

@router.get("/speaker-profiles")
def list_speaker_profiles(voices_dir: Path = Depends(get_voices_dir)):
    if not voices_dir.exists():
        return []

    dirs = sorted([d for d in voices_dir.iterdir() if d.is_dir()], key=lambda x: x.name)
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

        test_wav = voices_dir / d.name / "sample.wav"
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
    variant_name: str = Form(...),
    voices_dir: Path = Depends(get_voices_dir)
):
    logger.info(f"Creating profile for speaker_id='{speaker_id}', variant_name='{variant_name}'")
    try:
        # Try to use speaker name instead of ID if possible for folder name
        spk = get_speaker(speaker_id)
        spk_name = spk["name"] if spk else speaker_id
        name = f"{spk_name} - {variant_name}"
        # Constructed path
        path = (voices_dir / name).resolve()

        # Security: verify it's within voices_dir
        if not path.is_relative_to(voices_dir.resolve()):
            logger.warning(f"Blocking profile creation traversal attempt: {name}")
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)

        if path.exists():
            return JSONResponse({"status": "error", "message": "Profile already exists"}, status_code=400)

        path.mkdir(parents=True, exist_ok=True)
        # Record speaker_id (could be a UUID or a name for unassigned)
        update_speaker_settings(name, speaker_id=speaker_id, variant_name=variant_name)
        return JSONResponse({"status": "ok", "name": name})
    except Exception as e:
        logger.error(f"Error creating profile {speaker_id}/{variant_name}: {e}")
        return JSONResponse({"status": "error", "message": "Creation failed"}, status_code=500)

@router.get("/projects/{project_id}/characters")
def api_list_characters(project_id: str):
    return JSONResponse({"status": "ok", "characters": get_characters(project_id)})

@router.post("/projects/{project_id}/characters")
def api_create_character_route(
    project_id: str, 
    name: str = Form(...), 
    speaker_profile_name: Optional[str] = Form(None),
    color: Optional[str] = Form(None)
):
    cid = create_character(project_id, name, speaker_profile_name, color=color)
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
@router.post("/speakers/{speaker_id}")
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

@router.post("/speaker-profiles/{profile_name}/assign")
def api_assign_profile_to_speaker(
    profile_name: str,
    speaker_id: Optional[str] = Form(None),
    voices_dir: Path = Depends(get_voices_dir)
):
    """Reassign a variant profile to a different speaker (or unassign it).
    This renames the folder to match the new speaker's naming, and updates profile.json.
    """
    import json as _json
    try:
        old_dir = (voices_dir / profile_name).resolve()
        if not old_dir.is_relative_to(voices_dir.resolve()):
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)
        if not old_dir.exists():
            return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

        # Determine the variant name from existing metadata or folder name
        variant_name = None
        meta_path = old_dir / "profile.json"
        meta = {}
        if meta_path.exists():
            try:
                meta = _json.loads(meta_path.read_text())
                variant_name = meta.get("variant_name")
            except Exception:
                pass

        if not variant_name:
            # Try to infer from folder name (e.g. "Speaker - Variant" -> "Variant")
            if " - " in profile_name:
                variant_name = profile_name.split(" - ", 1)[1]
            else:
                variant_name = profile_name

        # Determine the new folder name
        if speaker_id:
            # Get the speaker name if it's a UUID
            spk = get_speaker(speaker_id)
            spk_name = spk["name"] if spk else speaker_id
            new_profile_name = f"{spk_name} - {variant_name}"
        else:
            # Unassigning: keep variant name as the folder
            new_profile_name = variant_name

        new_dir = (voices_dir / new_profile_name).resolve()
        if not new_dir.is_relative_to(voices_dir.resolve()):
            return JSONResponse({"status": "error", "message": "Invalid target profile name"}, status_code=403)

        if new_dir.exists() and new_dir != old_dir:
            return JSONResponse({"status": "error", "message": "Target profile already exists"}, status_code=400)

        # Rename the folder
        if new_dir != old_dir:
            os.rename(old_dir, new_dir)
            update_voice_profile_references(profile_name, new_profile_name)

        # Update profile.json with new speaker_id and variant_name
        new_meta_path = new_dir / "profile.json"
        meta.update({"speaker_id": speaker_id, "variant_name": variant_name})
        new_meta_path.write_text(_json.dumps(meta, indent=2))

        return JSONResponse({"status": "ok", "new_profile_name": new_profile_name})
    except Exception as e:
        logger.error(f"Error assigning profile {profile_name}: {e}")
        return JSONResponse({"status": "error", "message": "Assign failed"}, status_code=500)

@router.post("/voices/rename-profile")
def api_rename_voice_profile(
    old_name: str = Form(...),
    new_name: str = Form(...),
    voices_dir: Path = Depends(get_voices_dir)
):
    import json
    try:
        # Construct and resolve paths
        old_dir = (voices_dir / old_name).resolve()
        new_dir = (voices_dir / new_name).resolve()

        # Security: verify they are within voices_dir
        if not old_dir.is_relative_to(voices_dir.resolve()) or \
           not new_dir.is_relative_to(voices_dir.resolve()):
            logger.warning(f"Blocking profile rename traversal attempt: {old_name} -> {new_name}")
            return JSONResponse({"status": "error", "message": "Invalid path"}, status_code=403)

        if old_dir.exists() and not new_dir.exists():
            os.rename(old_dir, new_dir)
            update_voice_profile_references(old_name, new_name)

            # Sync settings
            settings = get_settings()
            if settings.get("default_speaker_profile") == old_name:
                update_settings({"default_speaker_profile": new_name})

            # Update profile.json if it exists (in the NEW location)
            meta_path = new_dir / "profile.json"
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text())
                    if " - " in new_name:
                        meta["variant_name"] = new_name.split(" - ", 1)[1]
                    meta_path.write_text(json.dumps(meta, indent=2))
                except Exception as e:
                    logger.error(f"Error updating metadata during rename: {e}")

            return JSONResponse({"status": "ok", "new_name": new_name})

        elif not old_dir.exists():
            # Try to find if this is a speaker base name that has variants
            variants = [d for d in voices_dir.iterdir() if d.is_dir() and d.name.startswith(old_name + " - ")]
            if variants:
                for vdir in variants:
                    suffix = vdir.name[len(old_name):]
                    new_vname = new_name + suffix
                    os.rename(vdir, voices_dir / new_vname)
                    update_voice_profile_references(vdir.name, new_vname)
                # If we renamed variants, we consider it a success
                return JSONResponse({"status": "ok", "new_name": new_name})
            else:
                logger.warning(f"Profile rename failed: {old_name} not found")
                return JSONResponse({"status": "error", "message": "Source profile not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Error during directory rename: {e}")

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
    files: List[UploadFile] = File(default=[]),
    voices_dir: Path = Depends(get_voices_dir)
):
    try:
        path = (voices_dir / name).resolve()
        if not path.is_relative_to(voices_dir.resolve()):
            logger.warning(f"Blocking profile build traversal attempt: {name}")
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)

        path.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.error(f"Error preparing path for profile {name}: {e}")
        return JSONResponse({"status": "error", "message": "Build failed"}, status_code=500)

    saved_files = []
    for f in files:
        if not f.filename:
            continue
        content = await f.read()
        dest = path / f.filename

        def save_file(data, target):
            target.write_bytes(data)

        await anyio.to_thread.run_sync(save_file, content, dest)
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

@router.post("/speaker-profiles/{name}/samples/upload")
async def upload_speaker_samples(
    name: str,
    files: List[UploadFile] = File(...),
    voices_dir: Path = Depends(get_voices_dir)
):
    try:
        path = (voices_dir / name).resolve()
        if not path.is_relative_to(voices_dir.resolve()):
            return JSONResponse({"status": "error", "message": "Invalid profile"}, status_code=403)

        path.mkdir(parents=True, exist_ok=True)

        for f in files:
            if not f.filename: continue
            content = await f.read()
            (path / f.filename).write_bytes(content)

        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Upload failed for {name}: {e}")
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@router.delete("/speaker-profiles/{name}/samples/{sample_name}")
def delete_speaker_sample(
    name: str,
    sample_name: str,
    voices_dir: Path = Depends(get_voices_dir)
):
    try:
        path = (voices_dir / name / sample_name).resolve()
        if not path.is_relative_to(voices_dir.resolve()):
            return JSONResponse({"status": "error", "message": "Invalid path"}, status_code=403)

        if path.exists():
            path.unlink()
            return JSONResponse({"status": "ok"})
        return JSONResponse({"status": "error", "message": "File not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Delete failed for {name}/{sample_name}: {e}")
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@router.post("/speaker-profiles/{name}/rename")
def api_rename_voice_profile_path(
    name: str,
    new_name: str = Form(...),
    voices_dir: Path = Depends(get_voices_dir)
):
    return api_rename_voice_profile(
        old_name=name,
        new_name=new_name,
        voices_dir=voices_dir
    )

@router.post("/speaker-profiles/build")
async def legacy_build_speaker_profile(
    name: str = Form(...),
    files: List[UploadFile] = File(default=[]),
    voices_dir: Path = Depends(get_voices_dir)
):
    return await build_speaker_profile(name, files, voices_dir=voices_dir)

@router.post("/speaker-profiles/test")
def legacy_test_speaker_profile(name: str = Form(...)):
    return test_speaker_profile(name)

@router.delete("/speaker-profiles/{name}")
def delete_speaker_profile(
    name: str,
    voices_dir: Path = Depends(get_voices_dir)
):
    try:
        path = (voices_dir / name).resolve()
        if not path.is_relative_to(voices_dir.resolve()):
            logger.warning(f"Blocking profile delete traversal attempt: {name}")
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)

        if path.exists():
            shutil.rmtree(path)
            return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Error deleting profile {name}: {e}")
        return JSONResponse({"status": "error", "message": "Delete failed"}, status_code=500)

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
    return JSONResponse({
        "status": "ok", 
        "job_id": jid,
        "audio_url": f"/out/voices/{name}/sample.wav"
    })
