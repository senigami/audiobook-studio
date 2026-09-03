"""W-PAR 004 slice B: bounded lazy-spawned pool for WarmWorkerManager.

Tests for concurrent inference capability. Mock boundaries (R2): mock subprocess
spawning and the engine; do NOT mock WarmWorkerManager, threading.Semaphore/
queue.Queue, or the pool logic under test.

R4: use threading.Barrier / threading.Event for synchronization; no time.sleep
for coordination; join(timeout=5) with generous tolerance.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from tts_engines.tts_xtts.plugin.core.warm_worker import WarmWorkerManager


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_fake_worker(*, run_job_fn=None, alive: bool = True) -> MagicMock:
    """Create a fake WarmWorker with controllable run_job behaviour."""
    worker = MagicMock()
    worker.is_alive = alive
    if run_job_fn is not None:
        worker.run_job.side_effect = run_job_fn
    else:
        worker.run_job.return_value = 0
    return worker


def _make_manager(cap: int, spawn_fn) -> WarmWorkerManager:
    """Create a WarmWorkerManager(cap=cap) whose _spawn_worker is replaced.

    Because __init__ no longer pre-spawns (worker-0 is lazy), we can safely
    create the manager and then patch _spawn_worker for all future calls.
    """
    mgr = WarmWorkerManager(
        python_exe=Path("/fake/python"),
        idle_seconds=0,  # disable idle timer for test cleanliness
        env={"PYTHONUNBUFFERED": "1"},
        cap=cap,
    )
    mgr._spawn_worker = spawn_fn
    return mgr


def _noop_job():
    return {"text": "hi", "out_path": "/tmp/out.wav", "language": "en", "speed": 1.0}


# ---------------------------------------------------------------------------
# test_semaphore_admits_cap_concurrent_jobs (R1 revert-check target)
# ---------------------------------------------------------------------------

def test_semaphore_admits_cap_concurrent_jobs():
    """cap=2: two concurrent run_job calls must actually run in parallel.

    Uses threading.Barrier(2) inside run_job so both must be in-flight
    simultaneously before either can complete. On a single-worker/serialized
    implementation the barrier times out → red (R1).
    """
    barrier = threading.Barrier(2, timeout=4)
    results: list[int] = []
    errors: list[Exception] = []

    def blocking_run_job(job, on_output, cancel_check):
        barrier.wait()  # forces both threads to meet in-flight
        return 0

    def spawn_fn():
        return _make_fake_worker(run_job_fn=blocking_run_job)

    mgr = _make_manager(cap=2, spawn_fn=spawn_fn)
    try:
        def thread_fn():
            try:
                rc = mgr.run_job(_noop_job(), on_output=lambda _: None, cancel_check=lambda: False)
                results.append(rc)
            except Exception as exc:
                errors.append(exc)

        t1 = threading.Thread(target=thread_fn)
        t2 = threading.Thread(target=thread_fn)
        t1.start()
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)
    finally:
        mgr.shutdown()

    assert not errors, f"Thread errors: {errors}"
    assert len(results) == 2, f"Expected 2 completions, got {results}"
    assert results.count(0) == 2


# ---------------------------------------------------------------------------
# test_lazy_spawn_nth_worker_on_demand
# ---------------------------------------------------------------------------

def test_lazy_spawn_nth_worker_on_demand():
    """Worker-1 must NOT be spawned during a sequential job;
    it should be spawned only when a 2nd concurrent job arrives.
    Worker-0 must be spawned on first run_job (not at __init__)."""
    spawn_count = [0]

    # barrier_holder[0] is None for sequential mode, set for concurrent mode.
    barrier_holder: list[threading.Barrier | None] = [None]
    barrier_lock = threading.Lock()

    def run_job_fn(job, on_output, cancel_check):
        with barrier_lock:
            b = barrier_holder[0]
        if b is not None:
            b.wait()
        return 0

    def spawn_fn():
        spawn_count[0] += 1
        return _make_fake_worker(run_job_fn=run_job_fn)

    mgr = _make_manager(cap=2, spawn_fn=spawn_fn)
    try:
        # Before first run_job: pool is empty (lazy).
        assert spawn_count[0] == 0, f"Expected 0 spawns at init, got {spawn_count[0]}"

        # Sequential job — no barrier, runs and returns.
        mgr.run_job(_noop_job(), on_output=lambda _: None, cancel_check=lambda: False)

        # After first sequential job: exactly 1 spawn (worker-0).
        assert spawn_count[0] == 1, (
            f"Expected 1 spawn after sequential job, got {spawn_count[0]}"
        )

        # Second sequential job — worker-0 should be reused (still 1 spawn).
        mgr.run_job(_noop_job(), on_output=lambda _: None, cancel_check=lambda: False)
        assert spawn_count[0] == 1, (
            f"Expected 1 spawn after 2nd sequential job, got {spawn_count[0]}"
        )

        # Now enable the barrier and run 2 concurrent jobs.
        # Reset spawn counter to track only new spawns.
        spawn_count[0] = 0
        with barrier_lock:
            barrier_holder[0] = threading.Barrier(2, timeout=4)

        results: list[int] = []
        errors: list[Exception] = []

        def thread_fn():
            try:
                rc = mgr.run_job(_noop_job(), on_output=lambda _: None, cancel_check=lambda: False)
                results.append(rc)
            except Exception as exc:
                errors.append(exc)

        t1 = threading.Thread(target=thread_fn)
        t2 = threading.Thread(target=thread_fn)
        t1.start()
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)

        assert not errors, f"Thread errors: {errors}"
        assert len(results) == 2
        # Exactly 1 new spawn for the 2nd concurrent request (worker-1).
        assert spawn_count[0] == 1, (
            f"Expected exactly 1 new spawn for concurrent demand, got {spawn_count[0]}"
        )
    finally:
        mgr.shutdown()


# ---------------------------------------------------------------------------
# test_oom_fallback_caps_at_live_pool
# ---------------------------------------------------------------------------

def test_oom_fallback_caps_at_live_pool(caplog):
    """When _spawn_worker returns None (OOM), the two jobs serialize on the
    existing worker; no exception propagates; a warning is logged; both complete."""
    call_order: list[str] = []
    order_lock = threading.Lock()
    job_started = threading.Event()
    job1_can_finish = threading.Event()

    def slow_run_job(job, on_output, cancel_check):
        with order_lock:
            call_order.append("start")
        job_started.set()
        job1_can_finish.wait(timeout=4)
        with order_lock:
            call_order.append("end")
        return 0

    spawn_count = [0]

    def spawn_fn():
        spawn_count[0] += 1
        if spawn_count[0] == 1:
            # Worker-0: slow so second job has to wait.
            return _make_fake_worker(run_job_fn=slow_run_job)
        # Second spawn fails (OOM).
        return None

    mgr = _make_manager(cap=2, spawn_fn=spawn_fn)
    try:
        results: list[int] = []
        errors: list[Exception] = []

        def thread_fn():
            try:
                rc = mgr.run_job(_noop_job(), on_output=lambda _: None, cancel_check=lambda: False)
                results.append(rc)
            except Exception as exc:
                errors.append(exc)

        t1 = threading.Thread(target=thread_fn)
        t1.start()

        # Wait for job-1 to start (ensures worker-0 is occupied).
        job_started.wait(timeout=4)

        t2 = threading.Thread(target=thread_fn)
        t2.start()

        # Let job-1 complete; job-2 will then run sequentially on worker-0.
        job1_can_finish.set()

        t1.join(timeout=5)
        t2.join(timeout=5)
    finally:
        mgr.shutdown()

    assert not errors, f"Thread errors: {errors}"
    assert len(results) == 2, f"Expected 2 completions, got {results}"
    assert results.count(0) == 2

    # Warning must mention spawn failure.
    all_warnings = " ".join(r.message for r in caplog.records if r.levelno >= logging.WARNING)
    assert "spawn" in all_warnings.lower() or "oom" in all_warnings.lower(), (
        f"Expected OOM/spawn warning, got log: {caplog.text}"
    )

    # Jobs must have serialized (no overlap): call_order should be
    # start, end, start, end (not start, start, end, end).
    assert call_order == ["start", "end", "start", "end"], (
        f"Jobs overlapped despite OOM fallback: {call_order}"
    )


# ---------------------------------------------------------------------------
# test_cap1_is_serial (ships-dark regression)
# ---------------------------------------------------------------------------

def test_cap1_is_serial():
    """cap=1 (default): two concurrent run_job calls must serialize — only one
    in flight at a time. Both must complete. Byte-identical to today's behaviour."""
    overlap_detected = [False]
    in_flight = [0]
    inflight_lock = threading.Lock()
    results: list[int] = []
    errors: list[Exception] = []

    def run_job_fn(job, on_output, cancel_check):
        with inflight_lock:
            in_flight[0] += 1
            if in_flight[0] > 1:
                overlap_detected[0] = True
        # Small busy-wait to expose any real concurrency (no sleep for coordination).
        for _ in range(50000):
            pass
        with inflight_lock:
            in_flight[0] -= 1
        return 0

    def spawn_fn():
        return _make_fake_worker(run_job_fn=run_job_fn)

    mgr = _make_manager(cap=1, spawn_fn=spawn_fn)
    try:
        def thread_fn():
            try:
                rc = mgr.run_job(_noop_job(), on_output=lambda _: None, cancel_check=lambda: False)
                results.append(rc)
            except Exception as exc:
                errors.append(exc)

        t1 = threading.Thread(target=thread_fn)
        t2 = threading.Thread(target=thread_fn)
        t1.start()
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)
    finally:
        mgr.shutdown()

    assert not errors, f"Thread errors: {errors}"
    assert len(results) == 2, f"Expected 2 completions, got {results}"
    assert not overlap_detected[0], "cap=1 must serialize jobs — overlap detected"
