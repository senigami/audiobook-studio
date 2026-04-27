import os
import json
import logging
import re
import threading
import inspect
from pathlib import Path
from typing import Dict, Any, Optional
from json import JSONDecodeError

from .config import BASE_DIR

SAFE_OUTPUT_FILE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")
STATE_FILE = Path(os.getenv("STATE_FILE", str(BASE_DIR / "state.json")))

logger = logging.getLogger(__name__)

# IMPORTANT: RLock prevents deadlock when a function that holds the lock calls another that also locks.
_STATE_LOCK = threading.RLock()
_JOB_LISTENERS = []
_LISTENER_SNAPSHOT_SUPPORT: dict[object, bool] = {}


def get_state_file() -> Path:
    try:
        from . import state as state_module
        patched = getattr(state_module, "STATE_FILE", None)
        if isinstance(patched, Path):
            return patched
    except Exception:
        pass
    return STATE_FILE


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


def _atomic_write_text(path: Path, text: str) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(text, encoding="utf-8")
    os.replace(tmp_path, path)


def _default_state_minimal() -> Dict[str, Any]:
    # We'll re-export the real _default_state in state_settings.py
    # but this minimal version is needed if load fails before settings is ready.
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


def _load_state_no_lock() -> Dict[str, Any]:
    """
    Internal helper: assumes caller already holds _STATE_LOCK.
    """
    state_file = get_state_file()

    if not state_file.exists():
        state = _default_state_minimal()
        _atomic_write_text(state_file, json.dumps(state, indent=2))
        return state

    raw = state_file.read_text(encoding="utf-8", errors="replace").strip()
    if not raw:
        state = _default_state_minimal()
        _atomic_write_text(state_file, json.dumps(state, indent=2))
        return state

    try:
        return json.loads(raw)
    except JSONDecodeError:
        # Backup corrupt file and reset
        backup = state_file.with_name("state.json.corrupt")
        try:
            os.replace(state_file, backup)
        except Exception:
            logger.warning("Failed to back up corrupt state file %s", state_file, exc_info=True)
        state = _default_state_minimal()
        _atomic_write_text(state_file, json.dumps(state, indent=2))
        return state


def load_state() -> Dict[str, Any]:
    with _STATE_LOCK:
        return _load_state_no_lock()


def save_state(state: Dict[str, Any]) -> None:
    with _STATE_LOCK:
        _atomic_write_text(get_state_file(), json.dumps(state, indent=2))
