import uuid
import shutil
import time
import anyio
import logging
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, Form, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from ...db import (
    get_characters, create_character, update_character, delete_character,
    list_speakers, create_speaker, get_speaker, update_speaker, delete_speaker,
    update_voice_profile_references
)
from ...db.speakers import infer_variant_name, normalize_profile_metadata
from ...jobs import (
    enqueue, get_speaker_settings, update_speaker_settings, 
    DEFAULT_SPEAKER_TEST_TEXT
)
from ... import config
from ...state import get_settings, update_settings, get_jobs, put_job, update_job
from ...models import Job
from ...pathing import safe_basename, safe_join, safe_join_flat

# Compatibility for tests that monkeypatch these
VOICES_DIR = config.VOICES_DIR

logger = logging.getLogger(__name__)


def get_voices_dir() -> Path:
    return VOICES_DIR


def _voice_profile_dir(voices_dir: Path, name: str) -> Path:
    return safe_join(voices_dir, name)


def _voice_sample_path(voices_dir: Path, name: str, sample_name: str) -> Path:
    return safe_join(_voice_profile_dir(voices_dir, name), sample_name)


def _voice_raw_sample_count(voices_dir: Path, name: str) -> int:
    try:
        profile_dir = _voice_profile_dir(voices_dir, name)
    except ValueError:
        return 0
    if not profile_dir.exists():
        return 0
    return len([f for f in profile_dir.glob("*.wav") if f.name != "sample.wav"])


def _voice_preview_url(voices_dir: Path, name: str) -> Optional[str]:
    profile_dir = _voice_profile_dir(voices_dir, name)
    mp3_path = safe_join_flat(profile_dir, "sample.mp3")
    if mp3_path.exists():
        return f"/out/voices/{name}/sample.mp3"

    wav_path = safe_join_flat(profile_dir, "sample.wav")
    if wav_path.exists():
        return f"/out/voices/{name}/sample.wav"

    return None

router = APIRouter(tags=["voices"])

@router.get("/api/speaker-profiles")
def list_speaker_profiles(voices_dir: Path = Depends(get_voices_dir)):
    if not voices_dir.exists():
        return []

    dirs = []
    for d in sorted(voices_dir.iterdir(), key=lambda x: x.name):
        if not d.is_dir():
            continue
        try:
            dirs.append(_voice_profile_dir(voices_dir, d.name))
        except ValueError:
            logger.warning("Skipping invalid voice profile directory %s", d, exc_info=True)
            continue
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

        if len([b for b in built_samples if safe_join_flat(d, b).exists()]) < len(built_samples):
             is_rebuild_required = True

        preview_url = _voice_preview_url(voices_dir, d.name)
        if not preview_url and len(raw_wavs) > 0:
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
            "preview_url": preview_url
        })
    return profiles

@router.post("/api/speaker-profiles")
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
        try:
            path = _voice_profile_dir(voices_dir, name)
        except ValueError:
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

@router.get("/api/projects/{project_id}/characters")
def api_list_characters(project_id: str):
    return JSONResponse({"status": "ok", "characters": get_characters(project_id)})

@router.post("/api/projects/{project_id}/characters")
def api_create_character_route(
    project_id: str, 
    name: str = Form(...), 
    speaker_profile_name: Optional[str] = Form(None),
    color: Optional[str] = Form(None)
):
    cid = create_character(project_id, name, speaker_profile_name, color=color)
    return JSONResponse({"status": "ok", "id": cid, "character_id": cid})

@router.put("/api/characters/{character_id}")
def api_update_character_route(character_id: str, name: Optional[str] = Form(None), speaker_profile_name: Optional[str] = Form(None), color: Optional[str] = Form(None)):
    updates = {}
    if name is not None: updates["name"] = name
    if speaker_profile_name is not None: updates["speaker_profile_name"] = speaker_profile_name
    if color is not None: updates["color"] = color
    update_character(character_id, **updates)
    return JSONResponse({"status": "ok"})

@router.delete("/api/characters/{character_id}")
def api_delete_character_route(character_id: str):
    delete_character(character_id)
    return JSONResponse({"status": "ok"})

