from __future__ import annotations
import logging
import time
from pathlib import Path

from .bake import handle_xtts_bake
from .segments import handle_xtts_segments
from .standard_handler import handle_xtts_standard
from .helpers import _group_job_progress

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level SDK context accessor — delegates to the shared PL-1 factory
# (studio_plugin_sdk.get_plugin_ctx), which owns the per-engine-id
# lazy singleton cache. Kept as a local, patchable name because existing
# tests patch ``<this module>._get_ctx`` directly.
# ---------------------------------------------------------------------------

def _get_ctx():
    """Return the shared StudioPluginContext for the xtts engine."""
    from studio_plugin_sdk import get_plugin_ctx  # noqa: PLC0415
    return get_plugin_ctx("xtts")


# ---------------------------------------------------------------------------
# Module-level wrappers — thin delegates to ctx, patchable by existing tests.
#
# bake.py / segments.py / standard_handler.py import this module via _handler()
# and call these wrappers.  Tests patch the names here; ctx provides the real
# implementation when not patched.
#
# NOTE (S4): These wrappers are NOT app.* imports — they are *function stubs*
# that forward to ctx at call time.  The acceptance grep for ``^from app\.``
# still passes because no import statement is at module body level.
# ---------------------------------------------------------------------------

def update_job(job_id: str, force_broadcast: bool = False, **kwargs) -> None:
    """Wrapper for ctx.update_job_fields — patchable by legacy tests.

    Accepts legacy kwargs (``force_broadcast``, ``skip_studio_job_event``,
    ``skip_job_updated``, ``eta_basis``, ``estimated_end_at``,
    ``eta_updated_at``) and strips the ones that ctx.update_job_fields
    doesn't understand before forwarding.
    """
    kwargs.pop("skip_studio_job_event", None)
    kwargs.pop("skip_job_updated", None)
    kwargs.pop("eta_basis", None)
    kwargs.pop("estimated_end_at", None)
    kwargs.pop("eta_updated_at", None)
    _get_ctx().update_job_fields(job_id, broadcast=force_broadcast, **kwargs)


def stitch_segments(pdir, segment_wavs, out_wav, on_output, cancel_check):
    """Wrapper for ctx.stitch_segments — patchable by legacy tests."""
    return _get_ctx().stitch_segments(
        [str(p) for p in segment_wavs],
        str(out_wav),
        on_output=on_output,
        cancel_check=cancel_check,
    )


def wav_to_mp3(in_wav, out_mp3):
    """Wrapper for ctx.wav_to_mp3 — patchable by legacy tests."""
    return _get_ctx().wav_to_mp3(str(in_wav), str(out_mp3))


def get_audio_duration(path):
    """Wrapper for ctx.get_audio_duration — patchable by legacy tests."""
    return _get_ctx().get_audio_duration(str(path))


def get_speaker_wavs(profile_name):
    """Wrapper for ctx.get_speaker_wavs — patchable by legacy tests."""
    return _get_ctx().get_speaker_wavs(profile_name)


def get_voice_profile_dir(profile_name):
    """Wrapper for ctx.get_voice_profile_dir — patchable by legacy tests."""
    return _get_ctx().get_voice_profile_dir(profile_name)


def load_chunk_segments(chapter_id):
    """Wrapper for ctx.get_chapter_segments — patchable by legacy tests."""
    return _get_ctx().get_chapter_segments(chapter_id)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

__all__ = [
    "handle_xtts_job",
    "_group_job_progress",
    "_get_ctx",
    "update_job",
    "stitch_segments",
    "wav_to_mp3",
    "get_audio_duration",
    "get_speaker_wavs",
    "get_voice_profile_dir",
    "load_chunk_segments",
]

_ETA_CLEAR = {"eta_seconds": None, "eta_basis": None, "estimated_end_at": None, "eta_updated_at": None}


def handle_xtts_job(jid, j, start, on_output, cancel_check, default_sw, speed, pdir, out_wav, out_mp3, text=None):
    ctx = _get_ctx()

    pdir.mkdir(parents=True, exist_ok=True)
    generated_segment_audio = bool(j.is_bake or j.segment_ids)

    if cancel_check():
        update_job(
            jid,
            status="cancelled",
            finished_at=time.time(),
            progress=1.0,
            error="Cancelled.",
            **_ETA_CLEAR,
        )
        return

    if j.chapter_id:
        ctx.cleanup_orphaned_segments(j.chapter_id)

    # Route to specialized handlers
    if j.is_bake and j.chapter_id:
        rc = handle_xtts_bake(jid, j, start, on_output, cancel_check, default_sw, speed, pdir, out_wav)
    elif j.segment_ids:
        handle_xtts_segments(jid, j, start, on_output, cancel_check, default_sw, speed, pdir)
        # Segments handler handles its own terminal state because it might only be a partial update
        return
    else:
        rc = handle_xtts_standard(jid, j, start, on_output, cancel_check, default_sw, speed, pdir, out_wav, text=text)

    if cancel_check():
        update_job(
            jid,
            status="cancelled",
            finished_at=time.time(),
            progress=1.0,
            error="Cancelled.",
            **_ETA_CLEAR,
        )
        return

    if rc != 0 or not out_wav.exists():
        update_job(
            jid,
            status="failed",
            finished_at=time.time(),
            progress=1.0,
            error=f"Generation failed (rc={rc}).",
            **_ETA_CLEAR,
        )
        return

    if j.chapter_id and generated_segment_audio:
        segs = ctx.get_chapter_segments(j.chapter_id)
        sids = [s["id"] for s in segs]
        ctx.update_segments_status_bulk(sids, "done")

    update_job(
        jid,
        status="done",
        finished_at=time.time(),
        progress=1.0,
        output_wav=out_wav.name,
        **_ETA_CLEAR,
    )
