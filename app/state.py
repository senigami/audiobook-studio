import inspect
import json
import os
import logging
import re
import threading
import time
from dataclasses import asdict
from pathlib import Path
from typing import Dict, Any, Optional
from json import JSONDecodeError

from .models import Job
from .config import BASE_DIR
from .subprocess_utils import probe_audio_duration
from .voice_engines import normalize_tts_engine
SAFE_OUTPUT_FILE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")

STATE_FILE = Path(os.getenv("STATE_FILE", str(BASE_DIR / "state.json")))
logger = logging.getLogger(__name__)

# IMPORTANT: RLock prevents deadlock when a function that holds the lock calls another that also locks.
_STATE_LOCK = threading.RLock()
_JOB_LISTENERS = []
_LISTENER_SNAPSHOT_SUPPORT: dict[object, bool] = {}
_PERFORMANCE_METRICS_SETTING_KEY = "performance_metrics"
_DEFAULT_PERFORMANCE_METRICS = {
    "audiobook_speed_multiplier": 1.0,
    "xtts_cps": 16.7,
    "xtts_render_history": [],
}

def add_job_listener(callback):
    """Register a callback to be notified of job updates."""
    _cache_listener_snapshot_support(callback)
    _JOB_LISTENERS.append(callback)


def _cache_listener_snapshot_support(callback) -> bool:
    cached = _LISTENER_SNAPSHOT_SUPPORT.get(callback)
    if cached is not None:
        return bool(cached)

    attr_cached = getattr(callback, "_supports_job_snapshot", None)
    if attr_cached is not None:
        supports_snapshot = bool(attr_cached)
        _LISTENER_SNAPSHOT_SUPPORT[callback] = supports_snapshot
        return supports_snapshot
    try:
        listener_signature = inspect.signature(callback)
        supports_snapshot = len(listener_signature.parameters) >= 3
    except (TypeError, ValueError):
        supports_snapshot = False
    try:
        setattr(callback, "_supports_job_snapshot", supports_snapshot)
    except (AttributeError, TypeError):
        pass
    _LISTENER_SNAPSHOT_SUPPORT[callback] = supports_snapshot
    return supports_snapshot


def _default_state() -> Dict[str, Any]:
    return {
        "jobs": {},
        "settings": {
            "safe_mode": True,
            "default_engine": "xtts",
            "voxtral_enabled": False,
            "voxtral_model": "voxtral-mini-tts-2603",
            "enabled_plugins": {},
        },
    }


def _normalize_settings(
    settings: Optional[Dict[str, Any]],
    *,
    incoming_updates: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    defaults = _default_state()["settings"].copy()
    normalized = defaults.copy()
    if settings:
        normalized.update(settings)
    incoming_updates = incoming_updates or {}

    normalized["safe_mode"] = bool(normalized.get("safe_mode", defaults["safe_mode"]))
    normalized.pop("make_mp3", None)
    normalized["default_engine"] = normalize_tts_engine(normalized.get("default_engine"), defaults["default_engine"])

    mistral_api_key = str(normalized.get("mistral_api_key") or "").strip()
    if mistral_api_key:
        normalized["mistral_api_key"] = mistral_api_key
    else:
        normalized.pop("mistral_api_key", None)

    explicit_voxtral_flag = "voxtral_enabled" in incoming_updates
    explicit_enabled_plugins = isinstance(incoming_updates.get("enabled_plugins"), dict) and "voxtral" in incoming_updates.get("enabled_plugins", {})

    if explicit_voxtral_flag:
        voxtral_enabled = bool(normalized.get("voxtral_enabled"))
    elif explicit_enabled_plugins:
        voxtral_enabled = bool((incoming_updates.get("enabled_plugins") or {}).get("voxtral"))
    elif incoming_updates:
        # Fresh write without an explicit toggle: keep legacy compatibility by
        # backfilling Voxtral on when the API key is present, even if the
        # persisted state was previously disabled.
        voxtral_enabled = bool(mistral_api_key)
    else:
        # Pure read / normalization of persisted state.
        voxtral_enabled = bool(normalized.get("voxtral_enabled"))
        if not voxtral_enabled:
            voxtral_enabled = bool(mistral_api_key)

    # Sync with enabled_plugins map
    enabled_plugins = normalized.get("enabled_plugins")
    if not isinstance(enabled_plugins, dict):
        enabled_plugins = {}

    # Prefer enabled_plugins["voxtral"] if it exists, otherwise fallback to voxtral_enabled
    if explicit_enabled_plugins:
        enabled_plugins["voxtral"] = bool((incoming_updates.get("enabled_plugins") or {}).get("voxtral"))
    elif explicit_voxtral_flag:
        enabled_plugins["voxtral"] = bool(voxtral_enabled)
    elif incoming_updates:
        enabled_plugins["voxtral"] = voxtral_enabled
    elif "voxtral" in enabled_plugins:
        # Preserve a previously explicit generic toggle on reads.
        voxtral_enabled = bool(enabled_plugins["voxtral"])
    else:
        enabled_plugins["voxtral"] = voxtral_enabled

    # Ensure mistral_api_key requirement is respected
    if not mistral_api_key:
        voxtral_enabled = False
        enabled_plugins["voxtral"] = False

    normalized["voxtral_enabled"] = voxtral_enabled
    normalized["enabled_plugins"] = enabled_plugins

    voxtral_model = str(normalized.get("voxtral_model") or "").strip() or defaults["voxtral_model"]
    if voxtral_model == "voxtral-tts":
        voxtral_model = defaults["voxtral_model"]
    normalized["voxtral_model"] = voxtral_model

    if normalized["default_engine"] == "voxtral" and not normalized.get("mistral_api_key"):
        normalized["default_engine"] = defaults["default_engine"]

    default_speaker = str(normalized.get("default_speaker_profile") or "").strip()
    if default_speaker:
        normalized["default_speaker_profile"] = default_speaker
    else:
        normalized.pop("default_speaker_profile", None)

    return normalized


def _atomic_write_text(path: Path, text: str) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(text, encoding="utf-8")
    os.replace(tmp_path, path)


def _load_state_no_lock() -> Dict[str, Any]:
    """
    Internal helper: assumes caller already holds _STATE_LOCK.
    """
    if not STATE_FILE.exists():
        state = _default_state()
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))
        return state

    raw = STATE_FILE.read_text(encoding="utf-8", errors="replace").strip()
    if not raw:
        state = _default_state()
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))
        return state

    try:
        return json.loads(raw)
    except JSONDecodeError:
        # Backup corrupt file and reset
        backup = STATE_FILE.with_name("state.json.corrupt")
        try:
            os.replace(STATE_FILE, backup)
        except Exception:
            logger.warning("Failed to back up corrupt state file %s", STATE_FILE, exc_info=True)
        state = _default_state()
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))
        return state


