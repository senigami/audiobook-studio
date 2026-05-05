"""TTS Server watchdog for Studio 2.0.

The watchdog manages the TTS Server subprocess lifecycle:

- Spawns the TTS Server as a subprocess and waits for its READY signal.
- Polls ``GET /health`` on a configurable heartbeat interval.
- Detects failures (process exit, timeouts, HTTP errors) and automatically
  restarts the server up to a configurable limit.
- Implements a circuit breaker that stops restarting after too many rapid
  failures to prevent an infinite crash loop.

Usage::

    watchdog = TtsServerWatchdog(executable=sys.executable, plugins_dir=plugins_dir)
    watchdog.start()          # non-blocking — runs in a daemon thread
    ...
    watchdog.stop()           # graceful shutdown

All methods are thread-safe.
"""

from __future__ import annotations
from typing import Any, Callable, Optional

import logging
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path

from app.config import PLUGINS_DIR
from app.engines.tts_client import TtsClient

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Global singleton — used by the bridge when tts_client_factory is not set
# ---------------------------------------------------------------------------

#: The global watchdog instance started during Studio boot.
#: None until ``start_watchdog()`` is called.
_global_watchdog: TtsServerWatchdog | None = None


def start_watchdog(
    *,
    plugins_dir: Path | None = None,
    port: int = 7862,
    host: str = "127.0.0.1",
) -> "TtsServerWatchdog":
    """Start the global TTS Server watchdog.

    Called by the Studio boot sequence. Returns the running watchdog instance.
    Idempotent — returns the existing watchdog if it is already running.

    Args:
        plugins_dir: Path to the ``plugins/`` directory.
        port: Starting port number (default 7862).
        host: Bind address (default 127.0.0.1).

    Returns:
        TtsServerWatchdog: The started watchdog.
    """
    global _global_watchdog  # noqa: PLW0603

    if _global_watchdog is not None:
        logger.debug("Watchdog already running — returning existing instance.")
        return _global_watchdog

    resolved_plugins = (plugins_dir or PLUGINS_DIR).resolve()
    watchdog = TtsServerWatchdog(
        plugins_dir=resolved_plugins,
        port=port,
        host=host,
    )
    watchdog.start()
    _global_watchdog = watchdog
    return watchdog


def stop_watchdog() -> None:
    """Stop the global TTS Server watchdog if it is running."""
    global _global_watchdog  # noqa: PLW0603

    if _global_watchdog is not None:
        _global_watchdog.stop()
        _global_watchdog = None


def get_watchdog() -> "TtsServerWatchdog | None":
    """Return the global watchdog instance, or None if not yet started.

    Used by the registry and other components that need to reach the TTS
    Server without owning the lifecycle.
    """
    return _global_watchdog


# Watchdog default configuration.
_HEARTBEAT_INTERVAL   = 5.0   # seconds between /health polls
_FAILURE_THRESHOLD    = 3     # consecutive failures before restart
_RESTART_COOLDOWN     = 10.0  # seconds to wait before restarting
_CIRCUIT_PERIOD       = 300.0 # seconds — window for restart rate limiting
_CIRCUIT_MAX_RESTARTS = 5     # max restarts within the circuit period
_READY_TIMEOUT        = 60.0  # seconds to wait for TTS Server READY signal
_DEFAULT_PORT         = 7862
_PORT_RANGE           = 10    # number of ports to try


class WatchdogError(RuntimeError):
    """Raised when the watchdog encounters a fatal, unrecoverable error."""


