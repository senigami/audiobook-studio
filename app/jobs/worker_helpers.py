from __future__ import annotations
import time
import re
import logging
from typing import Dict, Any, Optional

from ..state import update_job

logger = logging.getLogger(__name__)


def _calculate_group_resume_state(job) -> tuple[float, int, int]:
    if not getattr(job, "chapter_id", None):
        return 0.0, 0, 0

    try:
        from ..chunk_groups import build_chunk_groups, load_chunk_segments

        groups = build_chunk_groups(load_chunk_segments(job.chapter_id), job.speaker_profile)
        if not groups:
            return 0.0, 0, 0

        completed_groups = 0
        for group in groups:
            segments = group.get("segments", [])
            if not segments:
                continue
            if all(segment.get("audio_status") == "done" and segment.get("audio_file_path") for segment in segments):
                completed_groups += 1

        return round(completed_groups / len(groups), 2), completed_groups, len(groups)
    except Exception:
        logger.error("Failed to get grouped chapter progress for resume initialization", exc_info=True)
        return 0.0, 0, 0


def _calculate_group_resume_progress(job) -> float:
    progress, _, _ = _calculate_group_resume_state(job)
    return progress


def _broadcast_segment_progress(j, jid: str, progress: float):
    segment_id = getattr(j, "active_segment_id", None)
    if not segment_id:
        return
    try:
        from ..api.ws import broadcast_segment_progress
        broadcast_segment_progress(jid, getattr(j, "chapter_id", None), segment_id, progress)
    except Exception:
        logger.debug("Failed to broadcast segment progress for %s", jid, exc_info=True)


def _should_stream_predicted_progress(engine: str | None) -> bool:
    return engine == "audiobook"


def _looks_like_external_download_progress(line: str, lowered: str | None = None) -> bool:
    lowered = lowered or line.lower()
    if "%|" not in line or ":" not in line:
        return False
    if "[progress]" in lowered or "synthesizing" in lowered:
        return False
    if any(token in lowered for token in ["downloading (", "fetching ", "converting "]):
        return True
    return bool(re.search(r"[a-z0-9._-]+\.(json|txt|bin|pth|pt|ckpt|onnx|safetensors)(?:\.[a-z0-9]+)*:", lowered))


def _mark_queue_failed(jid: str, error_message: str | None = None):
    try:
        from ..db import update_queue_item
        update_queue_item(jid, "failed")
    except Exception as e:
        logger.warning("Could not mark queue item %s failed: %s", jid, e, exc_info=True)

    if error_message:
        try:
            update_job(jid, status="failed", finished_at=time.time(), progress=1.0, error=error_message)
        except Exception as e:
            logger.warning("Could not update failed job state for %s: %s", jid, e, exc_info=True)


def _job_field(job, key: str, default=None):
    if isinstance(job, dict):
        return job.get(key, default)
    return getattr(job, key, default)
