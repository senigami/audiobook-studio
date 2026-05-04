import logging

from ..config import VOICES_DIR, SENT_CHAR_LIMIT
from ..db.speakers import (
    DEFAULT_SPEAKER_TEST_TEXT,
    get_profile_wavs as get_speaker_wavs,
    get_speaker_settings,
    update_speaker_settings,
)
from ..orchestration.scheduler.eta import (
    _estimate_seconds,
    calculate_predicted_progress,
    format_seconds,
)
from ..orchestration.scheduler.resources import (
    is_paused as paused,
    set_paused,
)
from ..state import get_jobs, get_performance_metrics, get_settings, put_job, update_job, update_performance_metrics
from .core_shim import assembly_queue, job_queue, pause_flag

logger = logging.getLogger(__name__)

BASELINE_ENGINE_CPS = 10.0

def toggle_pause():
    set_paused(not paused())

def ensure_workers():
    # Decommissioned
    pass

def start_workers():
    # Decommissioned
    pass

def enqueue(job):
    # This should be dead in active runtime. Log a warning.
    logger.warning("Legacy enqueue() called for job %s. This is deprecated.", job.id)
    put_job(job)

def requeue(job_id):
    # This should be dead in active runtime. Log a warning.
    logger.warning("Legacy requeue() called for job %s. This is deprecated.", job_id)
    from ..state import requeue as state_requeue
    state_requeue(job_id)

def cancel(job_id):
    # Legacy cancel flag support is removed.
    # TaskOrchestrator.cancel() is the authoritative path.
    pass

def clear_job_queue():
    pass

def sync_memory_queue():
    pass

def cleanup_and_reconcile():
    return []

def _output_exists(*args, **kwargs):
    return False

__all__ = [
    "enqueue", "requeue", "cancel", "clear_job_queue",
    "paused", "toggle_pause", "set_paused", "cleanup_and_reconcile", "_output_exists",
    "get_speaker_wavs", "get_speaker_settings", "update_speaker_settings", "DEFAULT_SPEAKER_TEST_TEXT",
    "get_jobs", "put_job", "update_job", "get_settings", "get_performance_metrics", "update_performance_metrics",
    "VOICES_DIR", "SENT_CHAR_LIMIT",
    "_estimate_seconds", "calculate_predicted_progress", "BASELINE_ENGINE_CPS", "format_seconds"
]
