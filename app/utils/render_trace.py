from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any

from ..core.config import TRANSIENT_DIR

_LOCK = threading.Lock()


def is_enabled() -> bool:
    return str(os.getenv("STUDIO_RENDER_TRACE", "")).strip().lower() in {"1", "true", "yes", "on"}


def _trace_path() -> Path:
    configured = os.getenv("STUDIO_RENDER_TRACE_FILE")
    if configured:
        return Path(configured)
    return TRANSIENT_DIR / "render_trace.jsonl"


def _json_safe(value: Any) -> Any:
    try:
        json.dumps(value)
        return value
    except TypeError:
        if isinstance(value, dict):
            return {str(k): _json_safe(v) for k, v in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [_json_safe(v) for v in value]
        return str(value)


def trace(event: str, **fields: Any) -> None:
    """Write one render diagnostics JSONL record when STUDIO_RENDER_TRACE is enabled."""
    if not is_enabled():
        return

    payload = {"ts": time.time(), "event": event}
    payload.update({key: _json_safe(value) for key, value in fields.items()})

    path = _trace_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        with _LOCK:
            with path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
    except Exception:
        return
