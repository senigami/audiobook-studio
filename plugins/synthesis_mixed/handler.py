from __future__ import annotations
import logging
import time
from pathlib import Path

from app.domain.chunk_groups import build_chunk_groups, load_chunk_segments
from app.core.config import get_chapter_dir
from app.engines.audio_ops import get_audio_duration, stitch_segments
from app.engines.errors import EngineBridgeError
from app.db.state import update_job
from app.utils.text.textops import safe_split_long_sentences, sanitize_text
from app.engines.behavior import get_sanitize_categories
from app.db.speakers import get_speaker_settings, get_profile_wavs as get_speaker_wavs, get_profile_dir as get_voice_profile_dir
from app.jobs.handlers.bridge_helpers import generate_via_bridge
from app.jobs.worker_metrics import record_engine_sample
from app.db.state import get_performance_metrics

logger = logging.getLogger(__name__)

def _group_weight(group: dict) -> int:
    return max(1, int(group.get("text_length") or 0))


def _segment_output_path(pdir: Path, segment_id: str) -> Path:
    sdir = pdir / "segments"
    sdir.mkdir(parents=True, exist_ok=True)
    return sdir / f"{segment_id}.wav"


def _chunk_output_path(pdir: Path, chunk: dict) -> Path:
    sdir = pdir / "segments"
    sdir.mkdir(parents=True, exist_ok=True)
    return sdir / f"{chunk['segments'][0]['id']}.wav"


def _render_segment(engine_id: str, text: str, profile_name: str | None, out_wav: Path, safe_mode: bool, on_output, cancel_check, task_id: str | None = None) -> int:
    if not profile_name:
        on_output(f"[error] No profile is assigned for this segment ({engine_id}).\n")
        return 1

    from app.engines.behavior import extract_engine_settings, has_behavior, get_text_split_target
    spk = get_speaker_settings(profile_name)
    settings = extract_engine_settings(engine_id, spk)

    text = (text or "").strip()
    if safe_mode and has_behavior(engine_id, "sanitize_text"):
        text = sanitize_text(text, get_sanitize_categories(engine_id))
        text = safe_split_long_sentences(text, target=get_text_split_target(engine_id))

    # Resolve the voice profile directory so engines like Voxtral can find
    # reference audio (the engine core stays portable and never guesses paths).
    try:
        pdir = get_voice_profile_dir(profile_name)
    except ValueError:
        from app.core.config import VOICES_DIR
        pdir = VOICES_DIR / profile_name

    # Synthesis request with generic settings extraction
    return generate_via_bridge(
        engine=engine_id,
        text=text,
        out_wav=out_wav,
        profile_name=profile_name,
        safe_mode=safe_mode,
        on_output=on_output,
        cancel_check=cancel_check,
        task_id=task_id,
        voice_profile_dir=pdir,
        **settings
    )


def _group_needs_render(group: dict, pdir: Path) -> bool:
    expected_path = _chunk_output_path(pdir, group)
    if not expected_path.exists():
        return True

    for segment in group["segments"]:
        if segment.get("audio_status") != "done":
            return True
        if segment.get("audio_file_path") != expected_path.name:
            return True
    return False


def _group_ready_audio_path(group: dict, pdir: Path) -> Path | None:
    audio_path = group["segments"][0].get("audio_file_path")
    if not audio_path:
        return None
    candidate = pdir / "segments" / audio_path
    return candidate if candidate.exists() else None


def _persist_mixed_chapter_output(jid: str, chapter_id: str, output_path: Path) -> None:
    from app.db import update_chapter

    generated_at = time.time()
    duration = get_audio_duration(output_path)

    try:
        update_chapter(
            chapter_id,
            audio_status="done",
            audio_file_path=output_path.name,
            audio_generated_at=generated_at,
            audio_length_seconds=duration,
        )
        logger.info(
            "[mixed-render %s] mixed-persist job=%s chapter=%s output_file=%s audio_length=%s",
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
            jid,
            chapter_id,
            output_path.name,
            duration,
        )
    except Exception:
        logger.warning("Failed to persist chapter %s completion metadata for job %s", chapter_id, jid, exc_info=True)


