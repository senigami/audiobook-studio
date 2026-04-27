import logging
import uuid
import time
import anyio
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Form, File, UploadFile, Request
from fastapi.responses import JSONResponse
from . import voices_helpers
from ... import jobs
from ... import state
from ... import models
from ... import pathing
from ...db.speakers import DEFAULT_PROFILE_ENGINE

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/{name}/test-text")
def update_speaker_test_text(name: str, text: str = Form(...)):
    jobs.update_speaker_settings(name, test_text=text)
    return JSONResponse({"status": "ok", "test_text": text})

@router.post("/{name}/reset-test-text")
def reset_speaker_test_text(name: str):
    jobs.update_speaker_settings(name, test_text=None)
    return JSONResponse({"status": "ok", "test_text": jobs.DEFAULT_SPEAKER_TEST_TEXT})

@router.post("/{name}/settings")
async def api_update_profile_settings(name: str, request: Request):
    try:
        settings = await request.json()
    except Exception:
        # Fallback for form data if needed, but JSON is preferred
        form = await request.form()
        settings = dict(form)

    if not jobs.update_speaker_settings(name, **settings):
         return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)
    return {"status": "ok"}


@router.post("/{name}/speed")
def update_speaker_speed(name: str, speed: float = Form(...)):
    jobs.update_speaker_settings(name, speed=speed)
    return JSONResponse({"status": "ok", "speed": speed})

@router.post("/{name}/variant-name")
def update_speaker_variant_name(name: str, variant_name: str = Form(...)):
    clean_variant_name = (variant_name or "").strip() or "Default"
    jobs.update_speaker_settings(name, variant_name=None if clean_variant_name == "Default" else clean_variant_name)
    return JSONResponse({"status": "ok", "variant_name": clean_variant_name})


@router.post("/{name}/engine")
def update_speaker_engine(name: str, engine: str = Form(...)):
    try:
        normalized_engine = voices_helpers._normalize_profile_engine(engine)
    except ValueError:
        return JSONResponse({"status": "error", "message": "Invalid profile engine"}, status_code=400)

    if not voices_helpers._is_engine_active(normalized_engine):
        return JSONResponse({"status": "error", "message": f"Engine {normalized_engine} is not enabled in Settings."}, status_code=400)

    if not jobs.update_speaker_settings(name, engine=normalized_engine):
        return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

    return JSONResponse({"status": "ok", "engine": normalized_engine})


@router.post("/{name}/reference-sample")
def update_speaker_reference_sample(name: str, sample_name: str = Form("")):
    if not voices_helpers._is_engine_active("voxtral"):
        return JSONResponse({"status": "error", "message": "Enable Voxtral in Settings to configure metadata."}, status_code=400)

    clean_sample = (sample_name or "").strip() or None

    if clean_sample:
        try:
            sample_path = voices_helpers._existing_voice_sample_path(name, clean_sample)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid sample name"}, status_code=403)
        if not sample_path:
            return JSONResponse({"status": "error", "message": "Sample not found"}, status_code=404)

    if not jobs.update_speaker_settings(name, reference_sample=clean_sample):
        return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

    return JSONResponse({"status": "ok", "reference_sample": clean_sample})


@router.post("/{name}/voxtral-voice-id")
def update_speaker_voxtral_voice_id(name: str, voice_id: str = Form("")):
    if not voices_helpers._is_engine_active("voxtral"):
        return JSONResponse({"status": "error", "message": "Enable Voxtral in Settings to configure metadata."}, status_code=400)

    clean_voice_id = (voice_id or "").strip() or None
    if not jobs.update_speaker_settings(name, voxtral_voice_id=clean_voice_id):
        return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

    return JSONResponse({"status": "ok", "voxtral_voice_id": clean_voice_id})