@router.get("/api/speakers")
def api_list_speakers_route():
    return JSONResponse(list_speakers())

@router.post("/api/speakers")
def api_create_speaker_route(name: str = Form(...), default_profile_name: Optional[str] = Form(None)):
    sid = create_speaker(name, default_profile_name)
    return JSONResponse({"status": "ok", "id": sid, "speaker_id": sid})

def _rename_profile_folders(old_name: str, new_name: str, voices_dir: Path):
    """Helper to rename all profile folders on disk starting with a speaker name."""
    try:
        old_dir = _voice_profile_dir(voices_dir, old_name)
        new_dir = _voice_profile_dir(voices_dir, new_name)
    except ValueError:
        logger.warning(f"Blocking profile rename traversal attempt: {old_name} -> {new_name}")
        raise HTTPException(status_code=403, detail="Invalid profile name")

    # 1. Exact match (unassigned profile or narrator-identical name)
    if old_dir.exists() and not new_dir.exists():
        old_dir.rename(new_dir)
        update_voice_profile_references(old_name, new_name)
        # Update meta if exists
        meta_path = safe_join_flat(new_dir, "profile.json")
        if meta_path.exists():
            try:
                import json
                meta = json.loads(meta_path.read_text())
                if " - " in new_name:
                    meta["variant_name"] = new_name.split(" - ", 1)[1]
                # Only update speaker_id if it was the old name (unassigned case)
                if meta.get("speaker_id") == old_name:
                    meta["speaker_id"] = new_name
                meta_path.write_text(json.dumps(meta, indent=2))
            except Exception:
                logger.warning("Failed to update profile metadata during rename: %s -> %s", old_name, new_name, exc_info=True)

    # 2. Variants (Narrator - Variant)
    variants = []
    for d in voices_dir.iterdir():
        if not d.is_dir() or not d.name.startswith(old_name + " - "):
            continue
        try:
            variants.append(_voice_profile_dir(voices_dir, d.name))
        except ValueError:
            logger.warning("Skipping invalid variant directory %s", d, exc_info=True)
            continue
    for vdir in variants:
        suffix = vdir.name[len(old_name):]
        new_vname = new_name + suffix
        new_vpath = _voice_profile_dir(voices_dir, new_vname)
        if not new_vpath.exists():
            vdir.rename(new_vpath)
            update_voice_profile_references(vdir.name, new_vname)
            # Update meta
            meta_path = safe_join_flat(new_vpath, "profile.json")
            if meta_path.exists():
                try:
                    import json
                    meta = json.loads(meta_path.read_text())
                    # Ensure metadata speaker_id stays correct if it was a UUID, or updates to new name if unassigned
                    if meta.get("speaker_id") == old_name:
                        meta["speaker_id"] = new_name
                    meta_path.write_text(json.dumps(meta, indent=2))
                except Exception:
                    logger.warning("Failed to update variant metadata during rename: %s -> %s", vdir.name, new_vname, exc_info=True)

@router.put("/api/speakers/{speaker_id}")
@router.post("/api/speakers/{speaker_id}")
@router.patch("/api/speakers/{speaker_id}")
def api_update_speaker_route(
    speaker_id: str, 
    name: Optional[str] = Form(None), 
    new_name: Optional[str] = Form(None), # Alias for name
    default_profile_name: Optional[str] = Form(None),
    voices_dir: Path = Depends(get_voices_dir)
):
    from ...db.speakers import get_speaker
    old_spk = get_speaker(speaker_id)
    if not old_spk:
        return JSONResponse({"status": "error", "message": "Speaker not found"}, status_code=404)

    updates = {}
    target_name = name or new_name
    if target_name is not None: updates["name"] = target_name
    if default_profile_name is not None: updates["default_profile_name"] = default_profile_name

    update_speaker(speaker_id, **updates)

    if target_name and target_name != old_spk["name"]:
        # Renaming narrator: rename all profile directories on disk
        _rename_profile_folders(old_spk["name"], target_name, voices_dir)

    return JSONResponse({"status": "ok"})

