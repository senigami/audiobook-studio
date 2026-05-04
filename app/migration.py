"""
Legacy Migration Layer

This module centralizes all one-time conversion logic for version 1.x data.
It should be the ONLY location in the app-root that carries engine-specific
literals from the version 1.x era.
"""

import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Dict, Any, Optional

from .db.core import get_connection
from .db.projects import create_project

logger = logging.getLogger(__name__)

# Legacy Storage Paths (Version 1.x) - These are NOT for active runtime use.
BASE_DIR = Path(os.getenv("AUDIOBOOK_BASE_DIR", str(Path(__file__).resolve().parents[1])))
CHAPTER_DIR = Path(os.getenv("CHAPTER_DIR", str(BASE_DIR / "chapters")))
AUDIO_OUT_DIR = Path(os.getenv("AUDIO_OUT_DIR", str(BASE_DIR / "audio_out")))

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

def import_legacy_filesystem_data() -> Dict[str, Any]:
    """
    Migration: Scans CHAPTER_DIR for .txt files and matches them with audio in AUDIO_OUT_DIR.
    Creates a 'Legacy Import' project and populates it with chapters.
    """
    # Rule 8: Enumerate trusted root
    trusted_chapter_root = os.path.abspath(os.path.realpath(os.fspath(CHAPTER_DIR)))
    try:
        if not os.path.isdir(trusted_chapter_root):
             return {"status": "success", "message": "No legacy chapter directory found."}
        txt_files = [
            entry.name
            for entry in os.scandir(trusted_chapter_root)
            if entry.is_file() and entry.name.endswith(".txt")
        ]
    except OSError:
        return {"status": "error", "message": "Could not scan chapter directory."}

    if not txt_files:
        return {"status": "success", "message": "No legacy text files found."}

    # Create a new project for the import
    project_id = create_project(
        name=f"Legacy Import ({time.strftime('%Y-%m-%d %H:%M')})",
        series="Imported",
        author="System",
    )

    imported_count = 0
    with get_connection() as conn:
        cursor = conn.cursor()

        for txt_name in txt_files:
            stem = Path(txt_name).stem

            # Rule 9: Locally visible containment proof
            txt_path_full = os.path.abspath(
                os.path.realpath(os.path.join(trusted_chapter_root, txt_name))
            )
            if not txt_path_full.startswith(trusted_chapter_root + os.sep):
                continue

            # Read content
            try:
                with open(txt_path_full, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
            except Exception:
                continue

            char_count = len(content)
            word_count = len(content.split())

            # Look for matching audio
            audio_file = None
            audio_status = "unprocessed"

            trusted_audio_root = os.path.abspath(os.path.realpath(os.fspath(AUDIO_OUT_DIR)))
            # Priority .mp3 > .wav
            for ext in [".mp3", ".wav"]:
                cand_name = f"{stem}{ext}"
                # Rule 8: Match by name from scanner to prove locality
                try:
                    if os.path.isdir(trusted_audio_root):
                        for entry in os.scandir(trusted_audio_root):
                            if entry.is_file() and entry.name == cand_name:
                                audio_file = entry.name
                                audio_status = "done"
                                break
                except OSError:
                    pass
                if audio_file:
                    break

            chap_id = str(uuid.uuid4())
            now = time.time()

            # Insert into chapters
            cursor.execute("""
                INSERT INTO chapters (
                    id, project_id, title, text_content, sort_order,
                    audio_status, audio_file_path, text_last_modified,
                    char_count, word_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                chap_id,
                project_id,
                stem,
                content,
                imported_count,
                audio_status,
                audio_file,
                now,
                char_count,
                word_count
            ))
            imported_count += 1

        conn.commit()

    return {
        "status": "success",
        "message": f"Successfully imported {imported_count} chapters into Project {project_id}.",
        "project_id": project_id
    }
