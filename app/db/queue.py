import time
import uuid
from typing import List, Dict, Any
from pathlib import Path
from .core import _db_lock, get_connection

def upsert_queue_row(job_id: str, project_id: str = None, chapter_id: str = None, 
                     split_part: int = 0, status: str = 'queued', custom_title: str = None, engine: str = None):
    """
    Insert or update a processing_queue row for any job type.
    Called by enqueue() so EVERY job appears in the global queue.
    Uses INSERT OR IGNORE so it won't overwrite a row already created.
    """
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            now = time.time()
            cursor.execute("""
                INSERT OR IGNORE INTO processing_queue (id, project_id, chapter_id, split_part, status, created_at, custom_title, engine)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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

            # 1. Reset everything (files and DB) to a clean state first
            from .chapters import reset_chapter_audio
            reset_chapter_audio(chapter_id)

            queue_id = f"job-{uuid.uuid4()}"
            now = time.time()
            cursor.execute("""
                INSERT INTO processing_queue (id, project_id, chapter_id, split_part, status, created_at)
                VALUES (?, ?, ?, ?, 'queued', ?)
            """, (queue_id, project_id, chapter_id, split_part, now))

            # Also update chapter status to 'processing'
            cursor.execute("UPDATE chapters SET audio_status = 'processing', audio_file_path = NULL WHERE id = ?", (chapter_id,))

            conn.commit()
            return queue_id

def get_queue() -> List[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            # Return active jobs sorted by created_at, then history items
            cursor.execute("""
                SELECT q.*, p.name as project_name, c.title as chapter_title, 
                       c.predicted_audio_length, c.char_count
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

def update_queue_item(queue_id: str, status: str, audio_length_seconds: float = 0.0, force_chapter_id: str = None, output_file: str = None):
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
            cursor.execute("SELECT chapter_id, project_id FROM processing_queue WHERE id = ?", (queue_id,))
            row = cursor.fetchone()

            if row:
                cid = row['chapter_id']
                if status == 'done':
                    cursor.execute("""
                        UPDATE chapters 
                        SET audio_status = 'done', 
                            audio_file_path = ?, 
                            audio_generated_at = ?, 
                            audio_length_seconds = ? 
                        WHERE id = ?
                    """, (output_file, now, audio_length_seconds, cid))
                elif status == 'failed':
                    cursor.execute("UPDATE chapters SET audio_status = 'unprocessed' WHERE id = ?", (cid,))
                elif status == 'running':
                    cursor.execute("UPDATE chapters SET audio_status = 'processing' WHERE id = ?", (cid,))
            elif force_chapter_id:
                # Still check if we SHOULD update even if queue row is gone (usually no if we want to stay reset)
                # For now, if the queue row is gone, we assume it was a reset/cancel and we SHOULD NOT update chapters.
                pass

            conn.commit()

def reconcile_queue_status(active_ids: List[str]):
    """Sets any 'running' or 'queued' jobs to 'cancelled' if their ID is not in the active_ids list."""
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            now = time.time()
            placeholders = ','.join(['?'] * len(active_ids)) if active_ids else "''"

            # Find jobs that are in processing state but not active in state.json
            cursor.execute(f"""
                UPDATE processing_queue 
                SET status = 'cancelled', completed_at = ? 
                WHERE status IN ('running', 'queued', 'preparing', 'finalizing') AND id NOT IN ({placeholders})
            """, (now, *active_ids))

            # Also sync chapter status
            cursor.execute(f"""
                UPDATE chapters 
                SET audio_status = 'unprocessed' 
                WHERE id IN (
                    SELECT chapter_id FROM processing_queue 
                    WHERE status = 'cancelled' AND id NOT IN ({placeholders})
                )
            """, (*active_ids,))

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
