"""Subprocess management utilities for engine execution."""

from __future__ import annotations

import json
import logging
import os
import queue
import shlex
import signal
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any, Callable

from app.config import TRANSIENT_DIR
from app.subprocess_utils import coerce_subprocess_output

_active_processes: set[subprocess.Popen] = set()
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


def terminate_all_subprocesses() -> None:
    """Force-terminate all tracked subprocesses and their groups."""
    for proc in list(_active_processes):
        try:
            pgid = None
            if getattr(proc, "pid", None):
                try:
                    pgid = os.getpgid(proc.pid)
                except Exception:
                    pgid = None

            if pgid is not None:
                try:
                    os.killpg(pgid, signal.SIGTERM)
                except Exception:
                    logger.debug("Failed to terminate subprocess group", exc_info=True)
            else:
                proc.terminate()

            proc.wait(timeout=2)
        except Exception:
            try:
                if getattr(proc, "pid", None):
                    try:
                        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                    except Exception:
                        proc.kill()
                else:
                    proc.kill()
            except Exception:
                logger.debug("Failed to force-kill subprocess during termination", exc_info=True)
    _active_processes.clear()


def run_cmd_stream(
    cmd: str | list[str],
    on_output: Callable[[str], None],
    cancel_check: Callable[[], bool],
    env: dict[str, str] | None = None,
) -> int:
    """Run a command and stream its output to a callback.

    Supports cancellation and heartbeat pings (empty strings to on_output).
    """
    import time
    from collections import deque

    if isinstance(cmd, (list, tuple)):
        display_cmd = " ".join(shlex.quote(str(part)) for part in cmd)
    else:
        display_cmd = str(cmd)

    logger.debug("Running command: %s", display_cmd)

    try:
        proc = subprocess.Popen(
            cmd,
            shell=isinstance(cmd, str),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=0,  # Unbuffered
            env=env,
            start_new_session=True,
        )
    except FileNotFoundError as exc:
        message = f"[error] Failed to launch command: {exc}\n"
        on_output(message)
        logger.warning("Command not found while launching: %s", display_cmd)
        return 127

    _active_processes.add(proc)
    output_queue: queue.Queue[str | None] = queue.Queue()

    def enqueue_output():
        try:
            if proc.stdout is None:
                return
            while True:
                char = proc.stdout.read(1)
                if not isinstance(char, (bytes, str)):
                    logger.debug("Stopping reader thread on unexpected stdout.read() value: %r", char)
                    break
                if not char:
                    break
                decoded = coerce_subprocess_output(char)
                if not decoded:
                    continue
                sys.stdout.write(decoded)
                sys.stdout.flush()
                output_queue.put(decoded)
        finally:
            output_queue.put(None)

    reader_thread = threading.Thread(target=enqueue_output, daemon=True)
    reader_thread.start()

    buffer = ""
    last_heartbeat = time.time()
    recent_lines: deque[str] = deque(maxlen=50)
    saw_eof = False

    try:
        while True:
            if cancel_check():
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
                return 1

            try:
                item = output_queue.get(timeout=0.1)
                if item is None:
                    saw_eof = True
                else:
                    buffer += item
                    if item in ("\n", "\r"):
                        line = buffer.strip()
                        if line:
                            recent_lines.append(line)
                        on_output(buffer)
                        buffer = ""
                        last_heartbeat = time.time()
            except queue.Empty:
                if time.time() - last_heartbeat >= 1.0:
                    on_output("")
                    last_heartbeat = time.time()

            if saw_eof and proc.poll() is not None and output_queue.empty():
                break

        # Final flush
        if buffer:
            line = buffer.strip()
            if line:
                recent_lines.append(line)
            on_output(buffer)

        rc = proc.returncode or 0
        if rc != 0:
            logger.error(
                "Command failed (rc=%s): %s\nLast output:\n%s",
                rc,
                display_cmd,
                "\n".join(recent_lines),
            )
        return rc
    finally:
        reader_thread.join(timeout=0.5)
        if proc in _active_processes:
            _active_processes.remove(proc)
