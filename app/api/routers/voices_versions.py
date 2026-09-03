"""Version-history routes for a voice variant's live sample state.

Exposes list/promote endpoints over ``app/domain/voices/variant_versions.py``
(the module that owns the actual file mechanics). This router only handles
name/path resolution, the response shape, and the settings sync that must
happen after a promote.
"""

import logging
import time
import uuid

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import JSONResponse

from ...core import config
from ...db import models, state
from ...db.queue import upsert_queue_row
from ...db.speakers import get_speaker_settings, update_speaker_settings
from ...domain.voices.variant_versions import (
    get_active_version_id,
    get_version,
    list_versions,
    promote_version,
    snapshot_current_as_version,
)
from ...orchestration.scheduler.orchestrator import create_orchestrator
from ...orchestration.tasks.sample_test import SampleTestTask
from . import voices_helpers

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/{name}/versions")
def list_speaker_versions(name: str):
    name = config.canonical_voice_name(name)
    pdir = voices_helpers._existing_voice_profile_dir(name)
    if not pdir:
        return JSONResponse({"status": "error", "message": "Voice profile directory not found"}, status_code=404)

    active_id = get_active_version_id(pdir)
    versions = list_versions(pdir)

    root = voices_helpers.get_voices_dir()
    try:
        rel = pdir.relative_to(root).as_posix()
    except ValueError:
        rel = name

    out = []
    for v in versions:
        entry = dict(v)
        entry["is_active"] = (v["id"] == active_id)
        entry["artifact_url"] = (
            f"/out/voices/{rel}/versions/{v['id']}/artifact.mp3" if v.get("has_artifact") else None
        )
        out.append(entry)

    return JSONResponse({"status": "ok", "versions": out, "active_version_id": active_id})


@router.post("/{name}/versions/{version_id}/promote")
def promote_speaker_version(name: str, version_id: str):
    name = config.canonical_voice_name(name)
    pdir = voices_helpers._existing_voice_profile_dir(name)
    if not pdir:
        return JSONResponse({"status": "error", "message": "Voice profile directory not found"}, status_code=404)

    target = get_version(pdir, version_id)
    if not target:
        return JSONResponse({"status": "error", "message": "Version not found"}, status_code=404)

    # Snapshot what's about to be replaced FIRST (mirrors the build endpoint's
    # own snapshot-before-overwrite, task 002 -- promoting is itself a form of
    # overwriting the live state, so it gets the same protection).
    current_settings = get_speaker_settings(name)
    try:
        snapshot_current_as_version(
            pdir,
            engine_id=str(current_settings.get("engine") or ""),
            test_text=str(current_settings.get("test_text") or ""),
            voice_job_settings=current_settings,
        )
    except Exception:
        logger.exception("Failed to snapshot pre-promote state for %s", name)

    if not promote_version(pdir, version_id):
        return JSONResponse({"status": "error", "message": "Promote failed"}, status_code=500)

    # Recompute built_samples the same way SampleBuildTask does (sample_build.py) --
    # the promoted samples/ set is now the live *.wav set.
    built_samples = sorted([
        f.name for f in pdir.iterdir()
        if f.is_file() and f.suffix.lower() == ".wav" and f.name != "sample.wav"
    ])

    # target's meta fields become canonical again -- exact name, NOT re-resolved
    # through _resolve_existing_profile_name's base-name-collapse fallback.
    update_speaker_settings(
        name,
        engine=target.get("engine_id") or "",
        test_text=target.get("test_text") or "",
        built_samples=built_samples,
        reference_sample=target.get("reference_sample"),
        voice_asset_id=target.get("voice_asset_id"),
        model=target.get("model"),
    )

    return JSONResponse({"status": "ok", "active_version_id": version_id})


@router.post("/{name}/versions/ab-test")
async def ab_test_speaker_versions(name: str, request: Request, background_tasks: BackgroundTasks):
    name = config.canonical_voice_name(name)
    body = await request.json()
    version_a_id = str(body.get("version_a_id") or "")
    version_b_id = str(body.get("version_b_id") or "")
    test_text = str(body.get("test_text") or "")
    if not version_a_id or not version_b_id or not test_text:
        return JSONResponse({"status": "error", "message": "version_a_id, version_b_id, and test_text are required"}, status_code=400)

    pdir = voices_helpers._existing_voice_profile_dir(name)
    if not pdir:
        return JSONResponse({"status": "error", "message": "Voice profile directory not found"}, status_code=404)

    results = {}
    for slot, version_id in (("a", version_a_id), ("b", version_b_id)):
        version = get_version(pdir, version_id)
        if not version:
            return JSONResponse({"status": "error", "message": f"Version {version_id} not found"}, status_code=404)

        # Reuse the cached artifact directly if it was rendered against this
        # exact passage — no synthesis needed. NOTE: get_version()'s record
        # (unlike list_versions()) does not include a computed "has_artifact"
        # key, so it's checked here by looking at the artifact file directly,
        # mirroring list_versions()'s own has_artifact computation.
        version_artifact_path = pdir / "versions" / version_id / "artifact.mp3"
        if version.get("test_text") == test_text and version_artifact_path.exists():
            root = voices_helpers.get_voices_dir()
            rel = pdir.relative_to(root).as_posix()
            results[slot] = {
                "mode": "cached",
                "audio_url": f"/out/voices/{rel}/versions/{version_id}/artifact.mp3",
            }
            continue

        # Otherwise render fresh, from THIS version's own samples snapshot —
        # never the live variant directory, and never writing back into the
        # version directory itself. Output goes to a scratch location under
        # config.TRANSIENT_DIR, not versions/<id>/.
        version_samples_dir = pdir / "versions" / version_id / "samples"
        jid = f"abtest-{uuid.uuid4().hex[:8]}"
        scratch_output = config.TRANSIENT_DIR / "voice-ab-test" / jid / "render.wav"

        j = models.Job(
            id=jid,
            engine="voice_ab_test",
            chapter_file="",
            status="queued",
            created_at=time.time(),
            speaker_profile=name,
            custom_title=f"A/B render ({slot.upper()}) for {name}",
        )
        state.put_job(j)
        upsert_queue_row(jid, status="queued", custom_title=j.custom_title, engine="voice_ab_test")

        orchestrator = create_orchestrator()
        task = SampleTestTask(
            task_id=jid,
            speaker_profile=name,
            engine_id=str(version.get("engine_id") or ""),
            output_path=scratch_output,
            voice_profile_dir=version_samples_dir,
            test_text=test_text,
            voice_job_settings=version.get("voice_job_settings") or {},
            custom_title=f"A/B render ({slot.upper()}) for {name}",
        )
        background_tasks.add_task(orchestrator.submit, task)

        # NOTE: SampleTestTask.run() writes preview_* keys to the CANONICAL
        # profile.json for `name` (keyed by speaker_profile, not by
        # voice_profile_dir) even though it renders from a version snapshot.
        # Two A/B renders both write to the same preview_* keys, last-write-wins.
        # Never read preview_* back to figure out which A/B side finished --
        # the job_id/result via the existing jobs/websocket/queue mechanism is
        # the only reliable signal.
        results[slot] = {"mode": "job", "job_id": jid}

    return JSONResponse({"status": "ok", "results": results})