def handle_mixed_job(jid, j, start, on_output, cancel_check, text=None):
    from app.db import (
        clear_duplicate_segment_audio_paths,
        get_chapter_segments,
        get_connection,
        update_segment,
        update_segments_bulk,
        update_segments_status_bulk,
    )
    from app.api.ws import broadcast_segments_updated

    if cancel_check():
        update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
        return "cancelled", "Cancelled."

    if not j.chapter_id:
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="Mixed-engine jobs require a chapter context.")
        return "failed", "Mixed-engine jobs require a chapter context."

    if not j.project_id:
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="Mixed-engine jobs require a project context.")
        return "failed", "Mixed-engine jobs require a project context."

    pdir = get_chapter_dir(j.project_id, j.chapter_id)
    pdir.mkdir(parents=True, exist_ok=True)
    out_wav = pdir / f"{Path(j.chapter_file).stem}.wav"

    all_segments = load_chunk_segments(j.chapter_id)
    all_groups = build_chunk_groups(all_segments, j.speaker_profile)
    if j.segment_ids:
        target_ids = set(j.segment_ids)
        target_groups = [group for group in all_groups if any(segment["id"] in target_ids for segment in group["segments"])]
    elif j.is_bake:
        target_groups = [group for group in all_groups if _group_needs_render(group, pdir)]
    else:
        target_groups = all_groups

    total_synthesis_seconds: float = 0.0

    for group in target_groups:
        if cancel_check():
            update_job(jid, status="cancelled", finished_at=time.time(), progress=1.0, error="Cancelled.")
            return "cancelled", "Cancelled."

        segment_id = group["segments"][0]["id"]
        profile_name = group["profile_name"]
        engine = group["engine"]
        chunk_text = " ".join(group["text_parts"]).strip()
        seg_out = _chunk_output_path(pdir, group)

        # The orchestrator's marker pipeline owns chapter-level progress:
        # [START_SEGMENT] sets the active segment, [PROGRESS] lines drive weighted
        # progress, and [SEGMENT_SAVED] accumulates the completed group weight.
        on_output(f"[START_SEGMENT] {segment_id}\n")
        for group_segment in group["segments"]:
            update_segment(
                group_segment["id"],
                broadcast=False,
                audio_status="processing",
            )
        try:
            broadcast_segments_updated(j.chapter_id)
        except Exception:
            logger.warning("Failed to broadcast segment update for chapter %s", j.chapter_id, exc_info=True)

        try:
            _seg_start = time.monotonic()
            # Forward engine output (including [PROGRESS] lines) untouched; the
            # orchestrator parses them and computes weighted chapter progress.
            rc = _render_segment(engine, chunk_text, profile_name, seg_out, j.safe_mode, on_output, cancel_check, task_id=jid)
            total_synthesis_seconds += time.monotonic() - _seg_start
        except EngineBridgeError as exc:
            update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=str(exc))
            return "failed", str(exc)

        if rc != 0 or not seg_out.exists():
            msg = f"Failed to generate segment {segment_id} with {engine}."
            update_job(
                jid,
                status="failed",
                finished_at=time.time(),
                progress=1.0,
                error=msg,
            )
            return "failed", msg

        # Tell the orchestrator this group's output is saved so it can accumulate
        # the completed weight. The path matches the task script's save_path
        # (str(seg_out.absolute()) built from the same chapter dir + leader id).
        on_output(f"[SEGMENT_SAVED] {seg_out.absolute()}\n")

        generated_at = time.time()
        group_sids = [gs["id"] for gs in group["segments"]]
        update_segments_bulk(
            group_sids,
            audio_status="done",
            audio_file_path=seg_out.name,
            audio_generated_at=generated_at,
        )
        clear_duplicate_segment_audio_paths(j.chapter_id, group_sids, seg_out.name)

    if j.segment_ids:
        try:
            broadcast_segments_updated(j.chapter_id)
        except Exception:
            pass

        try:
            from app.db.chapters import get_chapter_segments_counts
            done_c, total_c = get_chapter_segments_counts(j.chapter_id)
            final_p = round(done_c / total_c, 2) if total_c > 0 else 1.0
        except Exception:
            logger.warning("Failed to compute final segment progress for chapter %s", j.chapter_id, exc_info=True)
            final_p = 1.0
        update_job(
            jid,
            status="done",
            progress=final_p,
            finished_at=time.time(),
        )
        return "done", None

    segment_paths = []
    fresh_groups = build_chunk_groups(get_chapter_segments(j.chapter_id), j.speaker_profile)
    for group in fresh_groups:
        group_path = _group_ready_audio_path(group, pdir)
        if group_path and (not segment_paths or segment_paths[-1] != group_path):
            segment_paths.append(group_path)

    if not segment_paths:
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error="No valid segment audio was available to stitch.")
        return "failed", "No valid segment audio was available to stitch."

    rc = stitch_segments(pdir, segment_paths, out_wav, on_output, cancel_check)
    if rc != 0 or not out_wav.exists():
        update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=f"Stitching failed (rc={rc}).")
        return "failed", f"Stitching failed (rc={rc})."

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (j.chapter_id,))
        sids = [row["id"] for row in cursor.fetchall()]
        update_segments_status_bulk(sids, j.chapter_id, "done")

    _persist_mixed_chapter_output(jid, j.chapter_id, out_wav)

    update_job(
        jid,
        status="done",
        finished_at=time.time(),
        progress=1.0,
        output_wav=out_wav.name,
        synthesis_duration_seconds=max(round(total_synthesis_seconds, 2), 0.01),
    )

    # Record metrics for the mixed engine performance history
    chars = sum(_group_weight(g) for g in target_groups)
    perf = get_performance_metrics()
    # record_engine_sample's 5th arg is the SEGMENT count actually rendered in this
    # job (it drives seconds_per_segment). Render-group count is tracked separately on
    # the job. Count the segments across the groups rendered here, not the group count.
    rendered_segment_count = sum(len(g.get("segments") or []) for g in target_groups)
    try:
        record_engine_sample(j, start, chars, perf, rendered_segment_count)
    except Exception:
        logger.warning("Failed to record engine sample for job %s — metrics not updated", jid, exc_info=True)

    return "done", None
