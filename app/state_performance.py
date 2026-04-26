import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from .state_helpers import _STATE_LOCK, _load_state_no_lock, _atomic_write_text, STATE_FILE

logger = logging.getLogger(__name__)

_PERFORMANCE_METRICS_SETTING_KEY = "performance_metrics"
_DEFAULT_PERFORMANCE_METRICS = {
    "audiobook_speed_multiplier": 1.0,
    "xtts_cps": 16.7,
    "xtts_render_history": [],
}


def _default_performance_metrics() -> Dict[str, Any]:
    return {
        "audiobook_speed_multiplier": _DEFAULT_PERFORMANCE_METRICS["audiobook_speed_multiplier"],
        "xtts_cps": _DEFAULT_PERFORMANCE_METRICS["xtts_cps"],
        "xtts_render_history": [],
    }


def _normalize_performance_metrics(metrics: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    normalized = _default_performance_metrics()
    if metrics:
        normalized.update(metrics)

    try:
        normalized["audiobook_speed_multiplier"] = float(normalized.get("audiobook_speed_multiplier", 1.0))
    except (TypeError, ValueError):
        normalized["audiobook_speed_multiplier"] = 1.0

    try:
        normalized["xtts_cps"] = float(normalized.get("xtts_cps", 16.7))
    except (TypeError, ValueError):
        normalized["xtts_cps"] = 16.7

    history = normalized.get("xtts_render_history")
    normalized["xtts_render_history"] = history if isinstance(history, list) else []
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


def _read_legacy_performance_metrics_json(cursor) -> Optional[Dict[str, Any]]:
    cursor.execute(
        "SELECT value FROM settings WHERE key = ?",
        (_PERFORMANCE_METRICS_SETTING_KEY,),
    )
    row = cursor.fetchone()
    if not row:
        return None
    value = row["value"] if hasattr(row, "keys") else row[0]
    try:
        from json import JSONDecodeError
        decoded = json.loads(value)
    except (TypeError, ValueError, JSONDecodeError):
        return None
    return decoded if isinstance(decoded, dict) else None


def _record_legacy_performance_history(history: list[Dict[str, Any]]) -> None:
    from .db.performance import record_render_sample

    for sample in history:
        if not isinstance(sample, dict):
            continue
        record_render_sample(
            engine=str(sample.get("engine") or "xtts"),
            chars=int(sample.get("chars") or 0),
            word_count=int(sample.get("word_count") or 0),
            segment_count=max(1, int(sample.get("segment_count") or 1)),
            duration_seconds=float(sample.get("duration_seconds") or 0),
            cps=float(sample["cps"]) if sample.get("cps") is not None else None,
            seconds_per_segment=(
                float(sample["seconds_per_segment"])
                if sample.get("seconds_per_segment") is not None
                else None
            ),
            job_id=sample.get("job_id"),
            project_id=sample.get("project_id"),
            chapter_id=sample.get("chapter_id"),
            speaker_profile=sample.get("speaker_profile"),
            render_group_count=int(sample.get("render_group_count") or 0),
            started_at=sample.get("started_at"),
            audio_duration_seconds=sample.get("audio_duration_seconds"),
            make_mp3=bool(sample.get("make_mp3")),
            completed_at=sample.get("completed_at"),
        )


def _read_performance_metrics_from_db() -> Dict[str, Any]:
    metrics = _default_performance_metrics()
    try:
        from .db.core import get_connection
        from .db.performance import get_render_history

        legacy_history = None
        legacy_metrics_found = False

        with get_connection() as conn:
            cursor = conn.cursor()
            _ensure_settings_table(cursor)
            legacy_metrics = _read_legacy_performance_metrics_json(cursor)
            if legacy_metrics:
                legacy_metrics_found = True
                metrics["audiobook_speed_multiplier"] = legacy_metrics.get(
                    "audiobook_speed_multiplier",
                    metrics["audiobook_speed_multiplier"],
                )
                metrics["xtts_cps"] = legacy_metrics.get("xtts_cps", metrics["xtts_cps"])
                history = legacy_metrics.get("xtts_render_history")
                if isinstance(history, list):
                    legacy_history = history

            # 1. Read scalars from settings table
            metrics["audiobook_speed_multiplier"] = _read_setting_float(
                cursor,
                "performance_metric:audiobook_speed_multiplier",
                float(metrics["audiobook_speed_multiplier"]),
            )
            metrics["xtts_cps"] = _read_setting_float(
                cursor,
                "performance_metric:xtts_cps",
                float(metrics["xtts_cps"]),
            )

            # 2. Read history from render_performance_samples table
            metrics["xtts_render_history"] = get_render_history(limit=100)

            if legacy_metrics:
                _write_setting_value(
                    cursor,
                    "performance_metric:audiobook_speed_multiplier",
                    metrics["audiobook_speed_multiplier"],
                )
                _write_setting_value(cursor, "performance_metric:xtts_cps", metrics["xtts_cps"])

        if legacy_history and not metrics["xtts_render_history"]:
            _record_legacy_performance_history(legacy_history)
            metrics["xtts_render_history"] = get_render_history(limit=100)

        if legacy_metrics_found:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM settings WHERE key = ?", (_PERFORMANCE_METRICS_SETTING_KEY,))
                conn.commit()
    except Exception:
        logger.warning("Failed to read performance metrics from database", exc_info=True)
    return _normalize_performance_metrics(metrics)


def _write_performance_metrics_to_db(metrics: Dict[str, Any]) -> bool:
    try:
        from .db.core import get_connection

        with get_connection() as conn:
            cursor = conn.cursor()
            _ensure_settings_table(cursor)
            _write_setting_value(
                cursor,
                "performance_metric:audiobook_speed_multiplier",
                metrics["audiobook_speed_multiplier"],
            )
            _write_setting_value(
                cursor,
                "performance_metric:xtts_cps",
                metrics["xtts_cps"],
            )
            # History is NOT written via this path anymore.
            # Individual samples are recorded via record_render_sample().
            conn.commit()
        return True
    except Exception:
        logger.warning("Failed to write performance metrics to database", exc_info=True)
        return False


def _remove_legacy_performance_metrics_from_state(state: Dict[str, Any]) -> None:
    if "performance_metrics" not in state:
        return
    state.pop("performance_metrics", None)
    _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))


