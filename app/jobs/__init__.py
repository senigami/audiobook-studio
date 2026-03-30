import logging
import os
import queue
import threading
from .core import job_queue, assembly_queue, cancel_flags, pause_flag, paused, toggle_pause, set_paused, _estimate_seconds, calculate_predicted_progress, BASELINE_XTTS_CPS, format_seconds
from .reconcile import cleanup_and_reconcile, _output_exists
from .speaker import get_speaker_wavs, get_speaker_settings, update_speaker_settings, DEFAULT_SPEAKER_TEST_TEXT
from .worker import worker_loop
from ..state import put_job, get_jobs, update_job, get_settings, get_performance_metrics, update_performance_metrics
from ..config import CHAPTER_DIR, XTTS_OUT_DIR, AUDIOBOOK_DIR, VOICES_DIR, SAMPLES_DIR, SENT_CHAR_LIMIT

logger = logging.getLogger(__name__)
_worker_threads: dict[str, threading.Thread] = {}
_worker_threads_lock = threading.Lock()


def _auto_start_workers_enabled() -> bool:
    return os.getenv("APP_TEST_MODE") != "1"


def ensure_workers():
    with _worker_threads_lock:
        synthesis = _worker_threads.get("synthesis")
        if not synthesis or not synthesis.is_alive():
            synthesis = threading.Thread(target=worker_loop, args=(job_queue,), name="SynthesisWorker", daemon=True)
            synthesis.start()
            _worker_threads["synthesis"] = synthesis
            logger.warning("Started synthesis worker thread.")

        assembly = _worker_threads.get("assembly")
        if not assembly or not assembly.is_alive():
            assembly = threading.Thread(target=worker_loop, args=(assembly_queue,), name="AssemblyWorker", daemon=True)
            assembly.start()
            _worker_threads["assembly"] = assembly
            logger.warning("Started assembly worker thread.")

def enqueue(job):
    ensure_workers()
    put_job(job)
    cancel_flags[job.id] = threading.Event()
    try:
        from ..db import upsert_queue_row
        upsert_queue_row(
            job_id=job.id, project_id=job.project_id, chapter_id=job.chapter_id,
            status='queued', custom_title=job.custom_title, engine=job.engine
        )
    except Exception:
        logger.error("Failed to upsert queue row for job %s", job.id, exc_info=True)

    if job.engine == "audiobook": assembly_queue.put(job.id)
    else: job_queue.put(job.id)

def requeue(job_id):
    j = get_jobs().get(job_id)
    if not j: return

    # Rule 3: Clean Slate Protocol - Wipe metadata
    update_job(
        job_id, 
        status='queued', 
        progress=0.0, 
        log="", 
        started_at=None, 
        finished_at=None, 
        error=None, 
        warning_count=0,
        synthesis_started_at=None,
        force_broadcast=True
    )

    if j.engine == "audiobook": assembly_queue.put(job_id)
    else: job_queue.put(job_id)

def cancel(job_id):
    ev = cancel_flags.get(job_id)
    if ev: ev.set()

def clear_job_queue():
    for q in [job_queue, assembly_queue]:
        while not q.empty():
            try:
                q.get_nowait()
                q.task_done()
            except queue.Empty:
                break

def sync_memory_queue():
    """
    Synchronizes the in-memory job_queue and assembly_queue with the DB's current 
    queued items. Useful after reordering.
    Voice jobs (voice_build, voice_test) are one-shot and must NOT be re-enqueued on restart.
    """
    ensure_workers()
    clear_job_queue()
    from ..db import get_queue, update_queue_item
    # Get all queued items from DB (they are sorted by created_at DESC)
    db_queue = [item for item in get_queue() if item['status'] == 'queued']
    # Refill the FIFO queue in order of priority (first in list = first out)
    for item in db_queue:
        jid = item['id']
        engine = item.get('engine')
        # Voice jobs are one-shot synthesis — skip and mark done in DB to prevent future re-queue
        if engine in ('voice_build', 'voice_test'):
            try:
                update_queue_item(jid, 'done')
            except Exception:
                logger.warning("Failed to mark voice job %s done while syncing memory queue", jid, exc_info=True)
            continue
        if engine == "audiobook": 
            assembly_queue.put(jid)
        else: 
            job_queue.put(jid)

def start_workers():
    ensure_workers()

# Start workers in normal app mode, but not during pytest/test fixtures.
# Tests that need workers should call ensure_workers() explicitly after the
# temporary DB path and schema are ready.
if _auto_start_workers_enabled():
    start_workers()

# Re-exports for public API
__all__ = [
    "enqueue", "requeue", "cancel", "clear_job_queue",
    "paused", "toggle_pause", "set_paused", "cleanup_and_reconcile", "_output_exists",
    "get_speaker_wavs", "get_speaker_settings", "update_speaker_settings", "DEFAULT_SPEAKER_TEST_TEXT",
    "get_jobs", "put_job", "update_job", "get_settings", "get_performance_metrics", "update_performance_metrics",
    "CHAPTER_DIR", "XTTS_OUT_DIR", "AUDIOBOOK_DIR", "VOICES_DIR", "SAMPLES_DIR", "SENT_CHAR_LIMIT",
    "_estimate_seconds", "calculate_predicted_progress", "BASELINE_XTTS_CPS", "format_seconds"
]