def load_state() -> Dict[str, Any]:
    with _STATE_LOCK:
        return _load_state_no_lock()


def save_state(state: Dict[str, Any]) -> None:
    with _STATE_LOCK:
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))


def get_settings() -> Dict[str, Any]:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        raw_settings = state.get("settings", {})
        return _normalize_settings(raw_settings)


def update_settings(updates: dict = None, **kwargs) -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        state.setdefault("settings", {})
        merged_updates: Dict[str, Any] = {}
        if updates:
            merged_updates.update(updates)
        if kwargs:
            merged_updates.update(kwargs)
        state["settings"].update(merged_updates)
        state["settings"] = _normalize_settings(state["settings"], incoming_updates=merged_updates)
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))


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
            # We use the new dedicated module for this.
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


def get_jobs() -> Dict[str, Job]:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        raw = state.get("jobs", {})
        # Safety: only pass keys that exist in the current Job dataclass
        import dataclasses
        job_fields = {f.name for f in dataclasses.fields(Job)}

        jobs = {}
        for jid, jdata in raw.items():
            filtered = {k: v for k, v in jdata.items() if k in job_fields}
            jobs[jid] = Job(**filtered)
        return jobs


def put_job(job: Job) -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        state.setdefault("jobs", {})
        if job.updated_at is None:
            job.updated_at = job.created_at
        state["jobs"][job.id] = asdict(job)
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))


