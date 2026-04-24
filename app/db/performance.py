import time
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection

logger = logging.getLogger(__name__)
_STATS_RESET_KEY = "render_stats_reset_at"


def _ensure_settings_table(cursor) -> None:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)

def record_render_sample(
    engine: str,
    chars: int,
    segment_count: int,
    duration_seconds: float,
    word_count: Optional[int] = None,
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
    if word_count is None:
        word_count = 0

    if cps is None or seconds_per_segment is None:
        return  # Cannot record invalid sample

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            _ensure_settings_table(cursor)
            completed_at = completed_at or time.time()
            cursor.execute(
                """
                INSERT INTO render_performance_samples (
                    job_id, project_id, chapter_id, engine, speaker_profile,
                    chars, word_count, segment_count, render_group_count, started_at,
                    completed_at, duration_seconds, cps, seconds_per_segment,
                    audio_duration_seconds, make_mp3
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id, project_id, chapter_id, engine, speaker_profile,
                    chars, max(0, int(word_count or 0)), segment_count, render_group_count, started_at,
                    completed_at, duration_seconds, cps, seconds_per_segment,
                    audio_duration_seconds, 1 if make_mp3 else 0,
                ),
            )
            conn.commit()


def _read_stats_reset_at(cursor) -> float | None:
    _ensure_settings_table(cursor)
    cursor.execute("SELECT value FROM settings WHERE key = ?", (_STATS_RESET_KEY,))
    row = cursor.fetchone()
    if not row:
        return None
    value = row["value"] if hasattr(row, "keys") else row[0]
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def reset_render_stats() -> Dict[str, Any]:
    """Set a new baseline so future render stats start counting from now."""
    now = time.time()
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            _ensure_settings_table(cursor)
            cursor.execute(
                """
                INSERT INTO settings (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (_STATS_RESET_KEY, str(now)),
            )
            conn.commit()
    return get_render_stats()

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


def get_render_stats() -> Dict[str, Any]:
    """Summarize render history for the About page and diagnostics."""
    try:
        with _db_lock:
            with get_connection() as conn:
                cursor = conn.cursor()
                reset_at = _read_stats_reset_at(cursor)
                if reset_at is None:
                    cursor.execute("SELECT MIN(completed_at) AS earliest_completed_at FROM render_performance_samples")
                    reset_row = dict(cursor.fetchone() or {})
                    reset_at = float(reset_row.get("earliest_completed_at") or time.time())

                cursor.execute(
                    """
                    SELECT
                        COUNT(*) AS sample_count,
                        COALESCE(SUM(COALESCE(audio_duration_seconds, duration_seconds, 0)), 0) AS audio_duration_seconds,
                        COALESCE(SUM(duration_seconds), 0) AS render_duration_seconds,
                        COALESCE(SUM(chars), 0) AS chars,
                        COALESCE(SUM(COALESCE(word_count, 0)), 0) AS word_count
                    FROM render_performance_samples
                    WHERE completed_at >= ?
                    """
                    ,
                    (reset_at,)
                )
                summary = dict(cursor.fetchone() or {})
                cursor.execute(
                    """
                    SELECT
                        engine,
                        COUNT(*) AS sample_count,
                        COALESCE(SUM(COALESCE(audio_duration_seconds, duration_seconds, 0)), 0) AS audio_duration_seconds,
                        COALESCE(SUM(duration_seconds), 0) AS render_duration_seconds
                    FROM render_performance_samples
                    WHERE completed_at >= ?
                    GROUP BY engine
                    ORDER BY sample_count DESC, engine ASC
                    """
                    ,
                    (reset_at,)
                )
                by_engine = [dict(row) for row in cursor.fetchall()]
    except Exception:
        logger.warning("Failed to retrieve render stats", exc_info=True)
        summary = {}
        by_engine = []
        reset_at = None

    audio_duration_seconds = float(summary.get("audio_duration_seconds") or 0)
    render_duration_seconds = float(summary.get("render_duration_seconds") or 0)
    reset_dt = datetime.fromtimestamp(reset_at, timezone.utc) if reset_at else None
    return {
        "sample_count": int(summary.get("sample_count") or 0),
        "chars": int(summary.get("chars") or 0),
        "word_count": int(summary.get("word_count") or 0),
        "audio_duration_seconds": audio_duration_seconds,
        "render_duration_seconds": render_duration_seconds,
        "audio_hours_rendered": round(audio_duration_seconds / 3600.0, 2),
        "render_hours_spent": round(render_duration_seconds / 3600.0, 2),
        "since_timestamp": reset_at,
        "since_date": reset_dt.isoformat() if reset_dt else None,
        "by_engine": by_engine,
    }