@router.delete("/api/speakers/{speaker_id}")
def api_delete_speaker_route(speaker_id: str):
    delete_speaker(speaker_id)
    return JSONResponse({"status": "ok"})

@router.post("/api/speaker-profiles/{profile_name}/assign")
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
        try:
            old_dir = _voice_profile_dir(voices_dir, profile_name)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)
        if not old_dir.exists():
            return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

        # Determine the variant name from existing metadata or folder name
        variant_name = None
        meta_path = safe_join_flat(old_dir, "profile.json")
        meta = {}
        if meta_path.exists():
            try:
                meta = _json.loads(meta_path.read_text())
                variant_name = meta.get("variant_name")
            except Exception:
                logger.debug("Failed to read metadata while assigning profile %s", profile_name, exc_info=True)

        if not variant_name:
            variant_name = infer_variant_name(profile_name)

        # Determine the new folder name
        if speaker_id:
            # Get the speaker name if it's a UUID
            spk = get_speaker(speaker_id)
            spk_name = spk["name"] if spk else speaker_id
            new_profile_name = f"{spk_name} - {variant_name}"
        else:
            # Unassigning: keep variant name as the folder
            new_profile_name = variant_name

        try:
            new_dir = _voice_profile_dir(voices_dir, new_profile_name)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid target profile name"}, status_code=403)

        if new_dir.exists() and new_dir != old_dir:
            return JSONResponse({"status": "error", "message": "Target profile already exists"}, status_code=400)

        # Rename the folder
        if new_dir != old_dir:
            old_dir.rename(new_dir)
            update_voice_profile_references(profile_name, new_profile_name)

        # Update profile.json with new speaker_id and variant_name
        new_meta_path = safe_join_flat(new_dir, "profile.json")
        meta.update({"speaker_id": speaker_id, "variant_name": variant_name})
        normalized_meta = normalize_profile_metadata(new_profile_name, meta, persist=False)
        new_meta_path.write_text(_json.dumps(normalized_meta, indent=2))

        return JSONResponse({"status": "ok", "new_profile_name": new_profile_name})
    except Exception as e:
        logger.error(f"Error assigning profile {profile_name}: {e}")
        return JSONResponse({"status": "error", "message": "Assign failed"}, status_code=500)

@router.post("/api/voices/rename-profile")
def api_rename_voice_profile(
    old_name: str = Form(...),
    new_name: str = Form(...),
    voices_dir: Path = Depends(get_voices_dir)
):
    try:
        _rename_profile_folders(old_name, new_name, voices_dir)

        # Sync global settings
        settings = get_settings()
        if settings.get("default_speaker_profile") == old_name:
            update_settings({"default_speaker_profile": new_name})

        return JSONResponse({"status": "ok", "new_name": new_name})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during directory rename: {e}")
        return JSONResponse({"status": "error", "message": "Directory rename failed"}, status_code=400)

@router.post("/api/speaker-profiles/{name}/test-text")
def update_speaker_test_text(name: str, text: str = Form(...)):
    update_speaker_settings(name, test_text=text)
    return JSONResponse({"status": "ok", "test_text": text})

@router.post("/api/speaker-profiles/{name}/reset-test-text")
def reset_speaker_test_text(name: str):
    update_speaker_settings(name, test_text=None)
    return JSONResponse({"status": "ok", "test_text": DEFAULT_SPEAKER_TEST_TEXT})

@router.post("/api/speaker-profiles/{name}/speed")
def update_speaker_speed(name: str, speed: float = Form(...)):
    update_speaker_settings(name, speed=speed)
    return JSONResponse({"status": "ok", "speed": speed})

