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
# Module-level SDK context factory (lazy singleton)
# ---------------------------------------------------------------------------

_ctx_instance = None


def _get_ctx():
    """Return the shared StudioPluginContext for the xtts engine."""
    global _ctx_instance  # noqa: PLW0603
    if _ctx_instance is None:
        from studio_plugin_sdk import StudioPluginContext  # noqa: PLC0415
        _ctx_instance = StudioPluginContext("xtts")
    return _ctx_instance


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------

__all__ = [
    "handle_xtts_job",
    "_group_job_progress",
    "_get_ctx",
]


def handle_xtts_job(jid, j, start, on_output, cancel_check, default_sw, speed, pdir, out_wav, out_mp3, text=None):
    ctx = _get_ctx()

    pdir.mkdir(parents=True, exist_ok=True)
    generated_segment_audio = bool(j.is_bake or j.segment_ids)

    if cancel_check():
        ctx.update_job_progress(
            jid,
            status="cancelled",
            finished_at=time.time(),
            progress=1.0,
            error="Cancelled.",
            eta_seconds=None,
        )
        return

    if j.chapter_id:
        ctx.cleanup_orphaned_segments(j.chapter_id)

    # Route to specialized handlers
    if j.is_bake and j.chapter_id:
        rc = handle_xtts_bake(jid, j, start, on_output, cancel_check, default_sw, speed, pdir, out_wav)
    elif j.segment_ids:
        rc = handle_xtts_segments(jid, j, start, on_output, cancel_check, default_sw, speed, pdir)
        # Segments handler handles its own terminal state because it might only be a partial update
        return
    else:
        rc = handle_xtts_standard(jid, j, start, on_output, cancel_check, default_sw, speed, pdir, out_wav, text=text)

    if cancel_check():
        ctx.update_job_progress(
            jid,
            status="cancelled",
            finished_at=time.time(),
            progress=1.0,
            error="Cancelled.",
            eta_seconds=None,
        )
        return

    if rc != 0 or not out_wav.exists():
        ctx.update_job_progress(
            jid,
            status="failed",
            finished_at=time.time(),
            progress=1.0,
            error=f"Generation failed (rc={rc}).",
            eta_seconds=None,
        )
        return

    if j.chapter_id and generated_segment_audio:
        segs = ctx.get_chapter_segments(j.chapter_id)
        sids = [s["id"] for s in segs]
        ctx.update_segments_status_bulk(sids, "done")

    ctx.update_job_progress(
        jid,
        status="done",
        finished_at=time.time(),
        progress=1.0,
        output_wav=out_wav.name,
        eta_seconds=None,
    )
