import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from .state_helpers import _STATE_LOCK, _load_state_no_lock, _atomic_write_text, get_state_file

logger = logging.getLogger(__name__)

_PERFORMANCE_METRICS_SETTING_KEY = "performance_metrics"
_DEFAULT_PERFORMANCE_METRICS = {
    "engine_cps": {},
    "render_history": [],
}


def _default_performance_metrics() -> Dict[str, Any]:
    return {
        "engine_cps": {},
        "render_history": [],
    }


def _normalize_performance_metrics(metrics: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Normalize performance metrics into the generic mapping."""
    normalized = _default_performance_metrics()
    if metrics:
        normalized["engine_cps"] = metrics.get("engine_cps", {})
        normalized["render_history"] = metrics.get("render_history", [])

    if not isinstance(normalized.get("engine_cps"), dict):
        normalized["engine_cps"] = {}

    if not isinstance(normalized.get("render_history"), list):
        normalized["render_history"] = []

    return normalized


def _ensure_settings_table(cursor) -> None:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS render_performance_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            engine TEXT NOT NULL,
            tts_model TEXT,
            speaker_profile TEXT,
            chars INTEGER NOT NULL,
            word_count INTEGER DEFAULT 0,
            segment_count INTEGER NOT NULL,
            render_group_count INTEGER DEFAULT 0,
            duration_seconds REAL NOT NULL,
            cps REAL NOT NULL,
            seconds_per_segment REAL NOT NULL,
            completed_at REAL NOT NULL
        )
    """)
    try:
        cursor.execute("ALTER TABLE render_performance_samples ADD COLUMN tts_model TEXT")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE render_performance_samples ADD COLUMN word_count INTEGER DEFAULT 0")
    except Exception:
        pass
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_render_performance_completed_at
        ON render_performance_samples (completed_at)
    """)


def _read_setting_float(cursor, key: str, default: float) -> float:
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    if not row:
        return default
    value = row["value"] if hasattr(row, "keys") else row[0]
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _write_setting_value(cursor, key: str, value: Any) -> None:
    cursor.execute(
        """
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (key, str(value)),
    )


def _read_performance_metrics_from_db() -> Dict[str, Any]:
    metrics = _default_performance_metrics()
    try:
        from .core import get_connection
        from .performance import get_render_history

        with get_connection() as conn:
            cursor = conn.cursor()
            _ensure_settings_table(cursor)

            cursor.execute("SELECT key, value FROM settings WHERE key LIKE 'performance_metric:cps:%'")
            for row in cursor.fetchall():
                key = row["key"] if hasattr(row, "keys") else row[0]
                val = row["value"] if hasattr(row, "keys") else row[1]
                engine_id = key.split(":")[-1]
                try:
                    metrics["engine_cps"][engine_id] = float(val)
                except (TypeError, ValueError):
                    pass

            # 2. Read history from render_performance_samples table
            metrics["render_history"] = get_render_history(limit=100)

    except Exception:
        logger.warning("Failed to read performance metrics from database", exc_info=True)
    return _normalize_performance_metrics(metrics)


def _write_performance_metrics_to_db(metrics: Dict[str, Any]) -> bool:
    try:
        from .core import get_connection

        with get_connection() as conn:
            cursor = conn.cursor()
            _ensure_settings_table(cursor)
            cursor.execute("DELETE FROM settings WHERE key = ?", ("performance_metric:audiobook_speed_multiplier",))
            for eid, cps in metrics.get("engine_cps", {}).items():
                _write_setting_value(
                    cursor,
                    f"performance_metric:cps:{eid}",
                    cps,
                )
            conn.commit()
        return True
    except Exception:
        logger.warning("Failed to write performance metrics to database", exc_info=True)
        return False


def clear_engine_cps_cache(engine_id: str) -> bool:
    """Remove the cached engine CPS entry from the database settings table."""
    if not engine_id:
        return False

    try:
        from .core import get_connection

        with get_connection() as conn:
            cursor = conn.cursor()
            _ensure_settings_table(cursor)
            cursor.execute(
                "DELETE FROM settings WHERE key IN (?, ?)",
                (
                    f"performance_metric:cps:{engine_id}",
                    "performance_metric:audiobook_speed_multiplier",
                ),
            )
            conn.commit()
        return True
    except Exception:
        logger.warning("Failed to clear performance metric cache for %s", engine_id, exc_info=True)
        return False


def get_performance_metrics() -> Dict[str, Any]:
    with _STATE_LOCK:
        return _read_performance_metrics_from_db()


def update_performance_metrics(**updates) -> None:
    with _STATE_LOCK:
        metrics = _read_performance_metrics_from_db()
        metrics.update(updates)
        metrics = _normalize_performance_metrics(metrics)
        _write_performance_metrics_to_db(metrics)
