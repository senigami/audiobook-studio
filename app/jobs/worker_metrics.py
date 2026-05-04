from __future__ import annotations
import time
import logging

from ..state import update_performance_metrics as _update_performance_metrics, get_jobs, get_performance_metrics
from ..config import BASELINE_ENGINE_CPS
from ..orchestration.scheduler.eta import get_robust_eta_params
from .worker_helpers import _job_field

logger = logging.getLogger(__name__)

update_performance_metrics = _update_performance_metrics


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
    # We now allow all engines to record samples if they have a non-zero character count.
    # Mixed chapters are also recorded under the 'mixed' engine ID.

    eff_start = _job_field(persisted, "synthesis_started_at", _job_field(job, "synthesis_started_at"))
    eff_start = eff_start or start
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

    base_cps = chars / dur
    from ..db.performance import record_render_sample

    # Record detailed sample
    record_render_sample(
        engine=engine,
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
    )

    # Re-derive robust CPS for engine-specific ETA logic
    current_perf = get_performance_metrics()
    all_history = current_perf.get("render_history") or []
    history = [s for s in all_history if s.get("engine") == engine]

    engine_cps_map = current_perf.get("engine_cps") or {}
    fallback_cps = engine_cps_map.get(engine, BASELINE_ENGINE_CPS)

    robust_params = get_robust_eta_params(history, fallback_cps)
    robust_cps = robust_params[0] if robust_params else fallback_cps

    engine_cps_map[engine] = round(robust_cps, 2)
    update_performance_metrics(
        engine_cps=engine_cps_map
    )
