from __future__ import annotations
import time
import logging

from ..db.state import get_jobs
from .worker_helpers import _job_field

logger = logging.getLogger(__name__)



def record_engine_sample(job, start: float, chars: int, perf: dict, source_segment_count: int | None = None):

    # Only train on the persisted terminal job, not the stale in-memory object.
    # Cancelled, failed, or partial jobs must not poison history.
    job_id = _job_field(job, "id")
    persisted = get_jobs().get(job_id) if job_id else None
    status = _job_field(persisted, "status", _job_field(job, "status"))
    if status != "done":
        return

    is_bake = _job_field(persisted, "is_bake", _job_field(job, "is_bake", False))
    if is_bake:
        return
    if chars <= 0:
        return

    engine = _job_field(persisted, "engine", _job_field(job, "engine"))
    tts_model = _resolve_job_tts_model(persisted or job, engine)
    # We now allow all engines to record samples if they have a non-zero character count.
    # Mixed chapters are also recorded under the 'mixed' engine ID.

    # In Studio 2.0, started_at represents the actual render start.
    # In legacy jobs, synthesis_started_at was used.
    eff_start = _job_field(persisted, "started_at")
    if not eff_start or _job_field(persisted, "status") == "preparing":
        eff_start = start

    finished_at = _job_field(persisted, "finished_at", _job_field(job, "finished_at")) or time.time()
    dur = finished_at - eff_start
    if dur <= 1.0: # Filter out cached/instant runs to avoid poisoning metrics
        return

    segment_count = max(1, int(source_segment_count or 0))
    chapter_id = _job_field(persisted, "chapter_id", _job_field(job, "chapter_id"))
    word_count = 0
    if chapter_id:
        try:
            from ..db.chapters import get_chapter
            chapter_row = get_chapter(chapter_id) or {}
            chapter_text = str(chapter_row.get("text_content") or "")
            word_count = len(chapter_text.split())
        except Exception:
            logger.debug("Failed to calculate chapter word count for history recording", exc_info=True)

    if not source_segment_count and chapter_id:
        try:
            from ..db.chapters import get_chapter_segments_counts
            _, total_c = get_chapter_segments_counts(chapter_id)
            segment_count = max(1, total_c)
        except Exception:
            logger.debug("Failed to calculate segment count from DB for history recording, falling back to job state", exc_info=True)
            # Fallback
            segment_ids = _job_field(persisted, "segment_ids", _job_field(job, "segment_ids", [])) or []
            segment_count = max(1, len(segment_ids or [1]))
    elif not source_segment_count:
        segment_ids = _job_field(persisted, "segment_ids", _job_field(job, "segment_ids", [])) or []
        segment_count = max(1, len(segment_ids or [1]))

    synthesis_dur = _job_field(persisted, "synthesis_duration_seconds", _job_field(job, "synthesis_duration_seconds"))
    if not synthesis_dur or synthesis_dur <= 0:
        raise ValueError("synthesis_duration_seconds is mandatory and must be positive")
    base_cps = chars / synthesis_dur
    from ..db.performance import record_render_sample

    # Record detailed sample
    try:
        record_render_sample(
            engine=engine,
            tts_model=tts_model,
            chars=chars,
            word_count=word_count,
            segment_count=segment_count,
            duration_seconds=round(dur, 2),
            cps=round(base_cps, 2),
            seconds_per_segment=round(dur / segment_count, 2),
            job_id=job_id,
            project_id=_job_field(persisted, "project_id", _job_field(job, "project_id")),
            chapter_id=chapter_id,
            speaker_profile=_job_field(persisted, "speaker_profile", _job_field(job, "speaker_profile")),
            render_group_count=_job_field(persisted, "render_group_count", _job_field(job, "render_group_count", 0)) or 0,
            started_at=eff_start,
            completed_at=finished_at,
            make_mp3=_job_field(persisted, "make_mp3", _job_field(job, "make_mp3", False)),
            synthesis_duration_seconds=synthesis_dur,
        )
    except ValueError as exc:
        logger.warning("Rejected logging sample due to contract validation error: %s", exc)
        raise

    # Re-derive robust CPS logic has been removed/quarantined in favor of calibrated model parameters in studio.db
    pass


def _filter_history_for_engine_model(history: list[dict], engine: str, tts_model: str | None) -> list[dict]:
    from app.tts_server.performance_settings import filter_history_for_engine_model

    return filter_history_for_engine_model(history, engine, tts_model)


def _resolve_job_tts_model(job, engine: str) -> str | None:
    from app.tts_server.performance_settings import normalize_tts_model, resolve_engine_settings_model

    explicit = normalize_tts_model(_job_field(job, "tts_model")) or normalize_tts_model(_job_field(job, "model"))
    if explicit:
        return explicit

    speaker_profile = _job_field(job, "speaker_profile")
    if speaker_profile:
        try:
            from app.db.speakers import get_speaker_settings
            speaker_settings = get_speaker_settings(speaker_profile)
            speaker_model = normalize_tts_model(speaker_settings.get("model")) or normalize_tts_model(speaker_settings.get("preview_model"))
            if speaker_model:
                return speaker_model
        except Exception:
            logger.debug("Failed to resolve speaker model for %s", speaker_profile, exc_info=True)

    return resolve_engine_settings_model(engine)
