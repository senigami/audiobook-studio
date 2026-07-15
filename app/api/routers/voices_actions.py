import logging
import uuid
import time
import anyio
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Form, File, UploadFile, Request
from fastapi.responses import JSONResponse
from . import voices_helpers
from ...db import state
from ...db import models
from ...utils import pathing
from ...core import config
from ...engines.voice_engines import get_default_profile_engine
from ...db.speakers import get_speaker_settings, update_speaker_settings, DEFAULT_SPEAKER_TEST_TEXT
from ...orchestration.scheduler.orchestrator import create_orchestrator
from ...orchestration.tasks.sample_build import SampleBuildTask
from fastapi import BackgroundTasks

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/{name}/test-text")
def update_speaker_test_text(name: str, text: str = Form(...)):
    # Rule 9: Early validation
    name = config.canonical_voice_name(name)
    update_speaker_settings(name, test_text=text)
    return JSONResponse({"status": "ok", "test_text": text})

@router.post("/{name}/reset-test-text")
def reset_speaker_test_text(name: str):
    # Rule 9: Early validation
    name = config.canonical_voice_name(name)
    update_speaker_settings(name, test_text=None)
    return JSONResponse({"status": "ok", "test_text": DEFAULT_SPEAKER_TEST_TEXT})

@router.post("/{name}/settings")
async def api_update_profile_settings(name: str, request: Request):
    # Rule 9: Early validation
    name = config.canonical_voice_name(name)
    try:
        settings = await request.json()
    except Exception:
        # Fallback for form data if needed, but JSON is preferred
        form = await request.form()
        settings = dict(form)

    # Rule 9: Validate against the target engine allowlist while preserving
    # existing profile metadata fields that the drawer still submits.
    spk_settings = get_speaker_settings(name)
    requested_engine = str(settings.get("engine") or spk_settings.get("engine") or "")

    if not requested_engine:
        return JSONResponse(
            {"status": "error", "message": "No TTS engine is currently configured. Please select an engine."},
            status_code=400
        )

    from ...engines.behavior import get_synthesis_settings_allowlist
    allowed = set(get_synthesis_settings_allowlist(requested_engine))
    allowed.update({"engine", "test_text", "performance_tags"})

    invalid_keys = [k for k in settings if k not in allowed]
    if invalid_keys:
        return JSONResponse(
            {"status": "error", "message": f"Settings not allowed for engine '{requested_engine}': {', '.join(invalid_keys)}"},
            status_code=400
        )

    if not update_speaker_settings(name, **settings):
        return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)
    return {"status": "ok"}


@router.post("/{name}/speed")
def update_speaker_speed(name: str, speed: float = Form(...)):
    # Rule 9: Early validation
    name = config.canonical_voice_name(name)
    update_speaker_settings(name, speed=speed)
    return JSONResponse({"status": "ok", "speed": speed})

@router.post("/{name}/variant-name")
def update_speaker_variant_name(name: str, variant_name: str = Form(...)):
    # Rule 9: Early validation
    name = config.canonical_voice_name(name)
    clean_variant_name = (variant_name or "").strip() or "Default"
    update_speaker_settings(name, variant_name=None if clean_variant_name == "Default" else clean_variant_name)
    return JSONResponse({"status": "ok", "variant_name": clean_variant_name})


@router.post("/{name}/variants/{variant_name}/set-default")
async def api_set_default_variant(name: str, variant_name: str):
    # Rule 9: Early validation
    name = config.canonical_voice_name(name)
    pdir = voices_helpers._existing_voice_profile_dir(name)
    if not pdir:
        return JSONResponse({"status": "error", "message": "Voice profile directory not found"}, status_code=404)

    voice_root = pdir.parent

    # Rule 9: variant_name comes from the URL and is untrusted — containment-check
    # it against real subdirectories of the voice root before ever writing state,
    # rather than trusting the string blindly.
    try:
        target_variant_dir = pathing.secure_join_flat(voice_root, variant_name)
    except ValueError:
        return JSONResponse({"status": "error", "message": "Invalid variant name"}, status_code=403)

    if not target_variant_dir.is_dir() or not pathing.find_secure_file(target_variant_dir, "profile.json"):
        return JSONResponse({"status": "error", "message": "Variant not found"}, status_code=404)

    from ...domain.voices.manifest import load_voice_state, save_voice_state
    voice_state = load_voice_state(voice_root)
    voice_state["default_variant"] = variant_name
    save_voice_state(voice_root, voice_state)

    return JSONResponse({"status": "ok", "default_variant": variant_name})


