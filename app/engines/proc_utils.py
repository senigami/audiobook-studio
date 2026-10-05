"""Subprocess management utilities for engine execution.

The generic streaming mechanism lives in ``studio_plugin_sdk.proc`` (the real
implementation; plugins import it directly). This module re-exports it for app
callers and keeps the app-policy pieces: the TTS Server runtime-marker helpers
(TRANSIENT_DIR coupling) and orphan cleanup.
"""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
from pathlib import Path
from typing import Any

from studio_plugin_sdk.proc import (  # noqa: F401 — re-exports for app callers/tests
    _active_processes,
    run_cmd_stream,
    terminate_all_subprocesses,
)

from app.core.config import TRANSIENT_DIR

logger = logging.getLogger(__name__)
_TTS_SERVER_MARKER_NAME = "tts_server_runtime.json"


def get_tts_server_runtime_marker_path(
    marker_path: str | os.PathLike[str] | None = None,
) -> Path:
    """Return the local runtime marker path for the TTS Server."""
    if marker_path is not None:
        return Path(marker_path)
    return Path(TRANSIENT_DIR) / _TTS_SERVER_MARKER_NAME


def write_tts_server_runtime_marker(
    *,
    pid: int,
    port: int,
    server_script: str | os.PathLike[str],
    plugins_dir: str | os.PathLike[str],
    host: str = "127.0.0.1",
    marker_path: str | os.PathLike[str] | None = None,
) -> Path:
    """Persist the current TTS Server runtime identity for startup recovery."""
    path = get_tts_server_runtime_marker_path(marker_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "pid": pid,
        "port": port,
        "host": host,
        "server_script": os.path.abspath(os.fspath(server_script)),
        "plugins_dir": os.path.abspath(os.fspath(plugins_dir)),
    }
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return path


def load_tts_server_runtime_marker(
    marker_path: str | os.PathLike[str] | None = None,
) -> dict[str, Any] | None:
    """Load the persisted TTS Server runtime marker, if present."""
    path = get_tts_server_runtime_marker_path(marker_path)
    try:
        if not os.path.exists(os.fspath(path)):
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        logger.debug("Failed to load TTS Server runtime marker", exc_info=True)
        return None
    if not isinstance(data, dict):
        return None
    return data


def clear_tts_server_runtime_marker(
    marker_path: str | os.PathLike[str] | None = None,
) -> None:
    """Remove the persisted TTS Server runtime marker, if it exists."""
    path = get_tts_server_runtime_marker_path(marker_path)
    try:
        if os.name == "nt":
            os.unlink(os.fspath(path))
        else:
            import posix

            posix.unlink(os.fspath(path))
    except FileNotFoundError:
        pass
    except Exception:
        logger.debug("Failed to clear TTS Server runtime marker", exc_info=True)


def cleanup_marked_tts_server_process(
    *,
    server_script: str | os.PathLike[str] | None = None,
    plugins_dir: str | os.PathLike[str] | None = None,
    marker_path: str | os.PathLike[str] | None = None,
) -> int:
    """Terminate the process recorded in the runtime marker, if it is still ours."""
    marker = load_tts_server_runtime_marker(marker_path)
    if not marker:
        return 0

    try:
        pid = int(marker.get("pid"))
    except (TypeError, ValueError):
        clear_tts_server_runtime_marker(marker_path)
        return 0

    current_pid = os.getpid()
    if pid == current_pid:
        return 0

    script_token = os.path.abspath(os.fspath(server_script)) if server_script is not None else None
    plugins_token = os.path.abspath(os.fspath(plugins_dir)) if plugins_dir is not None else None

    try:
        result = subprocess.run(
            ["ps", "-p", str(pid), "-o", "pid=,ppid=,command="],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        logger.debug("Failed to inspect marked TTS Server process", exc_info=True)
        return 0

    line = (result.stdout or "").strip()
    if not line:
        clear_tts_server_runtime_marker(marker_path)
        return 0

    parts = line.split(None, 2)
    if len(parts) < 3:
        clear_tts_server_runtime_marker(marker_path)
        return 0

    try:
        actual_pid = int(parts[0])
        ppid = int(parts[1])
    except ValueError:
        clear_tts_server_runtime_marker(marker_path)
        return 0

    command = parts[2]
    if actual_pid != pid:
        clear_tts_server_runtime_marker(marker_path)
        return 0

    if "tts_server.py" not in command:
        clear_tts_server_runtime_marker(marker_path)
        return 0
    if script_token and script_token not in command:
        clear_tts_server_runtime_marker(marker_path)
        return 0
    if plugins_token and plugins_token not in command:
        clear_tts_server_runtime_marker(marker_path)
        return 0
    if ppid != 1:
        return 0

    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        clear_tts_server_runtime_marker(marker_path)
        return 0
    except Exception:
        logger.debug("Failed to terminate marked TTS Server pid=%s", pid, exc_info=True)
        return 0

    try:
        import time

        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline:
            os.kill(pid, 0)
            time.sleep(0.1)
    except ProcessLookupError:
        clear_tts_server_runtime_marker(marker_path)
        return 1
    except Exception:
        pass

    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except Exception:
        logger.debug("Failed to force-kill marked TTS Server pid=%s", pid, exc_info=True)

    clear_tts_server_runtime_marker(marker_path)
    return 1


def cleanup_orphaned_tts_server_processes(
    *,
    server_script: str | os.PathLike[str] | None = None,
    plugins_dir: str | os.PathLike[str] | None = None,
    marker_path: str | os.PathLike[str] | None = None,
) -> int:
    """Best-effort cleanup for orphaned TTS Server processes from prior runs.

    This is intentionally conservative: it only targets orphaned ``tts_server.py``
    processes (PPID 1) whose command line still points at the current checkout.
    It does not touch live Studio children or arbitrary user processes.
    """
    if os.name == "nt":
        return 0

    killed = cleanup_marked_tts_server_process(
        server_script=server_script,
        plugins_dir=plugins_dir,
        marker_path=marker_path,
    )

    script_token = None
    if server_script is not None:
        script_token = os.path.abspath(os.fspath(server_script))

    plugins_token = None
    if plugins_dir is not None:
        plugins_token = os.path.abspath(os.fspath(plugins_dir))

    try:
        result = subprocess.run(
            ["ps", "-axo", "pid=,ppid=,command="],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        logger.debug("Failed to scan for orphaned TTS Server processes", exc_info=True)
        return killed

    current_pid = os.getpid()
    for line in (result.stdout or "").splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) < 3:
            continue
        try:
            pid = int(parts[0])
            ppid = int(parts[1])
        except ValueError:
            continue
        if pid == current_pid or ppid != 1:
            continue

        command = parts[2]
        if "tts_server.py" not in command:
            continue
        if script_token and script_token not in command:
            continue
        if plugins_token and plugins_token not in command:
            continue

        try:
            os.kill(pid, signal.SIGTERM)
            killed += 1
        except ProcessLookupError:
            continue
        except Exception:
            logger.debug("Failed to terminate orphaned TTS Server pid=%s", pid, exc_info=True)
            continue

        time_limit = 2.0
        try:
            import time
            deadline = time.monotonic() + time_limit
            while time.monotonic() < deadline:
                os.kill(pid, 0)
                time.sleep(0.1)
        except ProcessLookupError:
            continue
        except Exception:
            pass

        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        except Exception:
            logger.debug("Failed to force-kill orphaned TTS Server pid=%s", pid, exc_info=True)

    return killed
