import time
import uuid
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection

ACTIVE_QUEUE_STATUSES = ("queued", "preparing", "running", "finalizing")
TERMINAL_QUEUE_STATUSES = ("done", "failed", "cancelled")


def _legacy_chapter_scope(queue_id: str) -> bool:
    """Compatibility fallback for callers that have not yet passed scope explicitly."""
    try:
        from ..state import get_jobs

        job = get_jobs().get(queue_id)
        return not bool(getattr(job, "segment_ids", None)) if job else True
    except Exception:
        return True
def upsert_queue_row(job_id: str, project_id: str = None, chapter_id: str = None, 
                     split_part: int = 0, status: str = 'queued', custom_title: str = None, engine: str = None):
    """
    Insert or update a processing_queue row for any job type.
    Called by enqueue() so EVERY job appears in the global queue.
    Uses an upsert so rows created earlier by add_to_queue() still receive
    their final display metadata once the live job object is created.
    """
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            now = time.time()
            cursor.execute("""
                INSERT INTO processing_queue (id, project_id, chapter_id, split_part, status, created_at, custom_title, engine)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    project_id = COALESCE(excluded.project_id, processing_queue.project_id),
                    chapter_id = COALESCE(excluded.chapter_id, processing_queue.chapter_id),
                    split_part = COALESCE(excluded.split_part, processing_queue.split_part),
                    custom_title = COALESCE(excluded.custom_title, processing_queue.custom_title),
                    engine = COALESCE(excluded.engine, processing_queue.engine)
            """, (job_id, project_id, chapter_id, split_part, status, now, custom_title, engine))
            conn.commit()

def add_to_queue(project_id: str, chapter_id: str, split_part: int = 0):
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()

            # Check if already in queue
            cursor.execute("SELECT id FROM processing_queue WHERE chapter_id = ? AND status NOT IN ('done', 'failed', 'cancelled')", (chapter_id,))
            if cursor.fetchone():
                return None

            # Keep completed segment history intact when queueing a chapter again.
            # Only clear the chapter-level outputs so the new run can replace them.
            from .chapters import cleanup_chapter_audio_files
            cleanup_chapter_audio_files(project_id, chapter_id)

            cursor.execute(
                "SELECT id FROM chapter_segments WHERE chapter_id = ? AND audio_status = 'processing'",
                (chapter_id,)
            )
            stale_processing_ids = [row["id"] for row in cursor.fetchall()]
            if stale_processing_ids:
                placeholders = ",".join(["?"] * len(stale_processing_ids))
                cursor.execute(
                    f"""
                    UPDATE chapter_segments
                    SET audio_status = 'unprocessed',
                        audio_file_path = NULL,
                        audio_generated_at = NULL
                    WHERE id IN ({placeholders})
                    """,
                    stale_processing_ids
                )
                cleanup_chapter_audio_files(project_id, chapter_id, stale_processing_ids)

            queue_id = f"job-{uuid.uuid4()}"
            now = time.time()
            cursor.execute("""
                INSERT INTO processing_queue (id, project_id, chapter_id, split_part, status, created_at)
                VALUES (?, ?, ?, ?, 'queued', ?)
            """, (queue_id, project_id, chapter_id, split_part, now))

            # Mark the chapter as actively queued without touching segment-level progress.
            cursor.execute("""
                UPDATE chapters
                SET audio_status = 'processing',
                    audio_file_path = NULL,
                    audio_generated_at = NULL,
                    audio_length_seconds = NULL
                WHERE id = ?
            """, (chapter_id,))

            conn.commit()
            return queue_id

