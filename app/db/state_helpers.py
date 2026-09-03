import os
import copy
import json
import logging
import re
import threading
import inspect
from pathlib import Path
from typing import Dict, Any, Optional
from json import JSONDecodeError

from ..core.config import BASE_DIR


SAFE_OUTPUT_FILE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")
STATE_FILE = Path(os.getenv("STATE_FILE", str(BASE_DIR / "state.json")))

logger = logging.getLogger(__name__)

# IMPORTANT: RLock prevents deadlock when a function that holds the lock calls another that also locks.
_STATE_LOCK = threading.RLock()
_JOB_LISTENERS = []
_LISTENER_SNAPSHOT_SUPPORT: dict[object, bool] = {}

# --- state.json in-memory cache (PERF-1) ---------------------------------
# state.json was previously re-read from disk and fully JSON-parsed on EVERY
# access (get_jobs on every progress broadcast, get_settings, etc.). This is a
# copy-on-write cache guarded by _STATE_LOCK:
#   * READERS call _load_state_no_lock() and get the shared cached dict back
#     (no disk read, no parse) — they MUST treat it as read-only.
#   * MUTATORS call _load_state_for_update_no_lock() (a deepcopy they own) and
#     persist via _commit_state_no_lock(). Working on a private copy preserves
#     the pre-existing safety property that a mid-mutation exception leaves the
#     committed state (disk AND cache) untouched.
# Cache validity is keyed on the file's (path, mtime_ns, size): our own commits
# refresh that signature so they don't force a re-read, while an external write
# (tests writing state.json directly) or a STATE_FILE path switch (per-test
# monkeypatch) changes the signature and triggers a reload.
_STATE_CACHE: Optional[Dict[str, Any]] = None
_STATE_CACHE_KEY: Optional[tuple] = None


def _state_file_signature(path: Path) -> tuple:
    try:
        st = os.stat(path)
        return (str(path), st.st_mtime_ns, st.st_size)
    except OSError:
        # Missing file: a distinct signature that won't match a populated cache.
        return (str(path), None, None)


def _invalidate_state_cache() -> None:
    """Drop the cached state (e.g. after an out-of-band mutation). Caller holds the lock."""
    global _STATE_CACHE, _STATE_CACHE_KEY
    _STATE_CACHE = None
    _STATE_CACHE_KEY = None


def get_state_file() -> Path:
    try:
        from ..db import state as state_module
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
    # We use a literal fallback here to avoid circular imports during minimal boot.
    return {
        "jobs": {},
        "settings": {
            "safe_mode": True,
            "default_engine": "",
            "enabled_plugins": {},
        },
    }


def _prime_cache_no_lock(state: Dict[str, Any], state_file: Path) -> Dict[str, Any]:
    """Store `state` as the cache and key it to the file's current signature.

    Called after we have (re)read or (re)written `state_file`, so the recorded
    signature matches what is on disk and our own write does not look external.
    """
    global _STATE_CACHE, _STATE_CACHE_KEY
    _STATE_CACHE = state
    _STATE_CACHE_KEY = _state_file_signature(state_file)
    return state


def _load_state_no_lock() -> Dict[str, Any]:
    """Return the current state for READ-ONLY use. Assumes caller holds _STATE_LOCK.

    Returns the shared cached dict when the on-disk file is unchanged since it
    was cached. Callers MUST NOT mutate the result — mutators use
    _load_state_for_update_no_lock() + _commit_state_no_lock() instead.
    """
    state_file = get_state_file()

    if _STATE_CACHE is not None and _STATE_CACHE_KEY == _state_file_signature(state_file):
        return _STATE_CACHE

    if not state_file.exists():
        state = _default_state_minimal()
        _atomic_write_text(state_file, json.dumps(state, indent=2))
        return _prime_cache_no_lock(state, state_file)

    raw = state_file.read_text(encoding="utf-8", errors="replace").strip()
    if not raw:
        state = _default_state_minimal()
        _atomic_write_text(state_file, json.dumps(state, indent=2))
        return _prime_cache_no_lock(state, state_file)

    try:
        state = json.loads(raw)
        return _prime_cache_no_lock(state, state_file)
    except JSONDecodeError:
        # Backup corrupt file and reset
        backup = state_file.with_name("state.json.corrupt")
        try:
            os.replace(state_file, backup)
        except Exception:
            logger.warning("Failed to back up corrupt state file %s", state_file, exc_info=True)
        state = _default_state_minimal()
        _atomic_write_text(state_file, json.dumps(state, indent=2))
        return _prime_cache_no_lock(state, state_file)


def _load_state_for_update_no_lock() -> Dict[str, Any]:
    """Return a private, mutable deepcopy of the state for a read-modify-write.

    Working on a copy (not the cached object) means a mutator that raises
    part-way through leaves the committed state — disk and cache — untouched,
    preserving the pre-cache safety guarantee. Assumes caller holds _STATE_LOCK.
    """
    return copy.deepcopy(_load_state_no_lock())


def _commit_state_no_lock(state: Dict[str, Any]) -> None:
    """Persist `state` to disk and adopt it as the cache. Assumes caller holds _STATE_LOCK.

    This is the single write chokepoint: every state.json mutation goes through
    here so the in-memory cache stays coherent with disk.
    """
    state_file = get_state_file()
    _atomic_write_text(state_file, json.dumps(state, indent=2))
    _prime_cache_no_lock(state, state_file)


def load_state() -> Dict[str, Any]:
    # Public accessor: hand back a private copy so external callers can neither
    # observe nor corrupt the shared cache (this is not on the hot path).
    with _STATE_LOCK:
        return copy.deepcopy(_load_state_no_lock())


def save_state(state: Dict[str, Any]) -> None:
    with _STATE_LOCK:
        _commit_state_no_lock(state)