@router.post("/api/speaker-profiles/{name}/build")
async def build_speaker_profile(
    name: str,
    files: List[UploadFile] = File(default=[]),
    voices_dir: Path = Depends(get_voices_dir)
):
    try:
        try:
            path = _voice_profile_dir(voices_dir, name)
        except ValueError:
            logger.warning(f"Blocking profile build traversal attempt: {name}")
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)

        existing_raw_samples = _voice_raw_sample_count(voices_dir, name)
        if existing_raw_samples == 0 and not files:
            return JSONResponse(
                {"status": "error", "message": "Add at least one sample before building this voice."},
                status_code=400
            )

        path.mkdir(parents=True, exist_ok=True)

        # Clear existing sample if it exists to ensure accurate building status
        sample_path = safe_join_flat(path, "sample.wav")
        if sample_path.exists():
            sample_path.unlink()
    except Exception as e:
        logger.error(f"Error preparing path for profile {name}: {e}")
        return JSONResponse({"status": "error", "message": "Build failed"}, status_code=500)

    saved_files = []
    for f in files:
        if not f.filename:
            continue
        content = await f.read()
        try:
            dest = safe_join_flat(path, f.filename)
        except ValueError:
            logger.warning("Blocking invalid sample filename for profile %s: %s", name, f.filename)
            return JSONResponse({"status": "error", "message": "Invalid sample filename"}, status_code=403)

        def save_file(data, target):
            target.write_bytes(data)

        await anyio.to_thread.run_sync(save_file, content, dest)
        saved_files.append(safe_basename(f.filename))

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

@router.post("/api/speaker-profiles/{name}/samples/upload")
async def upload_speaker_samples(
    name: str,
    files: List[UploadFile] = File(...),
    voices_dir: Path = Depends(get_voices_dir)
):
    try:
        try:
            path = _voice_profile_dir(voices_dir, name)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid profile"}, status_code=403)

        path.mkdir(parents=True, exist_ok=True)

        for f in files:
            if not f.filename: continue
            content = await f.read()
            try:
                sample_path = safe_join_flat(path, f.filename)
            except ValueError:
                return JSONResponse({"status": "error", "message": "Invalid sample filename"}, status_code=403)
            sample_path.write_bytes(content)

        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Upload failed for {name}: {e}")
        return JSONResponse({"status": "error", "message": "Upload failed"}, status_code=500)

@router.delete("/api/speaker-profiles/{name}/samples/{sample_name}")
def delete_speaker_sample(
    name: str,
    sample_name: str,
    voices_dir: Path = Depends(get_voices_dir)
):
    try:
        try:
            path = _voice_sample_path(voices_dir, name, sample_name)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid path"}, status_code=403)

        if path.exists():
            path.unlink()
            return JSONResponse({"status": "ok"})
        return JSONResponse({"status": "error", "message": "File not found"}, status_code=404)
    except Exception as e:
        logger.error(f"Delete failed for {name}/{sample_name}: {e}")
        return JSONResponse({"status": "error", "message": "Delete failed"}, status_code=500)

@router.post("/api/speaker-profiles/{name}/rename")
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

@router.delete("/api/speaker-profiles/{name}")
def delete_speaker_profile(
    name: str,
    voices_dir: Path = Depends(get_voices_dir)
):
    try:
        try:
            path = _voice_profile_dir(voices_dir, name)
        except ValueError:
            logger.warning(f"Blocking profile delete traversal attempt: {name}")
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)

        if path.exists():
            if path.is_relative_to(voices_dir.resolve()):
                shutil.rmtree(path)
            else:
                logger.warning("Blocking profile delete outside voices root: %s", path)
                return JSONResponse({"status": "error", "message": "Invalid profile path"}, status_code=403)
            return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Error deleting profile {name}: {e}")
        return JSONResponse({"status": "error", "message": "Delete failed"}, status_code=500)

    return JSONResponse({"status": "error", "message": "Not found"}, status_code=404)

@router.post("/api/speaker-profiles/{name}/test")
def test_speaker_profile(name: str, voices_dir: Path = Depends(get_voices_dir)):
    if _voice_raw_sample_count(voices_dir, name) == 0:
        return JSONResponse(
            {"status": "error", "message": "Add at least one sample before testing this voice."},
            status_code=400
        )

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
    preview_url = _voice_preview_url(voices_dir, name)
    return JSONResponse({
        "status": "ok", 
        "job_id": jid,
        "audio_url": preview_url or f"/out/voices/{name}/sample.wav"
    })
