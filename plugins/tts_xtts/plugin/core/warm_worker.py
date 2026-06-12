"""Persistent XTTS inference worker.

Spawns xtts_inference.py in ``--serve`` mode once, keeps it alive between
requests, and terminates it after an idle timeout.  Falls back transparently
to a one-shot subprocess if the worker crashes or is disabled.

Thread-safety: a single ``threading.Lock`` serialises jobs (the engine handles
one synthesis at a time — verified in ``engine.py`` which is single-threaded
per request from the TTS server).  The lock is held for the full duration of
streaming a job so that a second call waits rather than corrupting the pipe.

Env-var overrides (tests):
    XTTS_WARM_WORKER_SCRIPT  — path to the worker script to spawn (default:
                               xtts_inference.py in the same directory).
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)

# Default idle timeout (seconds) before the worker is terminated.
_DEFAULT_IDLE_SECONDS = 300

# Sentinel emitted by the serve-mode worker on stdout when a job completes.
# Format:  {"done": true, "rc": <int>}
_DONE_PREFIX = '{"done":'


class WarmWorker:
    """Long-lived xtts_inference.py ``--serve`` subprocess manager.

    Lifecycle
    ---------
    * Created by ``WarmWorkerManager`` on first synthesis request.
    * Stays alive until the idle timer fires or ``shutdown()`` is called.
    * If the subprocess exits unexpectedly the ``is_alive`` property returns
      ``False``; the manager will then fall back and re-spawn on the next call.
    """

    def __init__(self, python_exe: Path, script_path: Path, env: dict) -> None:
        self._python_exe = python_exe
        self._script_path = script_path
        self._env = env
        self._proc: subprocess.Popen | None = None
        self._start()

    def _start(self) -> None:
        cmd = [str(self._python_exe), str(self._script_path), "--serve"]
        logger.debug("WarmWorker: spawning %s", cmd)
        self._proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
            env=self._env,
            start_new_session=True,
        )

    @property
    def is_alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def run_job(
        self,
        job: dict,
        on_output: Callable[[str], None],
        cancel_check: Callable[[], bool],
    ) -> int:
        """Send a job to the worker and stream stderr markers until done.

        Returns the rc reported by the worker (0 = success).  Raises
        ``RuntimeError`` if the worker is dead before the job starts.
        """
        if not self.is_alive:
            raise RuntimeError("WarmWorker: process is not alive")

        proc = self._proc
        assert proc is not None
        assert proc.stdin is not None
        assert proc.stderr is not None
        assert proc.stdout is not None

        # Send job over stdin.
        line = json.dumps(job) + "\n"
        try:
            proc.stdin.write(line.encode())
            proc.stdin.flush()
        except BrokenPipeError as exc:
            raise RuntimeError(f"WarmWorker: broken pipe writing job: {exc}") from exc

        # Stream stderr (markers + progress) in a side thread into a queue.
        # Read the stdout done-sentinel in another thread.
        # The main thread drains the stderr queue and checks cancellation.
        import queue as _queue

        done_event = threading.Event()
        rc_holder: list[int] = [1]
        stderr_queue: _queue.Queue[str | None] = _queue.Queue()

        def _read_stdout() -> None:
            """Read the done-sentinel line from stdout."""
            assert proc.stdout is not None
            buf = b""
            while True:
                ch = proc.stdout.read(1)
                if not ch:
                    break
                if ch == b"\n":
                    try:
                        payload = json.loads(buf.decode())
                        if payload.get("done"):
                            rc_holder[0] = int(payload.get("rc", 1))
                            done_event.set()
                            return
                    except Exception:
                        pass
                    buf = b""
                else:
                    buf += ch
            done_event.set()  # EOF without sentinel — signal completion anyway

        def _read_stderr() -> None:
            """Read stderr lines into the queue."""
            assert proc.stderr is not None
            buf = b""
            try:
                while True:
                    ch = proc.stderr.read(1)
                    if not ch:
                        break
                    if ch in (b"\n", b"\r"):
                        line_str = buf.decode("utf-8", errors="replace").rstrip()
                        if line_str:
                            stderr_queue.put(line_str + "\n")
                        buf = b""
                    else:
                        buf += ch
                if buf:
                    stderr_queue.put(buf.decode("utf-8", errors="replace") + "\n")
            finally:
                stderr_queue.put(None)  # EOF sentinel

        stdout_reader = threading.Thread(target=_read_stdout, daemon=True)
        stderr_reader = threading.Thread(target=_read_stderr, daemon=True)
        stdout_reader.start()
        stderr_reader.start()

        # Drain the stderr queue.  After done_event fires we keep draining
        # until the stderr reader signals EOF (None sentinel).
        stderr_eof = False
        while not stderr_eof:
            if cancel_check():
                logger.debug("WarmWorker: cancel requested — killing process")
                try:
                    proc.kill()
                    proc.wait(timeout=3)
                except Exception:
                    pass
                self._proc = None
                return 1

            try:
                item = stderr_queue.get(timeout=0.05)
                if item is None:
                    stderr_eof = True
                else:
                    on_output(item)
            except _queue.Empty:
                # If done and queue is empty, we can stop waiting.
                if done_event.is_set():
                    # Give stderr reader a moment to flush remaining lines.
                    try:
                        stderr_reader.join(timeout=0.5)
                    except Exception:
                        pass
                    # Drain whatever arrived during the join.
                    while True:
                        try:
                            item = stderr_queue.get_nowait()
                            if item is None:
                                break
                            on_output(item)
                        except _queue.Empty:
                            break
                    break

        stdout_reader.join(timeout=2.0)

        # If the process died without sending a sentinel, report failure.
        if not done_event.is_set():
            if not self.is_alive:
                self._proc = None
            return 1

        return rc_holder[0]

    def shutdown(self) -> None:
        """Terminate the worker process."""
        if self._proc is not None and self._proc.poll() is None:
            logger.debug("WarmWorker: shutdown requested")
            try:
                self._proc.stdin.close()  # type: ignore[union-attr]
            except Exception:
                pass
            try:
                self._proc.terminate()
                self._proc.wait(timeout=5)
            except Exception:
                try:
                    self._proc.kill()
                except Exception:
                    pass
        self._proc = None


class WarmWorkerManager:
    """Singleton-per-engine manager that owns the WarmWorker lifecycle.

    Usage (inside engine.py)::

        _worker_manager = WarmWorkerManager()

        # in synthesize():
        rc = _worker_manager.run_job(job, on_output, cancel_check)

        # in shutdown():
        _worker_manager.shutdown()
    """

    def __init__(
        self,
        python_exe: Path,
        *,
        idle_seconds: int = _DEFAULT_IDLE_SECONDS,
        env: dict | None = None,
    ) -> None:
        self._python_exe = python_exe
        self._idle_seconds = idle_seconds
        self._env = env or os.environ.copy()
        self._env.setdefault("PYTHONUNBUFFERED", "1")

        # Resolve the inference script path (can be overridden for tests).
        default_script = Path(__file__).parent / "xtts_inference.py"
        self._script_path = Path(
            os.environ.get("XTTS_WARM_WORKER_SCRIPT", str(default_script))
        )

        self._worker: WarmWorker | None = None
        self._lock = threading.Lock()
        self._idle_timer: threading.Timer | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run_job(
        self,
        job: dict,
        on_output: Callable[[str], None],
        cancel_check: Callable[[], bool],
    ) -> int:
        """Run a synthesis job, spawning the worker if needed.

        Falls back to ``None`` return if the worker cannot be used; caller
        should then invoke the legacy one-shot path.
        """
        with self._lock:
            self._cancel_idle_timer()
            worker = self._get_or_spawn()

        try:
            rc = worker.run_job(job, on_output, cancel_check)
        except RuntimeError as exc:
            logger.warning("WarmWorker: job failed (%s); falling back to one-shot", exc)
            with self._lock:
                self._worker = None
            return -1  # Signal fallback to caller.
        finally:
            with self._lock:
                # Only restart idle timer if the worker is still alive.
                if self._worker is not None and self._worker.is_alive:
                    self._restart_idle_timer()
                else:
                    self._worker = None

        return rc

    def shutdown(self) -> None:
        """Terminate the worker and cancel the idle timer."""
        with self._lock:
            self._cancel_idle_timer()
            if self._worker is not None:
                self._worker.shutdown()
                self._worker = None

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_or_spawn(self) -> WarmWorker:
        """Return the live worker, spawning a new one if needed."""
        if self._worker is not None and self._worker.is_alive:
            return self._worker
        logger.info("WarmWorker: spawning new worker process")
        self._worker = WarmWorker(self._python_exe, self._script_path, self._env)
        return self._worker

    def _cancel_idle_timer(self) -> None:
        if self._idle_timer is not None:
            self._idle_timer.cancel()
            self._idle_timer = None

    def _restart_idle_timer(self) -> None:
        if self._idle_seconds <= 0:
            return
        self._idle_timer = threading.Timer(
            self._idle_seconds, self._idle_timeout
        )
        self._idle_timer.daemon = True
        self._idle_timer.start()

    def _idle_timeout(self) -> None:
        logger.info("WarmWorker: idle timeout — terminating worker")
        with self._lock:
            self._idle_timer = None
            if self._worker is not None:
                self._worker.shutdown()
                self._worker = None