@router.post("/{name}/engine")
def update_speaker_engine(name: str, engine: str = Form(...)):
    # Rule 9: Early validation
    name = config.canonical_voice_name(name)
    try:
        normalized_engine = voices_helpers._normalize_profile_engine(engine)
    except ValueError:
        return JSONResponse({"status": "error", "message": "Invalid profile engine"}, status_code=400)

    if not voices_helpers._is_engine_active(normalized_engine):
        return JSONResponse({"status": "error", "message": f"Engine {normalized_engine} is not enabled in Settings."}, status_code=400)

    if not update_speaker_settings(name, engine=normalized_engine):
        return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

    return JSONResponse({"status": "ok", "engine": normalized_engine})


@router.post("/{name}/reference-sample")
def update_speaker_reference_sample(name: str, sample_name: str = Form("")):
    # Rule 9: Early validation
    name = config.canonical_voice_name(name)
    spk_settings = get_speaker_settings(name)
    current_engine = spk_settings.get("engine") or ""
    if not current_engine:
         return JSONResponse({"status": "error", "message": "No TTS engine is configured for this profile."}, status_code=400)
    if not voices_helpers._has_behavior(current_engine, "reference_sample"):
         return JSONResponse({"status": "error", "message": f"Engine {current_engine} does not support reference samples."}, status_code=400)

    clean_sample = (sample_name or "").strip() or None

    if clean_sample:
        try:
            sample_path = voices_helpers._existing_voice_sample_path(name, clean_sample)
        except ValueError:
            return JSONResponse({"status": "error", "message": "Invalid sample name"}, status_code=403)
        if not sample_path:
            return JSONResponse({"status": "error", "message": "Sample not found"}, status_code=404)

    if not update_speaker_settings(name, reference_sample=clean_sample):
        return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

    return JSONResponse({"status": "ok", "reference_sample": clean_sample})


@router.post("/{name}/voice-asset-id")
def update_speaker_voice_asset_id(name: str, voice_id: str = Form("")):
    # Rule 9: Early validation
    name = config.canonical_voice_name(name)
    spk_settings = get_speaker_settings(name)
    current_engine = spk_settings.get("engine") or ""
    if not current_engine:
         return JSONResponse({"status": "error", "message": "No TTS engine is configured for this profile."}, status_code=400)
    if not voices_helpers._has_behavior(current_engine, "voice_asset_id"):
         return JSONResponse({"status": "error", "message": f"Engine {current_engine} does not support voice asset IDs."}, status_code=400)

    clean_voice_id = (voice_id or "").strip() or None
    if not update_speaker_settings(name, voice_asset_id=clean_voice_id):
        return JSONResponse({"status": "error", "message": "Profile not found"}, status_code=404)

    return JSONResponse({"status": "ok", "voice_asset_id": clean_voice_id})