def update_job(job_id: str, force_broadcast: bool = False, **updates) -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        jobs = state.setdefault("jobs", {})
        j = jobs.get(job_id)
        if not j:
            return

        # Apply updates with protection
        changed_fields = []
        for k, v in updates.items():
            # 1. Status regression protection
            if k == "status":
                current_status = j.get("status")
                # Higher number = more advanced state
                status_priority = {
                    "done": 5, "failed": 5, "cancelled": 5, 
                    "finalizing": 4, "running": 3, "preparing": 2, "queued": 1, None: 0
                }
                new_p = status_priority.get(v, 0)
                old_p = status_priority.get(current_status, 0)
                if not force_broadcast and new_p < old_p:
                    # Allow regression only if explicitly resetting (e.g. back to queued from a terminal state)
                    # But if we're in the middle of a run, don't let a stray 'queued' msg win.
                    is_reset = v == "queued" and current_status in ("done", "failed", "cancelled")
                    if not is_reset and (v == "queued" and current_status in ("preparing", "running", "finalizing")):
                        logger.debug("Preventing status regression for %s: %s -> %s", job_id, current_status, v)
                        continue
                    elif not is_reset:
                        logger.debug("Preventing status regression for %s: %s -> %s", job_id, current_status, v)
                        continue

            # 2. Progress regression protection
            if k == "progress":
                if v is not None:
                    v = round(float(v), 2)

                target_status = updates.get("status") or j.get("status")
                current_p = j.get("progress") or 0.0

                # Strictly prevent regression once running, UNLESS forced.
                # Only allow backward movement if status is being reset to a pre-running state (e.g. back to 'queued').
                if target_status in ("running", "finalizing", "done"):
                    # 0.01 floor removal: Allow regression to 0.0 if we are only at the very start (< 0.03)
                    # This allows the 'preparing -> running 0.0' handoff to happen cleanly.
                    if not force_broadcast and v is not None and v < current_p and current_p >= 0.03:
                        logger.debug("Preventing progress regression for %s during %s: %s -> %s", job_id, target_status, current_p, v)
                        # Clamp to current progress instead of skipping entirely
                        v = current_p

            if j.get(k) != v:
                j[k] = v
                changed_fields.append(k)

        # 4. ETA basis/end_at hardening & Observed Progress Projection
        event_updated_at = float(updates.get("updated_at") or time.time())
        status = updates.get("status") or j.get("status")
        progress = updates.get("progress") if "progress" in updates else j.get("progress")
        started_at = updates.get("started_at") or j.get("started_at")

        # Explicit ETA check or Observed projection
        if "eta_seconds" in updates:
            eta_val = updates.get("eta_seconds")
            if eta_val is not None:
                sanitized_eta = max(0, int(eta_val))
                j["eta_seconds"] = sanitized_eta
                updates["eta_seconds"] = sanitized_eta

                if (updates.get("eta_basis") or j.get("eta_basis")) is None:
                    j["eta_basis"] = "remaining_from_update"
                    updates["eta_basis"] = "remaining_from_update"
                    if "eta_basis" not in changed_fields:
                        changed_fields.append("eta_basis")

                # Recompute anchor relative to this specific update event
                if (updates.get("eta_basis") or j.get("eta_basis")) == "remaining_from_update":
                    end_at = event_updated_at + sanitized_eta
                    j["estimated_end_at"] = end_at
                    updates["estimated_end_at"] = end_at
                    if "estimated_end_at" not in changed_fields:
                        changed_fields.append("estimated_end_at")
                    if "eta_seconds" not in changed_fields:
                        changed_fields.append("eta_seconds")
            else:
                # Explicitly clear ETA metadata
                for k in ("eta_seconds", "eta_basis", "estimated_end_at"):
                    if j.get(k) is not None:
                        j[k] = None
                        updates[k] = None
                        if k not in changed_fields:
                            changed_fields.append(k)
        elif status == "running" and started_at and progress is not None and 0.03 <= progress < 0.98:
            # Observed progress projection (Bug 5)
            # Only compute if we don't have a fresh explicit ETA update in this payload
            elapsed = event_updated_at - started_at
            if elapsed > 1:
                import math
                remaining = math.ceil(elapsed * (1 - progress) / progress)
                # Omit if remaining is absurdly huge (> 24 hours) or if progress stagnant
                if 1 <= remaining <= 86400:
                    j["eta_seconds"] = remaining
                    updates["eta_seconds"] = remaining
                    j["eta_basis"] = "remaining_from_update"
                    updates["eta_basis"] = "remaining_from_update"
                    end_at = event_updated_at + remaining
                    j["estimated_end_at"] = end_at
                    updates["estimated_end_at"] = end_at
                    for k in ("eta_seconds", "eta_basis", "estimated_end_at"):
                        if k not in changed_fields:
                            changed_fields.append(k)

        auto_updated_at = None
        if changed_fields or force_broadcast:
            auto_updated_at = event_updated_at
            if j.get("updated_at") != auto_updated_at:
                j["updated_at"] = auto_updated_at
                if "updated_at" not in changed_fields:
                    changed_fields.append("updated_at")
        if not changed_fields and not force_broadcast:
            return

        if changed_fields:
            jobs[job_id] = j
            _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))
            if j.get("engine") == "voxtral":
                logger.info(
                    "[voxtral-debug %s] update_job id=%s changed=%s status=%s progress=%s started_at=%s finished_at=%s output_wav=%s output_mp3=%s",
                    time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()),
                    job_id,
                    changed_fields,
                    j.get("status"),
                    j.get("progress"),
                    j.get("started_at"),
                    j.get("finished_at"),
                    j.get("output_wav"),
                    j.get("output_mp3"),
                )

        # 3. Broadcast updates to listeners (e.g. WebSockets)
        # Optimization: Strip the potentially large 'log' field from broadcasts since the UI doesn't use it.
        # Sync with SQLite DB when status or timestamps change, or when explicitly broadcast
        # Note: force_broadcast=True is used right after enqueue() to register the initial status.
        if "status" in changed_fields or "started_at" in changed_fields or force_broadcast:
            try:
                from .db import update_queue_item
                from .config import XTTS_OUT_DIR

                audio_length = 0.0
                output_file = None
                new_status = updates.get("status", j.get("status"))

                if new_status == "done":
                    # Try to extract the true duration using ffprobe for the synchronized database record
                    output_file = updates.get("output_mp3", j.get("output_mp3"))
                    if not output_file:
                        output_file = updates.get("output_wav", j.get("output_wav"))

                    if output_file:
                        project_id = updates.get("project_id") or j.get("project_id")
                        if project_id:
                            from .config import get_project_audio_dir
                            pdir = get_project_audio_dir(project_id)
                        else:
                            pdir = XTTS_OUT_DIR

                        full_audio_path = None
                        if isinstance(output_file, str) and SAFE_OUTPUT_FILE_RE.fullmatch(output_file):
                            for entry in pdir.iterdir():
                                if entry.is_file() and entry.name == output_file:
                                    full_audio_path = entry.resolve()
                                    break
                        if full_audio_path and full_audio_path.exists():
                            try:
                                audio_length = probe_audio_duration(full_audio_path)
                            except Exception:
                                logger.warning("Could not get duration for %s", output_file, exc_info=True)

                update_queue_item(
                    job_id, 
                    new_status, 
                    audio_length_seconds=audio_length, 
                    force_chapter_id=j.get("chapter_id"), 
                    output_file=output_file,
                    chapter_scoped=not bool(j.get("segment_ids")),
                )

                try:
                    from .api.ws import broadcast_chapter_updated, broadcast_queue_update
                    chapter_id = j.get("chapter_id")
                    if chapter_id:
                        broadcast_chapter_updated(chapter_id)
                    broadcast_queue_update()
                except ImportError:
                    logger.debug("broadcast_queue_update is unavailable during state sync")

            except Exception:
                logger.warning("Failed to sync job status to SQLite for %s", job_id, exc_info=True)

        broadcast_dict = {k: v for k, v in updates.items() if k != "log"}
        if auto_updated_at is not None:
            broadcast_dict.setdefault("updated_at", auto_updated_at)
        if broadcast_dict or force_broadcast:
            job_snapshot = dict(j)
            for listener in _JOB_LISTENERS:
                try:
                    supports_snapshot = _cache_listener_snapshot_support(listener)

                    if supports_snapshot:
                        listener(job_id, broadcast_dict, job_snapshot)
                    else:
                        listener(job_id, broadcast_dict)
                except Exception:
                    logger.warning("Job listener failed for %s", job_id, exc_info=True)

        # PRUNING: If job is done/failed/cancelled, we can remove it from state.json
        # because the historical record is now in SQLite's processing_queue table.
        if updates.get("status", j.get("status")) in ("done", "failed", "cancelled"):
            # We keep it just long enough for the final broadcast to reach clients (approx 1s)
            # Or we can just prune it now. Let's do a 'soft' prune by calling a dedicated function.
            prune_completed_jobs()