def get_performance_metrics() -> Dict[str, Any]:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        metrics = _read_performance_metrics_from_db()
        legacy_metrics = state.get("performance_metrics")

        if legacy_metrics is not None:
            # Migration from state.json
            metrics["audiobook_speed_multiplier"] = legacy_metrics.get("audiobook_speed_multiplier", metrics["audiobook_speed_multiplier"])
            metrics["xtts_cps"] = legacy_metrics.get("xtts_cps", metrics["xtts_cps"])

            history = legacy_metrics.get("xtts_render_history")
            if history and isinstance(history, list) and not metrics["xtts_render_history"]:
                from .db.performance import record_render_sample
                for sample in history:
                    record_render_sample(**sample)

            # Write back to DB to ensure scalars are saved
            _write_performance_metrics_to_db(metrics)
            # Re-read to ensure we have the final migrated state in the return value
            metrics = _read_performance_metrics_from_db()
            _remove_legacy_performance_metrics_from_state(state)

        return metrics


def update_performance_metrics(**updates) -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        metrics = _read_performance_metrics_from_db()
        if "performance_metrics" in state:
            legacy_metrics = _normalize_performance_metrics(state.get("performance_metrics"))
            metrics = _normalize_performance_metrics({**metrics, **legacy_metrics})
            if legacy_metrics.get("xtts_render_history") and not metrics.get("xtts_render_history"):
                metrics["xtts_render_history"] = legacy_metrics["xtts_render_history"][-30:]
        metrics.update(updates)
        metrics = _normalize_performance_metrics(metrics)
        _write_performance_metrics_to_db(metrics)
        _remove_legacy_performance_metrics_from_state(state)
