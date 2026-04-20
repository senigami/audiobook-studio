import time
import logging
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection

logger = logging.getLogger(__name__)

def record_render_sample(
    engine: str,
    chars: int,
    segment_count: int,
    duration_seconds: float,
    cps: Optional[float] = None,
    seconds_per_segment: Optional[float] = None,
    job_id: Optional[str] = None,
    project_id: Optional[str] = None,
    chapter_id: Optional[str] = None,
    speaker_profile: Optional[str] = None,
    render_group_count: int = 0,
    started_at: Optional[float] = None,
    audio_duration_seconds: Optional[float] = None,
    make_mp3: bool = False,
    completed_at: Optional[float] = None,
):
    """
    Records a successful render sample into the database.
    Only successful terminal 'done' jobs should call this.
    """
    if chars < 0 or duration_seconds <= 0:
        return

    if cps is None and duration_seconds > 0:
        cps = round(chars / duration_seconds, 2)
    if seconds_per_segment is None and duration_seconds > 0:
        seconds_per_segment = round(duration_seconds / max(1, segment_count), 2)

    if cps is None or seconds_per_segment is None:
        return # Cannot record invalid sample

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            completed_at = completed_at or time.time()
            cursor.execute(
                """
                INSERT INTO render_performance_samples (
                    job_id, project_id, chapter_id, engine, speaker_profile,
                    chars, segment_count, render_group_count, started_at,
                    completed_at, duration_seconds, cps, seconds_per_segment,
                    audio_duration_seconds, make_mp3
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id, project_id, chapter_id, engine, speaker_profile,
                    chars, segment_count, render_group_count, started_at,
                    completed_at, duration_seconds, cps, seconds_per_segment,
                    audio_duration_seconds, 1 if make_mp3 else 0
                )
            )
            conn.commit()

def apply_performance_retention_policy():
    """
    Retention policy:
    - Keep all samples from the last 30 days.
    - Always keep at least the newest 100 samples if available, even if older than 30 days.
    - Hard-delete samples older than 180 days no matter what.
    """
    now = time.time()
    day_30_ago = now - (30 * 86400)
    day_180_ago = now - (180 * 86400)

    try:
        with _db_lock:
            with get_connection() as conn:
                cursor = conn.cursor()

                # 1. Hard-delete samples older than 180 days NO MATTER WHAT
                cursor.execute("DELETE FROM render_performance_samples WHERE completed_at < ?", (day_180_ago,))

                # 2. Identify samples older than 30 days that are NOT among the top 100 newest
                # We use a subquery to find the 100th newest sample's timestamp
                cursor.execute("""
                    DELETE FROM render_performance_samples
                    WHERE completed_at < ?
                    AND id NOT IN (
                        SELECT id FROM render_performance_samples
                        ORDER BY completed_at DESC
                        LIMIT 100
                    )
                """, (day_30_ago,))

                conn.commit()
    except Exception:
        logger.warning("Failed to apply performance retention policy", exc_info=True)

def get_render_history(limit: int = 100) -> List[Dict[str, Any]]:
    """
    Retrieves render history ordered chronologically (oldest to newest).
    """
    try:
        with _db_lock:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT * FROM render_performance_samples
                    ORDER BY completed_at DESC
                    LIMIT ?
                """, (limit,))
                rows = cursor.fetchall()
                # Existing consumers expect chronological order (oldest -> newest)
                return [dict(row) for row in reversed(rows)]
    except Exception:
        logger.warning("Failed to retrieve render history", exc_info=True)
        return []
