"""Persistent XTTS inference worker.

Spawns xtts_inference.py in ``--serve`` mode once (or up to ``cap`` times),
keeps worker(s) alive between requests, and terminates them after an idle
timeout.  Falls back transparently to a one-shot subprocess if all workers
crash or cannot be spawned.

Thread-safety (pool model, cap≥1):
    ``WarmWorkerManager`` owns a bounded lazy-spawned pool of ``WarmWorker``
    subprocesses.  A ``queue.Queue`` acts as the free-list: a worker is
    removed from the queue while its job is running and returned on
    completion, enforcing per-worker exclusivity (the pipe is not
    concurrency-safe) while allowing up to ``cap`` concurrent inferences.

    ``self._lock`` guards only pool structure mutations (spawn, replace dead
    worker, idle-timer adjustments) — it is never held while a job runs.

    With cap=1 (the default) behaviour is byte-identical to the previous
    single-worker implementation.

Env-var overrides (tests):
    XTTS_WARM_WORKER_SCRIPT  — path to the worker script to spawn (default:
                               xtts_inference.py in the same directory).
"""

from __future__ import annotations

import json
import logging
import os
import queue
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
        # Persistent (worker-lifetime) reader queues. ONE reader per stream feeds
        # these for the whole life of the process — see _start_readers for why
        # per-job readers corrupt subsequent jobs.
        self._stderr_q: queue.Queue[str | None] = queue.Queue()
        self._done_q: queue.Queue[dict | None] = queue.Queue()
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
        self._start_readers()

    def _start_readers(self) -> None:
        """Start ONE stdout + ONE stderr reader for the worker's whole lifetime.

        Why not per-job readers: the worker is long-lived (warm), so its stdout
        and stderr never close between jobs. A per-job stderr reader therefore
        never hits EOF; after a job's stdout done-sentinel it stays blocked on
        ``proc.stderr.read(1)`` forever. The next job would start a SECOND stderr
        reader on the SAME pipe, and the orphaned reader would compete
        byte-for-byte with it — stealing/garbling the new job's markers into a
        dead queue. The symptom: the 2nd (and every later) chapter render emits no
        [SEGMENT_SAVED]/progress, segments never flip to 'done', and the bar jumps
        straight to ~complete — indistinguishable from cached/reused audio.

        A single reader per stream, draining into worker-lifetime queues that
        ``run_job`` consumes per-job (jobs are serialised by the manager lock),
        removes the race entirely.
        """
        proc = self._proc
        assert proc is not None and proc.stdout is not None and proc.stderr is not None

        def _read_stdout() -> None:
            buf = b""
            while True:
                ch = proc.stdout.read(1)
                if not ch:
                    break
                if ch == b"\n":
                    try:
                        payload = json.loads(buf.decode())
                        if isinstance(payload, dict) and payload.get("done"):
                            self._done_q.put(payload)
                    except Exception:
                        pass
                    buf = b""
                else:
                    buf += ch
            self._done_q.put(None)  # EOF — worker exited

        def _read_stderr() -> None:
            buf = b""
            try:
                while True:
                    ch = proc.stderr.read(1)
                    if not ch:
                        break
                    if ch in (b"\n", b"\r"):
                        line_str = buf.decode("utf-8", errors="replace").rstrip()
                        if line_str:
                            self._stderr_q.put(line_str + "\n")
                        buf = b""
                    else:
                        buf += ch
                if buf:
                    self._stderr_q.put(buf.decode("utf-8", errors="replace") + "\n")
            finally:
                self._stderr_q.put(None)  # EOF sentinel

        threading.Thread(target=_read_stdout, daemon=True).start()
        threading.Thread(target=_read_stderr, daemon=True).start()

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

        # Send job over stdin. The persistent readers (started at spawn) stream
        # this job's stderr markers into self._stderr_q and its stdout
        # done-sentinel into self._done_q. Jobs are serialised by the manager
        # lock, so everything between this write and the next done-sentinel
        # belongs to this job.
        line = json.dumps(job) + "\n"
        try:
            proc.stdin.write(line.encode())
            proc.stdin.flush()
        except BrokenPipeError as exc:
            raise RuntimeError(f"WarmWorker: broken pipe writing job: {exc}") from exc

        rc = 1
        worker_died = False
        while True:
            if cancel_check():
                logger.debug("WarmWorker: cancel requested — killing process")
                try:
                    proc.kill()
                    proc.wait(timeout=3)
                except Exception:
                    pass
                self._proc = None
                return 1

            # Relay any markers the persistent reader has queued so far.
            self._relay_pending_stderr(on_output)

            # Wait briefly for this job's done-sentinel.
            try:
                payload = self._done_q.get(timeout=0.05)
            except queue.Empty:
                continue
            if payload is None:
                worker_died = True
            else:
                rc = int(payload.get("rc", 1))
            break

        # The worker flushes all stderr markers BEFORE writing the stdout
        # done-sentinel, but the two pipes are read concurrently — a few trailing
        # marker lines may still be in flight. Drain them for a short grace window
        # so the job's final [SEGMENT_SAVED]/progress are not lost.
        self._relay_trailing_stderr(on_output)

        if worker_died:
            if not self.is_alive:
                self._proc = None
            return 1
        return rc

    def _relay_pending_stderr(self, on_output: Callable[[str], None]) -> None:
        """Relay every stderr line currently queued, without blocking."""
        while True:
            try:
                item = self._stderr_q.get_nowait()
            except queue.Empty:
                return
            if item is None:  # worker EOF
                return
            on_output(item)

    def _relay_trailing_stderr(
        self, on_output: Callable[[str], None], grace: float = 0.3
    ) -> None:
        """Relay trailing stderr lines that arrive within ``grace`` of the
        done-sentinel (markers already flushed by the worker before 'done')."""
        deadline = time.monotonic() + grace
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return
            try:
                item = self._stderr_q.get(timeout=min(0.05, remaining))
            except queue.Empty:
                continue
            if item is None:  # worker EOF
                return
            on_output(item)

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
    """Singleton-per-engine manager that owns the WarmWorker pool lifecycle.

    Pool model (cap≥1)
    ------------------
    Up to ``cap`` WarmWorker subprocesses may run concurrently.  A
    ``queue.Queue`` (``self._free_q``) acts as the free-list: the queue
    size is the concurrency bound.  A worker is dequeued (taken out of
    rotation) while its job runs and re-enqueued on completion, so the same
    WarmWorker subprocess is never given two concurrent jobs (pipe-safety).

    Lazy spawn: worker-0 is spawned on the FIRST ``run_job`` call (matching
    original behaviour — this lets callers override ``_script_path`` after
    construction).  Additional workers (worker-1 … worker-N) are spawned
    only when a new ``run_job`` arrives, all existing workers are busy, AND
    ``len(self._pool) < cap``.  The pool never pre-spawns more than needed.

    With cap=1 (the default) behaviour is byte-identical to the previous
    single-worker implementation — the free-list holds exactly one entry,
    so all jobs serialize.

    Usage (inside engine.py)::

        _worker_manager = WarmWorkerManager(python_exe, cap=cap)

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
        cap: int = 1,
    ) -> None:
        self._python_exe = python_exe
        self._idle_seconds = idle_seconds
        self._env = env or os.environ.copy()
        self._env.setdefault("PYTHONUNBUFFERED", "1")
        self._cap = max(1, int(cap))

        # Resolve the inference script path (can be overridden for tests).
        default_script = Path(__file__).parent / "xtts_inference.py"
        self._script_path = Path(
            os.environ.get("XTTS_WARM_WORKER_SCRIPT", str(default_script))
        )

        # Pool state — guarded by self._lock for structure mutations only.
        # self._pool: all WarmWorker instances (alive or recently dead).
        # self._free_q: workers that are not currently running a job.
        self._pool: list[WarmWorker] = []
        self._free_q: queue.Queue[WarmWorker] = queue.Queue()
        self._lock = threading.Lock()
        self._idle_timer: threading.Timer | None = None

        # Backward-compat: self._worker mirrors the most-recently-used live
        # worker so existing tests that read mgr._worker still pass (cap=1).
        self._worker: WarmWorker | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run_job(
        self,
        job: dict,
        on_output: Callable[[str], None],
        cancel_check: Callable[[], bool],
    ) -> int:
        """Run a synthesis job, spawning workers lazily as needed (up to cap).

        Blocks until a free worker is available.
        Returns -1 to signal fallback to the one-shot path on worker failure.
        """
        with self._lock:
            self._cancel_idle_timer()

        # Acquire a free worker (spawning if needed; blocks if all are busy at cap).
        worker = self._acquire_worker()
        if worker is None:
            # All spawn attempts failed — signal one-shot fallback.
            return -1

        try:
            rc = worker.run_job(job, on_output, cancel_check)
        except RuntimeError as exc:
            logger.warning("WarmWorker: job failed (%s); falling back to one-shot", exc)
            # Drop dead worker from pool; do NOT return it to the free-list.
            with self._lock:
                self._remove_dead_worker(worker)
                self._worker = self._pool[0] if self._pool else None
            return -1  # Signal fallback to caller.
        else:
            # Return the worker to the free-list if it's still alive.
            if worker.is_alive:
                self._free_q.put(worker)
                with self._lock:
                    self._worker = worker
                    self._restart_idle_timer()
            else:
                with self._lock:
                    self._remove_dead_worker(worker)
                    self._worker = self._pool[0] if self._pool else None

        return rc

    def shutdown(self) -> None:
        """Terminate all pooled workers and cancel the idle timer."""
        with self._lock:
            self._cancel_idle_timer()
            workers_to_stop = list(self._pool)
            self._pool.clear()
            self._worker = None
        # Drain the free-list so any blocked acquirers do not get dead workers.
        while not self._free_q.empty():
            try:
                self._free_q.get_nowait()
            except queue.Empty:
                break
        for w in workers_to_stop:
            try:
                w.shutdown()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _spawn_worker(self) -> "WarmWorker | None":
        """Attempt to spawn a new WarmWorker; return None on failure (OOM/OSError)."""
        try:
            logger.info("WarmWorker: spawning new worker process")
            w = WarmWorker(self._python_exe, self._script_path, self._env)
            if not w.is_alive:
                logger.warning("WarmWorker: spawned process exited immediately")
                return None
            return w
        except (MemoryError, OSError) as exc:
            logger.warning("WarmWorker: failed to spawn worker (%s)", exc)
            return None

    def _acquire_worker(self) -> "WarmWorker | None":
        """Return a free worker, spawning a new one if the pool is under cap.

        Blocks (on ``self._free_q.get()``) only when all workers are busy and
        the pool is already at cap.  Returns None only if the pool is
        permanently empty (every spawn attempt failed).
        """
        # Fast path: grab from the free-list without waiting.
        try:
            w = self._free_q.get_nowait()
            # Verify the worker is still alive; if not, replace it.
            if w.is_alive:
                return w
            with self._lock:
                self._remove_dead_worker(w)
        except queue.Empty:
            pass

        # Either no free worker or the one we got was dead.
        # Try spawning if under cap (covers worker-0 lazy init too).
        with self._lock:
            if len(self._pool) < self._cap:
                new_worker = self._spawn_worker()
                if new_worker is not None:
                    self._pool.append(new_worker)
                    self._worker = new_worker
                    return new_worker  # Hand directly to caller (not in free_q yet).
                else:
                    # OOM / spawn fail: reduce effective cap to live pool size.
                    live_count = sum(1 for pw in self._pool if pw.is_alive)
                    logger.warning(
                        "WarmWorker: worker-%d failed to spawn (OOM?); "
                        "capping at %d concurrent worker(s)",
                        len(self._pool),
                        max(1, live_count),
                    )
                    self._cap = max(1, live_count)

        # Pool is at (effective) cap and all workers are busy.
        if not self._pool:
            # Permanently empty — signal one-shot fallback.
            return None
        # Block until a running job returns a worker to the free-list.
        # NOTE (W-PAR): if every pooled worker dies while this acquirer waits,
        # no worker is ever re-enqueued and this get() hangs.  This edge is
        # *dormant under ships-dark* (cap=1 + single-flight dispatch means no
        # second acquirer ever blocks here) and is owned by task 005
        # (stuck-segment heartbeat / cancel-signal+join) when parallelism is
        # enabled.  Do not add an ad-hoc timeout here — 005 handles it holistically.
        return self._free_q.get()

    def _get_or_spawn(self) -> WarmWorker:
        """Backward-compat helper: return live worker or spawn a new one.

        Called by tests that acquire a worker inside ``self._lock``.
        Must be called while holding ``self._lock``.
        """
        if self._worker is not None and self._worker.is_alive:
            return self._worker
        w = self._spawn_worker()
        if w is None:
            raise RuntimeError("WarmWorker: could not spawn a worker")
        self._pool.append(w)
        self._worker = w
        # Do NOT put into free_q — caller may be patching run_job on it.
        return w

    def _remove_dead_worker(self, worker: "WarmWorker") -> None:
        """Remove a dead worker from the pool (call under self._lock)."""
        try:
            self._pool.remove(worker)
        except ValueError:
            pass

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
        logger.info("WarmWorker: idle timeout — terminating all pool workers")
        with self._lock:
            self._idle_timer = None
            workers_to_stop = list(self._pool)
            self._pool.clear()
            self._worker = None
        while not self._free_q.empty():
            try:
                self._free_q.get_nowait()
            except queue.Empty:
                break
        for w in workers_to_stop:
            try:
                w.shutdown()
            except Exception:
                pass
