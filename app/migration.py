"""
Legacy Migration Layer

This module centralizes all one-time conversion logic for version 1.x data.
It should be the ONLY location in the app-root that carries engine-specific
literals from the version 1.x era.
"""

import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Legacy Compatibility Keys (Version 1.x)
_LEGACY_KEY_CPS = "xtts_cps"
_LEGACY_KEY_RENDER_HISTORY = "xtts_render_history"
_LEGACY_ENGINE_ID_FALLBACK = "xtts"

_DEPRECATED_SPEED_KEYS = ["xtts_speed", "voxtral_speed"]

def migrate_performance_metrics(metrics: Dict[str, Any]) -> Dict[str, Any]:
    """
    Migration Shim: Normalize legacy engine-specific performance metrics
    into the generic mapping.
    """
    # 1. Handle CPS migration
    legacy_cps_val = metrics.pop(_LEGACY_KEY_CPS, None)
    if legacy_cps_val is not None:
        try:
            engine_cps = metrics.setdefault("engine_cps", {})
            # Note: Legacy CPS explicitly maps to the original default engine ID
            if _LEGACY_ENGINE_ID_FALLBACK not in engine_cps:
                engine_cps[_LEGACY_ENGINE_ID_FALLBACK] = float(legacy_cps_val)
        except (TypeError, ValueError):
            pass

    # 2. Handle history migration
    legacy_history_val = metrics.pop(_LEGACY_KEY_RENDER_HISTORY, None)
    if legacy_history_val and not metrics.get("render_history"):
        metrics["render_history"] = legacy_history_val

    return metrics

def migrate_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    """
    Migration Shim: Remove engine-specific residue from global settings.
    """
    for key in _DEPRECATED_SPEED_KEYS:
        settings.pop(key, None)

    settings.pop("make_mp3", None)

    return settings

def ensure_state_migrated(state: Dict[str, Any]) -> bool:
    """
    Main entry point for state.json migration.
    Returns True if any changes were made.
    """
    changed = False

    # Migrate settings
    if "settings" in state:
        original_settings = json.dumps(state["settings"])
        state["settings"] = migrate_settings(state["settings"])
        if json.dumps(state["settings"]) != original_settings:
            changed = True

    # Migrate performance_metrics
    if "performance_metrics" in state:
        original_metrics = json.dumps(state["performance_metrics"])
        state["performance_metrics"] = migrate_performance_metrics(state["performance_metrics"])
        if json.dumps(state["performance_metrics"]) != original_metrics:
            # We also need to ensure history is recorded in DB if we are here
            try:
                _record_legacy_performance_history_to_db(state["performance_metrics"].get("render_history", []))
                # After recording, we can remove the metrics blob from state.json
                state.pop("performance_metrics", None)
            except Exception as e:
                logger.warning("Failed to record legacy performance history during migration: %s", e)
            changed = True

    return changed

def migrate_db_performance_metrics(cursor) -> bool:
    """
    Migration Shim: Convert legacy 'performance_metrics' JSON blob in SQLite
    'settings' table into the modern granular keys.
    """
    cursor.execute("SELECT value FROM settings WHERE key = 'performance_metrics'")
    row = cursor.fetchone()
    if not row:
        return False

    try:
        value = row["value"] if hasattr(row, "keys") else row[0]
        legacy_metrics = json.loads(value)
        if not isinstance(legacy_metrics, dict):
            return False

        migrated = migrate_performance_metrics(legacy_metrics)

        # 1. Migrate speed multiplier
        speed = migrated.get("audiobook_speed_multiplier", 1.0)
        cursor.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            ("performance_metric:audiobook_speed_multiplier", str(speed))
        )

        # 2. Migrate CPS values
        for eid, cps in migrated.get("engine_cps", {}).items():
            cursor.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (f"performance_metric:cps:{eid}", str(cps))
            )

        # 3. History migration
        history = migrated.get("render_history") or []
        if history:
            _record_legacy_performance_history_to_db(history)

        # Cleanup
        cursor.execute("DELETE FROM settings WHERE key = 'performance_metrics'")
        return True
    except Exception:
        return False

def _record_legacy_performance_history_to_db(history: list[Dict[str, Any]]) -> None:
    if not history:
        return
    from .db.performance import record_render_sample
    from .voice_engines import get_default_profile_engine

    for sample in history:
        if not isinstance(sample, dict):
            continue
        try:
            record_render_sample(
                engine=str(sample.get("engine") or get_default_profile_engine()),
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
        except Exception:
            continue