class TtsServerWatchdog:
    """Manages the TTS Server subprocess with heartbeat and auto-restart.

    Args:
        executable: Python interpreter path (e.g. ``sys.executable``).
        server_script: Path to ``tts_server.py``.
        plugins_dir: Path to the ``plugins/`` directory.
        port: Starting port number.
        host: Bind address for the TTS Server.
    """

    def __init__(
        self,
        *,
        executable: str = sys.executable,
        server_script: Path | None = None,
        plugins_dir: Path = PLUGINS_DIR,
        port: int = _DEFAULT_PORT,
        host: str = "127.0.0.1",
    ) -> None:
        self.executable = executable
        self.server_script = server_script or (
            Path(__file__).resolve().parent.parent.parent / "tts_server.py"
        )
        self.plugins_dir = plugins_dir
        self._requested_port = port
        self._host = host

        # Runtime state — protected by _lock.
        self._lock = threading.Lock()
        self._process: subprocess.Popen | None = None
        self._port: int = port
        self._consecutive_failures: int = 0
        self._restart_times: list[float] = []  # monotonic timestamps
        self._healthy: bool = False
        self._circuit_open: bool = False
        self._client: TtsClient | None = None
        self._stopping: bool = False
        self._log_buffer: deque[str] = deque(maxlen=200)

        # Readiness signaling
        self._ready_event = threading.Event()
        self._ready_port: int | None = None
        self._log_listeners: list[Callable[[str, Optional[str]], None]] = []

        # Background watchdog thread.
        self._thread: threading.Thread | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Spawn the TTS Server and start the watchdog thread."""
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                logger.warning("Watchdog is already running.")
                return
            self._stopping = False

        self._spawn()

        self._thread = threading.Thread(
            target=self._run_watchdog_loop,
            daemon=True,
            name="tts-server-watchdog",
        )
        self._thread.start()

    def register_log_listener(self, callback: Callable[[str, Optional[str]], None]) -> None:
        """Attach a listener to receive real-time log lines from the server."""
        with self._lock:
            if callback not in self._log_listeners:
                self._log_listeners.append(callback)

    def unregister_log_listener(self, callback: Callable[[str, Optional[str]], None]) -> None:
        """Remove a specific log listener."""
        with self._lock:
            if callback in self._log_listeners:
                self._log_listeners.remove(callback)

    def _broadcast_log(self, line: str, task_id: Optional[str] = None) -> None:
        """Manually trigger all registered log listeners."""
        with self._lock:
            listeners = list(self._log_listeners)
        for listener in listeners:
            try:
                listener(line, task_id)
            except Exception:
                pass

    def stop(self) -> None:
        """Signal the watchdog to stop and terminate the TTS Server."""
        logger.info("Watchdog stopping...")
        with self._lock:
            self._stopping = True

        if self._thread:
            self._thread.join(timeout=10.0)

        self._terminate_process()
        logger.info("Watchdog stopped.")

    def is_healthy(self) -> bool:
        """Return True when the TTS Server is responding to heartbeats."""
        with self._lock:
            return self._healthy

    def is_circuit_open(self) -> bool:
        """Return True when the circuit breaker has stopped all restarts."""
        with self._lock:
            return self._circuit_open

    def get_url(self) -> str:
        """Return the base URL of the TTS Server (e.g. http://127.0.0.1:7862)."""
        with self._lock:
            return f"http://{self._host}:{self._port}"

    def get_port(self) -> int:
        """Return the current bound port for the TTS Server."""
        with self._lock:
            return self._port

    def get_client(self) -> TtsClient:
        """Return a TtsClient bound to the current TTS Server address."""
        with self._lock:
            if self._client is None:
                self._client = TtsClient(f"http://{self._host}:{self._port}")
            return self._client

    def get_logs(self) -> str:
        """Return the captured stderr logs from the TTS Server."""
        with self._lock:
            return "\n".join(self._log_buffer)

    def restart(self) -> None:
        """Manually restart the TTS Server and clear failure history."""
        logger.info("Manual TTS Server restart requested.")
        with self._lock:
            self._circuit_open = False
            self._restart_times.clear()
            self._consecutive_failures = 0
            self._log_buffer.clear()
        self.stop()
        self.start()

    # ------------------------------------------------------------------
    # Private: spawn & lifecycle
    # ------------------------------------------------------------------

    def _spawn(self) -> None:
        """Start the TTS Server subprocess and wait for READY signal.

        Raises:
            WatchdogError: If the process fails to start or times out.
        """
        cmd = [
            self.executable, "-u",
            # Use abspath to ensure we find it regardless of cwd.
            str(self.server_script.resolve()),
            "--port", str(self._requested_port),
            "--port-range", str(_PORT_RANGE),
            "--host", self._host,
            "--plugins-dir", str(self.plugins_dir.resolve()),
        ]

        logger.info("Spawning TTS Server: %s", " ".join(cmd))
        try:
            # We use subprocess.PIPE for both to capture logs.
            # We must drain them in background threads IMMEDIATELY to prevent deadlocks.
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,  # line-buffered
            )
        except OSError as exc:
            raise WatchdogError(f"Could not spawn TTS Server: {exc}") from exc

        with self._lock:
            self._process = proc
            # Reset readiness state for the new process
            self._ready_event.clear()
            self._ready_port = None

        # Drain stdout and stderr immediately to prevent deadlocks if pipes fill up during discovery
        threading.Thread(
            target=self._drain_stream,
            args=(proc, "stdout", proc.stdout),
            daemon=True,
            name=f"tts-stdout-{proc.pid}",
        ).start()

        threading.Thread(
            target=self._drain_stream,
            args=(proc, "stderr", proc.stderr),
            daemon=True,
            name=f"tts-stderr-{proc.pid}",
        ).start()

        # Wait for the READY signal (detected in the stdout drainer thread).
        port = self._wait_for_ready(proc)

        with self._lock:
            self._port = port
            self._client = TtsClient(f"http://{self._host}:{port}")
            self._consecutive_failures = 0
            self._healthy = True

        logger.info("TTS Server is ready on port %d (pid=%d)", port, proc.pid)

    def _wait_for_ready(self, proc: subprocess.Popen) -> int:
        """Block until the TTS Server prints READY:{port} or times out.

        Readiness is signaled by the _drain_stream thread setting self._ready_event.

        Args:
            proc: The TTS Server subprocess.

        Returns:
            int: The port number extracted from the READY signal.

        Raises:
            WatchdogError: If the process exits early or the timeout elapses.
        """
        start_time = time.monotonic()
        while time.monotonic() < start_time + _READY_TIMEOUT:
            if self._ready_event.wait(timeout=0.5):
                if self._ready_port is not None:
                    return self._ready_port

            if proc.poll() is not None:
                # Capture whatever we can from the log buffer if it died
                with self._lock:
                    logs = "\n".join(list(self._log_buffer)[-20:])
                raise WatchdogError(
                    f"TTS Server process exited (rc={proc.returncode}) before READY. "
                    f"Recent logs:\n{logs}"
                )

        # Timeout
        proc.kill()
        raise WatchdogError(
            f"TTS Server did not send READY within {_READY_TIMEOUT}s"
        )


    def _terminate_process(self) -> None:
        """Send SIGTERM then SIGKILL to the TTS Server process."""
        with self._lock:
            proc = self._process

        if proc is None:
            return

        try:
            if proc.poll() is None:
                logger.debug("Sending SIGTERM to TTS Server (pid=%d)", proc.pid)
                proc.terminate()
                try:
                    proc.wait(timeout=5.0)
                except subprocess.TimeoutExpired:
                    logger.warning("TTS Server did not exit; sending SIGKILL")
                    proc.kill()
                    proc.wait()
        except OSError:
            pass  # Process already gone.
        finally:
            with self._lock:
                self._process = None
                self._healthy = False

    # ------------------------------------------------------------------
    # Private: watchdog loop
    # ------------------------------------------------------------------

    def _run_watchdog_loop(self) -> None:
        """Main watchdog loop — runs in a background daemon thread."""
        while True:
            with self._lock:
                if self._stopping:
                    break
                if self._circuit_open:
                    time.sleep(5)
                    continue

            # Check health immediately then sleep
            self._heartbeat()
            time.sleep(_HEARTBEAT_INTERVAL)


    def _heartbeat(self) -> None:
        """Poll /health and handle failure/recovery."""
        with self._lock:
            client = self._client
            proc = self._process

        # Check if process has died.
        if proc is not None and proc.poll() is not None:
            # Capture logs for diagnosis
            with self._lock:
                logs = "\n".join(list(self._log_buffer)[-20:])
            logger.warning(
                "TTS Server process exited (rc=%d); triggering restart.\nRecent logs:\n%s",
                proc.returncode,
                logs,
            )
            self._on_failure(reason="process_exit")
            return

        if client is None:
            # This should only happen during startup race, but we handle it.
            return

        alive = client.ping()

        with self._lock:
            if alive:
                self._consecutive_failures = 0
                self._healthy = True
            else:
                self._consecutive_failures += 1
                failures = self._consecutive_failures

        if not alive:
            logger.warning(
                "TTS Server heartbeat failed (%d/%d consecutive).", failures, _FAILURE_THRESHOLD
            )
            if failures >= _FAILURE_THRESHOLD:
                self._healthy = False
                self._on_failure(reason="heartbeat_timeout")


    def _on_failure(self, reason: str) -> None:
        """Handle a TTS Server failure — restart if the circuit allows it."""
        logger.error("TTS Server failure detected (reason=%s)", reason)

        self._terminate_process()

        with self._lock:
            if self._stopping:
                return

            now = time.monotonic()
            # Prune restart timestamps outside the circuit window.
            self._restart_times = [
                t for t in self._restart_times if now - t < _CIRCUIT_PERIOD
            ]

            if len(self._restart_times) >= _CIRCUIT_MAX_RESTARTS:
                self._circuit_open = True

                logger.error(
                    "Circuit breaker OPEN: %d restarts in %.0fs. "
                    "TTS Server will not be restarted automatically. "
                    "TTS services are now unavailable until manual restart.",
                    _CIRCUIT_MAX_RESTARTS,
                    _CIRCUIT_PERIOD,
                )
                return

        logger.info(
            "Waiting %.0fs before restart...", _RESTART_COOLDOWN
        )
        time.sleep(_RESTART_COOLDOWN)

        with self._lock:
            if self._stopping:
                return

        try:
            self._spawn()
            with self._lock:
                self._restart_times.append(time.monotonic())
                self._consecutive_failures = 0
            logger.info("TTS Server restarted successfully.")
        except WatchdogError as exc:
            logger.error("TTS Server restart failed: %s. TTS services will remain unavailable.", exc)
            with self._lock:
                self._circuit_open = True

    def _drain_stream(self, proc: subprocess.Popen, name: str, stream: Any) -> None:
        """Read and log all lines from a subprocess stream (stdout or stderr)."""
        if stream is None:
            return
        try:
            for line in stream:
                line = line.rstrip()
                if not line:
                    continue

                # Check for the READY signal if we are still waiting for it.
                if name == "stdout" and not self._ready_event.is_set():
                    if "READY:" in line:
                        try:
                            # Line format: "READY:7862"
                            port_str = line.split("READY:")[1].strip().split()[0]
                            self._ready_port = int(port_str)
                            self._ready_event.set()
                        except (ValueError, IndexError):
                            logger.warning("Failed to parse READY port from line: %r", line)


                # Try to extract task_id from markers for correlation
                task_id = None
                if "[START_SYNTHESIS]" in line:
                    parts = line.split("[START_SYNTHESIS]")
                    if len(parts) > 1:
                        task_id = parts[1].strip().split()[0] if parts[1].strip() else None
                elif "[PROGRESS]" in line:
                    parts = line.split("[PROGRESS]")
                    if len(parts) > 1:
                        sub_parts = parts[1].strip().split()
                        if len(sub_parts) >= 2:
                            if "%" in sub_parts[0]:
                                task_id = sub_parts[1]
                            else:
                                task_id = sub_parts[0]
                        elif len(sub_parts) == 1 and "%" not in sub_parts[0]:
                            task_id = sub_parts[0]

                with self._lock:
                    self._log_buffer.append(f"[{name}] {line}")
                    listeners = list(self._log_listeners)

                for listener in listeners:
                    try:
                        listener(line, task_id)
                    except Exception:
                        pass

                logger.debug("[tts-server-%s] %s", name, line)
        except Exception:
            if not self._stopping:
                logger.debug("Stream drainer %s exited unexpectedly", name)
        finally:
            try:
                stream.close()
            except Exception:
                pass