def prune_completed_jobs() -> None:
    """
    Removes jobs from the state if they are in a terminal state.
    We keep a small buffer of recent completions (e.g. 50) to allow UI transitions.
    """
    with _STATE_LOCK:
        state = _load_state_no_lock()
        jobs = state.get("jobs", {})

        terminal_jobs = [
            (jid, jdata.get("finished_at", 0) or jdata.get("created_at", 0))
            for jid, jdata in jobs.items()
            if jdata.get("status") in ("done", "failed", "cancelled")
        ]

        # Sort by completion time, keep the most recent 50
        terminal_jobs.sort(key=lambda x: x[1], reverse=True)
        to_prune = [jid for jid, _ in terminal_jobs[50:]]

        if to_prune:
            for jid in to_prune:
                del jobs[jid]
            _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))
            logger.debug("Pruned %s terminal jobs from state.json", len(to_prune))


def delete_jobs(job_ids: list[str]) -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        jobs = state.get("jobs", {})
        for jid in job_ids:
            if jid in jobs:
                del jobs[jid]
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))


def clear_all_jobs() -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        state["jobs"] = {}
        _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))

def purge_jobs_for_chapter(chapter_id: str) -> None:
    """Removes all existing jobs for a specific chapter from the state."""
    with _STATE_LOCK:
        state = _load_state_no_lock()
        jobs = state.get("jobs", {})
        to_delete = [jid for jid, jdata in jobs.items() if jdata.get("chapter_id") == chapter_id]
        if to_delete:
            for jid in to_delete:
                del jobs[jid]
            _atomic_write_text(STATE_FILE, json.dumps(state, indent=2))
            logger.debug("Purged %s stale jobs for chapter %s", len(to_delete), chapter_id)
