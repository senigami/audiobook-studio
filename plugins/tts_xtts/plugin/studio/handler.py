from __future__ import annotations
import logging
import time
from pathlib import Path

from app.domain.chunk_groups import build_chunk_groups, load_chunk_segments
from app.db import get_chapter_segments, update_queue_item, update_segment, update_segments_status_bulk
from app.engines.audio_ops import get_audio_duration, stitch_segments, wav_to_mp3
from app.db.speakers import get_profile_wavs as get_speaker_wavs, get_profile_dir as get_voice_profile_dir
from app.db.state import update_job
from .bake import handle_xtts_bake
from .segments import handle_xtts_segments
from .standard_handler import handle_xtts_standard
from .helpers import _group_job_progress

_SKIP_LIVE_BROADCASTS = {
    "skip_studio_job_event": True,
    "skip_job_updated": True,
}

logger = logging.getLogger(__name__)

__all__ = [
    "handle_xtts_job",
    "_group_job_progress",
    "build_chunk_groups",
    "load_chunk_segments",
    "get_chapter_segments",
    "update_queue_item",
    "update_segment",
    "update_segments_status_bulk",
    "get_audio_duration",
    "stitch_segments",
    "wav_to_mp3",
    "get_speaker_wavs",
    "get_voice_profile_dir",
    "update_job",
]


def handle_xtts_job(jid, j, start, on_output, cancel_check, default_sw, speed, pdir, out_wav, out_mp3, text=None):
    from app.db import get_connection, update_segments_status_bulk

    pdir.mkdir(parents=True, exist_ok=True)
    generated_segment_audio = bool(j.is_bake or j.segment_ids)

    if cancel_check():
        update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
        return

    if j.chapter_id:
        from app.db.segments import cleanup_orphaned_segments
        cleanup_orphaned_segments(j.chapter_id)

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
        update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
        return

    if rc != 0 or not out_wav.exists():
        # Only mark failed if not already handled by sub-handlers
        existing_job = update_job(jid) # Get current state? No, update_job doesn't return state.
        # We assume if rc != 0, we should mark failed if not already terminal
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=f"Generation failed (rc={rc}).")
        return

    # Finalize (MP3 conversion)
    if j.make_mp3:
        update_job(
            jid,
            status="running",
            progress=0.99,
            completed_render_groups=j.render_group_count if getattr(j, "render_group_count", 0) else 0,
            render_group_count=getattr(j, "render_group_count", 0),
            active_render_group_index=0,
            **_SKIP_LIVE_BROADCASTS,
        )
        frc = wav_to_mp3(out_wav, out_mp3, on_output=on_output, cancel_check=cancel_check)
        if frc == 0 and out_mp3.exists():
            if j.chapter_id and generated_segment_audio:
                with get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                    sids = [r['id'] for r in cursor.fetchall()]
                    update_segments_status_bulk(sids, j.chapter_id, "done")
            update_job(
                jid,
                status="done",
                finished_at=time.time(),
                progress=1.0,
                output_wav=out_wav.name,
                output_mp3=out_mp3.name,
            )
        else:
            if j.chapter_id and generated_segment_audio:
                with get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                    sids = [r['id'] for r in cursor.fetchall()]
                    update_segments_status_bulk(sids, j.chapter_id, "done")
            update_job(
                jid,
                status="done",
                finished_at=time.time(),
                progress=1.0,
                output_wav=out_wav.name,
                error="MP3 conversion failed (using WAV fallback)",
            )
    else:
        if j.chapter_id and generated_segment_audio:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
                sids = [r['id'] for r in cursor.fetchall()]
                update_segments_status_bulk(sids, j.chapter_id, "done")
        update_job(
            jid,
            status="done",
            finished_at=time.time(),
            progress=1.0,
            output_wav=out_wav.name,
        )