@router.post("/{name}/build")
async def build_speaker_profile(
    name: str,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(default=[]),
):
    try:
        # Rule 9: Early validation
        name = config.canonical_voice_name(name)
        spk_settings = get_speaker_settings(name)
        engine = spk_settings.get("engine") or ""
        if not engine:
            return JSONResponse({"status": "error", "message": "No TTS engine is configured for this profile."}, status_code=400)

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
            # Snapshot the outgoing state before it's overwritten (voice-variant
            # version history) — never let a version-history failure block the
            # rebuild itself.
            try:
                from ...domain.voices.variant_versions import snapshot_current_as_version
                snapshot_current_as_version(
                    Path(resolved_pdir),
                    engine_id=str(spk_settings.get("engine") or ""),
                    test_text=str(spk_settings.get("test_text") or ""),
                    voice_job_settings=spk_settings,
                )
            except Exception:
                logger.exception("Failed to snapshot pre-rebuild version for %s", name)

            # Clear existing sample (wav and mp3) to ensure accurate building status
            for _sample_name in ("sample.wav", "sample.mp3"):
                _sample_full = os.path.normpath(os.path.join(resolved_pdir, _sample_name))
                if _sample_full.startswith(resolved_pdir + os.sep) and os.path.exists(_sample_full):
                    os.unlink(_sample_full)
        else:
             return JSONResponse({"status": "error", "message": "Access denied"}, status_code=403)
    except ValueError as e:
        logger.warning("Invalid speaker profile build request for %s: %s", name, e)
        return JSONResponse({"status": "error", "message": "Invalid profile build request"}, status_code=400)
    except Exception as e:
        from ...engines.errors import EngineUnavailableError
        if isinstance(e, EngineUnavailableError):
            logger.exception("Engine unavailable during profile build for %s", name)
            return JSONResponse({"status": "error", "message": "The TTS engine is currently unavailable."}, status_code=503)
        logger.exception("Error preparing path for profile %s", name)
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
        try:
            saved_files.append(pathing.safe_basename(f.filename))
        except ValueError:
            saved_files.append("<unknown>")

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
    from ...db.queue import upsert_queue_row
    upsert_queue_row(jid, status="queued", custom_title=j.custom_title, engine="voice_build")

    # Submit to orchestrator
    orchestrator = create_orchestrator()
    spk_settings = get_speaker_settings(name)
    engine = spk_settings.get("engine") or ""

    task = SampleBuildTask(
        task_id=jid,
        speaker_profile=name,
        engine_id=engine,
        output_path=Path(resolved_pdir) / "sample.wav",
        voice_profile_dir=Path(resolved_pdir),
        test_text=spk_settings["test_text"],
        voice_job_settings=spk_settings,
        custom_title=voices_helpers._voice_job_title(name)
    )
    background_tasks.add_task(orchestrator.submit, task)

    return JSONResponse({"status": "ok", "job_id": jid})

@router.post("/{name}/samples/upload")
async def upload_speaker_samples(
    name: str,
    files: List[UploadFile] = File(...),
):
    # Rule 9: Early validation
    name = config.canonical_voice_name(name)
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

            # Collision guard: a colliding filename must never silently
            # overwrite an existing sample (client-side unique naming alone
            # isn't sufficient — two sessions, a reload resetting a counter,
            # or a coincidental match against a manually-uploaded sample
            # could still collide at this layer). Auto-suffix on collision
            # rather than rejecting, so a retry-free upload flow keeps working.
            if os.path.exists(target_path):
                stem, ext = os.path.splitext(sample_filename)
                suffix = 1
                while os.path.exists(target_path):
                    target_path = os.path.normpath(os.path.join(resolved_pdir, f"{stem}_{suffix}{ext}"))
                    suffix += 1

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
    # Rule 9: Early validation
    name = config.canonical_voice_name(name)
    return voices_helpers.delete_speaker_sample(name, sample_name)

@router.post("/{name}/test")
def test_speaker_profile(name: str, background_tasks: BackgroundTasks):
    # Rule 9: Early validation
    name = config.canonical_voice_name(name)
    try:
        result = voices_helpers.submit_sample_test_job(name, background_tasks)
        if not result["ok"]:
            return JSONResponse({"status": "error", "message": result["message"]}, status_code=result["status_code"])
        return JSONResponse({"status": "ok", "job_id": result["job_id"], "audio_url": result["audio_url"]})
    except Exception as e:
        from ...engines.errors import EngineUnavailableError
        if isinstance(e, EngineUnavailableError):
            logger.exception("Engine unavailable during profile test for %s", name)
            return JSONResponse({"status": "error", "message": "The TTS engine is currently unavailable."}, status_code=503)
        logger.exception("Test failed for %s", name)
        return JSONResponse({"status": "error", "message": "Test failed"}, status_code=500)