def get_queue() -> List[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            # Return active jobs sorted by created_at, then history items
            cursor.execute("""
                SELECT q.*, p.name as project_name, c.title as chapter_title, 
                       c.predicted_audio_length, c.char_count,
                       c.audio_status as chapter_audio_status,
                       c.audio_file_path as chapter_audio_file_path
                FROM processing_queue q
                LEFT JOIN projects p ON q.project_id = p.id
                LEFT JOIN chapters c ON q.chapter_id = c.id
                ORDER BY 
                   CASE WHEN q.status IN ('queued', 'running', 'preparing', 'finalizing') THEN 0 ELSE 1 END,
                   CASE WHEN q.status IN ('queued', 'running', 'preparing', 'finalizing') THEN q.created_at END ASC,
                   q.completed_at DESC,
                   q.created_at DESC
            """)
            return [dict(row) for row in cursor.fetchall()]

def clear_queue() -> bool:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            # 1. Reset chapter status for all pending/preparing jobs (NOT running or failed)
            cursor.execute("""
                UPDATE chapters 
                SET audio_status = 'unprocessed' 
                WHERE id IN (
                    SELECT chapter_id FROM processing_queue 
                    WHERE status IN ('queued', 'preparing')
                )
            """)
            # 2. Delete all non-running queue items (including done, failed and cancelled)
            cursor.execute("DELETE FROM processing_queue WHERE status IN ('queued', 'preparing', 'done', 'failed', 'cancelled')")
            conn.commit()
            return True

def update_queue_item(queue_id: str, status: str, audio_length_seconds: float = 0.0, force_chapter_id: str = None, output_file: str = None, chapter_scoped: Optional[bool] = None):
    import logging

    logger = logging.getLogger(__name__)
    should_update_chapter = _legacy_chapter_scope(queue_id) if chapter_scoped is None else chapter_scoped
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            now = time.time()

            updates = ["status = ?"]
            params = [status]

            if status in ('running', 'preparing'):
                updates.append("started_at = COALESCE(started_at, ?)")
                params.append(now)
            elif status in ('done', 'failed', 'cancelled'):
                updates.append("completed_at = ?")
                params.append(now)

            params.append(queue_id)
            cursor.execute(f"UPDATE processing_queue SET {', '.join(updates)} WHERE id = ?", params)

            # If it's a chapter job, sync the chapters table
            cursor.execute("SELECT chapter_id, project_id, engine FROM processing_queue WHERE id = ?", (queue_id,))
            row = cursor.fetchone()

            if row:
                cid = row['chapter_id']
                engine = row["engine"]
                if should_update_chapter:
                    if status == 'done':
                        cursor.execute("""
                            UPDATE chapters 
                            SET audio_status = 'done', 
                                audio_file_path = ?, 
                                audio_generated_at = ?, 
                                audio_length_seconds = ? 
                            WHERE id = ?
                        """, (output_file, now, audio_length_seconds, cid))
                        if engine in ("voxtral", "mixed"):
                            logger.info(
                                "[voxtral-debug %s] queue-sync id=%s engine=%s status=%s chapter=%s output_file=%s audio_length=%s",
                                time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
                                queue_id,
                                engine,
                                status,
                                cid,
                                output_file,
                                audio_length_seconds,
                            )
                    elif status == 'failed':
                        cursor.execute("UPDATE chapters SET audio_status = 'unprocessed' WHERE id = ?", (cid,))
                    elif status == 'running':
                        cursor.execute("UPDATE chapters SET audio_status = 'processing' WHERE id = ?", (cid,))
            conn.commit()

def reconcile_queue_status(active_ids: List[str], known_job_statuses: Dict[str, str] | None = None):
    """
    Reconcile active queue rows against the in-memory job map.

    - rows still active in SQLite but terminal in memory are updated to that
      terminal status
    - rows active in SQLite and absent from active memory are cancelled
    """
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            now = time.time()
            placeholders = ','.join(['?'] * len(active_ids)) if active_ids else "''"

            terminal_ids = []
            terminal_pairs: list[tuple[str, str]] = []
            if known_job_statuses:
                terminal_pairs = [
                    (job_id, status)
                    for job_id, status in known_job_statuses.items()
                    if status in TERMINAL_QUEUE_STATUSES
                ]
                terminal_ids = [job_id for job_id, _status in terminal_pairs]

            for job_id, status in terminal_pairs:
                cursor.execute(
                    """
                    UPDATE processing_queue
                    SET status = ?,
                        completed_at = COALESCE(completed_at, ?)
                    WHERE id = ?
                      AND status IN ('queued', 'preparing', 'running', 'finalizing')
                    """,
                    (status, now, job_id),
                )

            # Find jobs that are in processing state but not active in state.json
            cursor.execute(f"""
                UPDATE processing_queue 
                SET status = 'cancelled', completed_at = ? 
                WHERE status IN ('running', 'queued', 'preparing', 'finalizing')
                  AND id NOT IN ({placeholders})
                  AND id NOT IN ({','.join(['?'] * len(terminal_ids)) if terminal_ids else "''"})
            """, (now, *active_ids, *terminal_ids))

            # Also sync chapter status
            cursor.execute(f"""
                UPDATE chapters 
                SET audio_status = 'unprocessed' 
                WHERE id IN (
                    SELECT chapter_id FROM processing_queue 
                    WHERE status = 'cancelled'
                      AND id NOT IN ({placeholders})
                      AND id NOT IN ({','.join(['?'] * len(terminal_ids)) if terminal_ids else "''"})
                )
            """, (*active_ids, *terminal_ids))

            conn.commit()

def reorder_queue(queue_ids: List[str]) -> bool:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            # SQLite driver implicit transactions conflict with BEGIN
            now = time.time()
            for idx, qid in enumerate(queue_ids):
                cursor.execute("UPDATE processing_queue SET created_at = ? WHERE id = ?", (now + idx, qid))
            conn.commit()
            return True

def clear_completed_queue() -> int:
    """Deletes all 'done', 'failed', and 'cancelled' items from the processing queue."""
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM processing_queue WHERE status IN ('done', 'failed', 'cancelled')")
            conn.commit()
            return cursor.rowcount

def remove_from_queue(queue_id: str) -> bool:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()

            # 1. Reset chapter status before deletion IF it's not already 'done'
            cursor.execute("""
                UPDATE chapters 
                SET audio_status = 'unprocessed'
                WHERE id IN (
                    SELECT chapter_id FROM processing_queue 
                    WHERE id = ? AND status != 'done'
                )
            """, (queue_id,))

            # 2. Delete the queue item
            cursor.execute("DELETE FROM processing_queue WHERE id = ?", (queue_id,))
            conn.commit()
            return cursor.rowcount > 0