@router.post("/{name}/build")
async def build_speaker_profile(
    name: str,
    files: List[UploadFile] = File(default=[]),
):
    try:
        try:
            path = voices_helpers._existing_voice_profile_dir(name) or voices_helpers._new_voice_profile_dir(name)
        except ValueError:
            logger.warning(f"Blocking profile build traversal attempt: {name}")
            return JSONResponse({"status": "error", "message": "Invalid profile name"}, status_code=403)

        existing_raw_samples = voices_helpers._voice_raw_sample_count(name)
        has_latent = voices_helpers._voice_has_latent(name)
        has_generation_material = voices_helpers._voice_has_generation_material(name)
        if existing_raw_samples == 0 and not has_latent and not has_generation_material and not files:
            return JSONResponse(
                {"status": "error", "message": "Add at least one sample or keep a latent before building this voice."},
                status_code=400
            )

        path.mkdir(parents=True, exist_ok=True)
        import os
        trusted_voices_root = os.path.abspath(os.fspath(voices_helpers.get_voices_dir()))
        resolved_pdir = os.path.abspath(os.fspath(path))

        if resolved_pdir.startswith(trusted_voices_root + os.sep):
            # Clear existing sample if it exists to ensure accurate building status
            sample_path_full = os.path.normpath(os.path.join(resolved_pdir, "sample.wav"))
            if sample_path_full.startswith(resolved_pdir + os.sep) and os.path.exists(sample_path_full):
                os.unlink(sample_path_full)
        else:
             return JSONResponse({"status": "error", "message": "Access denied"}, status_code=403)
    except Exception as e:
        logger.error(f"Error preparing path for profile {name}: {e}")
        return JSONResponse({"status": "error", "message": "Build failed"}, status_code=500)

    saved_files = []
    for f in files:
        if not f.filename:
            continue
        content = await f.read()
        try:
            dest = voices_helpers._new_voice_sample_path(path, f.filename)
        except ValueError:
            logger.warning("Blocking invalid sample filename for profile %s: %s", name, f.filename)
            return JSONResponse({"status": "error", "message": "Invalid sample filename"}, status_code=403)

        def save_file(data, target_path):
            import os
            # Note: dest is already proven in the caller via voices_helpers._new_voice_sample_path
            # But for CodeQL visibility, we re-verify here
            trusted_voices_root = os.path.abspath(os.fspath(voices_helpers.get_voices_dir()))
            resolved_target = os.path.abspath(os.fspath(target_path))

            if resolved_target.startswith(trusted_voices_root + os.sep):
                with open(resolved_target, "wb") as f:
                    f.write(data)

        await anyio.to_thread.run_sync(save_file, content, dest)
        saved_files.append(pathing.safe_basename(f.filename))

    # Create build job
    jid = f"build-{uuid.uuid4().hex[:8]}"
    j = models.Job(
        id=jid,
        engine="voice_build",
        chapter_file="", # Required by model
        status="queued",
        created_at=time.time(),
        speaker_profile=name,
        custom_title=voices_helpers._voice_job_title(name),
    )
    state.put_job(j)
    jobs.enqueue(j)
    return JSONResponse({"status": "ok", "job_id": jid})

@router.post("/{name}/samples/upload")
async def upload_speaker_samples(
    name: str,
    files: List[UploadFile] = File(...),
):
    try:
        try:
            path = voices_helpers._existing_voice_profile_dir(name) or voices_helpers._new_voice_profile_dir(name)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid profile"}, status_code=403)

        for f in files:
            if not f.filename: continue
            content = await f.read()
            import os
            trusted_voices_root = os.path.abspath(os.fspath(voices_helpers.get_voices_dir()))
            resolved_pdir = os.path.abspath(os.fspath(path))

            if not resolved_pdir.startswith(trusted_voices_root + os.sep):
                 return JSONResponse({"status": "error", "message": "Access denied"}, status_code=403)

            sample_filename = pathing.safe_basename(f.filename)
            target_path = os.path.normpath(os.path.join(resolved_pdir, sample_filename))

            if not target_path.startswith(resolved_pdir + os.sep):
                 return JSONResponse({"status": "error", "message": "Invalid sample path"}, status_code=403)

            with open(target_path, "wb") as f_out:
                f_out.write(content)

        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Upload failed for {name}: {e}")
        return JSONResponse({"status": "error", "message": "Upload failed"}, status_code=500)

@router.delete("/{name}/samples/{sample_name}")
def delete_speaker_sample_route(
    name: str,
    sample_name: str,
):
    return voices_helpers.delete_speaker_sample(name, sample_name)

@router.post("/{name}/test")
def test_speaker_profile(name: str):
    settings = jobs.get_speaker_settings(name)
    engine = settings.get("engine", DEFAULT_PROFILE_ENGINE)
    if not voices_helpers._is_engine_active(engine):
        return JSONResponse({"status": "error", "message": f"Engine {engine} is not enabled in Settings."}, status_code=400)

    if not voices_helpers._voice_has_generation_material(name):
        return JSONResponse(
            {"status": "error", "message": "Add at least one sample or keep a latent before testing this voice."},
            status_code=400
        )

    jid = f"test-{uuid.uuid4().hex[:8]}"
    j = models.Job(
        id=jid,
        engine="voice_test",
        chapter_file="", # Required by model
        status="queued",
        created_at=time.time(),
        speaker_profile=name,
        custom_title=voices_helpers._voice_job_title(name),
    )
    state.put_job(j)
    jobs.enqueue(j)
    preview_url = voices_helpers._voice_preview_url(name)
    return JSONResponse({
        "status": "ok",
        "job_id": jid,
        "audio_url": preview_url or f"/out/voices/{name}/sample.wav"
    })
