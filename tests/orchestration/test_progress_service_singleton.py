"""Tests for Task 002: ProgressService singleton, RLock, and D7 deadlock avoidance.

Covers:
- D7 deadlock test: _STATE_LOCK → enrich (PS-RLock) vs publish → get_jobs (_STATE_LOCK) do not AB-BA deadlock.
- Cross-job isolation: two threads publish for different job_ids share one singleton but never bleed state.
- Resolver identity: get_progress_service() and orchestrator's resolved service are the same object.
"""

from __future__ import annotations

import threading
import time

import pytest

from app.orchestration.progress.service import (
    ProgressService,
    create_progress_service,
    get_progress_service,
    reset_progress_service,
    set_progress_service,
)
from app.orchestration.progress.eta import estimate_eta_seconds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_local_service():
    """Construct a fully clock-injected local instance (NOT the singleton)."""
    events: list[tuple[dict, str]] = []
    wall_now = {"value": 100.0}
    monotonic_now = {"value": 500.0}

    def wall_clock() -> float:
        return wall_now["value"]

    def monotonic_clock() -> float:
        return monotonic_now["value"]

    def broadcaster(*, payload: dict, channel: str) -> None:
        events.append((payload, channel))

    svc = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=estimate_eta_seconds,
        broadcaster=broadcaster,
        wall_clock=wall_clock,
        monotonic_clock=monotonic_clock,
        max_silence_seconds=10.0,
    )
    return svc, events, wall_now, monotonic_now


# ---------------------------------------------------------------------------
# D7 deadlock test
# ---------------------------------------------------------------------------

class TestD7DeadlockAvoidance:
    """Prove that _STATE_LOCK → PS-RLock and PS-RLock → _STATE_LOCK paths do
    not AB-BA deadlock.

    Thread 1 simulates the listener path (Task 004): it holds _STATE_LOCK (via
    update_job / directly) and calls progress_service.enrich() which acquires
    the PS-RLock as a leaf lock.

    Thread 2 simulates the publish path: it calls progress_service.publish()
    which calls get_jobs() (acquires _STATE_LOCK) BEFORE acquiring the PS-RLock
    for bookkeeping.

    R1 revert-check: if enrich or _should_emit held the PS-RLock while calling
    get_jobs(), thread 2 would deadlock waiting for _STATE_LOCK while thread 1
    holds _STATE_LOCK waiting for the PS-RLock to be released by thread 2.
    With the leaf-lock discipline both threads complete within the timeout.
    """

    @pytest.mark.timeout(10)
    def test_no_deadlock_state_lock_vs_publish_get_jobs(self):
        """Both threads complete within timeout — no AB-BA deadlock."""
        from app.db.state_jobs import _STATE_LOCK

        svc, events, wall_now, _ = _make_local_service()
        set_progress_service(svc)

        # Barrier: forces the two threads to actually interleave.
        thread1_holds_state_lock = threading.Event()
        thread2_may_proceed = threading.Event()
        results: dict[str, bool] = {}

        def thread1_fn():
            """Hold _STATE_LOCK; call enrich() from inside it (listener path)."""
            with _STATE_LOCK:
                thread1_holds_state_lock.set()
                # Wait until thread 2 is in publish (about to call get_jobs).
                thread2_may_proceed.wait(timeout=5.0)
                # enrich acquires PS-RLock internally; must NOT call get_jobs.
                payload = {"status": "running", "progress": 0.4, "job_id": "job-d7-t1"}
                svc.enrich("job-d7-t1", payload)
            results["t1"] = True

        def thread2_fn():
            """Call publish() which calls get_jobs() under _STATE_LOCK."""
            thread1_holds_state_lock.wait(timeout=5.0)
            thread2_may_proceed.set()
            # publish → get_jobs (acquires _STATE_LOCK) → then PS-RLock for bookkeeping
            svc.publish(
                job_id="job-d7-t2",
                status="running",
                progress=0.5,
                eta_seconds=20,
            )
            results["t2"] = True

        t1 = threading.Thread(target=thread1_fn, name="d7-t1", daemon=True)
        t2 = threading.Thread(target=thread2_fn, name="d7-t2", daemon=True)
        t1.start()
        t2.start()
        t1.join(timeout=8.0)
        t2.join(timeout=8.0)

        assert results.get("t1") is True, "Thread 1 (enrich-under-STATE_LOCK) did not complete — possible deadlock"
        assert results.get("t2") is True, "Thread 2 (publish/get_jobs) did not complete — possible deadlock"

    @pytest.mark.timeout(10)
    def test_no_deadlock_with_simulated_listener(self):
        """Simulate the full Task 004 path: update_job fires a listener that calls
        enrich() while a concurrent publish() calls get_jobs() — no deadlock."""
        from app.db.state_jobs import _STATE_LOCK, update_job, get_jobs
        from app.db.state_helpers import add_job_listener
        from unittest.mock import patch

        svc, _events, wall_now, _ = _make_local_service()
        set_progress_service(svc)

        listener_entered = threading.Event()
        publish_may_proceed = threading.Event()
        results: dict[str, bool] = {}

        # Register a temporary listener simulating what Task 004 will do:
        # call enrich (from inside _STATE_LOCK via update_job).
        def simulated_task004_listener(job_id, updates, snapshot=None):
            listener_entered.set()
            publish_may_proceed.wait(timeout=5.0)
            payload = {"status": "running", "progress": 0.4, "job_id": job_id}
            svc.enrich(job_id, payload)

        def thread_update_job():
            job_state = {"jobs": {"job-listener-d7": {"id": "job-listener-d7", "status": "preparing", "progress": 0.0}}}
            # Use mocked state so update_job has a job to find.
            with patch("app.db.state_jobs._load_state_no_lock", return_value=job_state), \
                 patch("app.db.state_jobs._atomic_write_text"), \
                 patch("app.db.state_jobs.prune_completed_jobs"):
                update_job("job-listener-d7", status="running", progress=0.4)
            results["update_job"] = True

        def thread_publish():
            listener_entered.wait(timeout=5.0)
            publish_may_proceed.set()
            svc.publish(
                job_id="job-publish-d7",
                status="running",
                progress=0.3,
                eta_seconds=15,
            )
            results["publish"] = True

        # Register the listener temporarily.
        from app.db.state_helpers import _JOB_LISTENERS
        _JOB_LISTENERS.append(simulated_task004_listener)
        try:
            t_update = threading.Thread(target=thread_update_job, name="d7-update", daemon=True)
            t_pub = threading.Thread(target=thread_publish, name="d7-publish", daemon=True)
            t_update.start()
            t_pub.start()
            t_update.join(timeout=8.0)
            t_pub.join(timeout=8.0)
        finally:
            try:
                _JOB_LISTENERS.remove(simulated_task004_listener)
            except ValueError:
                pass

        assert results.get("update_job") is True, "update_job thread did not complete — possible deadlock"
        assert results.get("publish") is True, "publish thread did not complete — possible deadlock"


# ---------------------------------------------------------------------------
# Cross-job isolation
# ---------------------------------------------------------------------------

class TestCrossJobIsolation:
    """Two threads publish for two DIFFERENT job_ids through ONE singleton.
    Each job's monotonic floor and ETA ring must be independent (no bleed).

    R1 revert-check: without fine-grained locking, concurrent dict mutations
    could corrupt the per-job dicts, causing assertions about independent state
    to fail (KeyError, wrong floor value, wrong ring cv).
    """

    @pytest.mark.timeout(10)
    def test_concurrent_publish_different_jobs_independent_state(self):
        svc, _events, wall_now, monotonic_now = _make_local_service()
        set_progress_service(svc)

        errors: list[str] = []
        barrier = threading.Barrier(2)

        def publish_job_a():
            barrier.wait()
            for i in range(5):
                svc.publish(
                    job_id="job-a",
                    status="running",
                    progress=0.1 * (i + 1),
                    eta_seconds=50 - i * 5,
                )

        def publish_job_b():
            barrier.wait()
            for i in range(5):
                svc.publish(
                    job_id="job-b",
                    status="running",
                    progress=0.2 * (i + 1),
                    eta_seconds=80 - i * 8,
                )

        t_a = threading.Thread(target=publish_job_a, name="cross-a", daemon=True)
        t_b = threading.Thread(target=publish_job_b, name="cross-b", daemon=True)
        t_a.start()
        t_b.start()
        t_a.join(timeout=8.0)
        t_b.join(timeout=8.0)

        # After concurrent publishes, the two jobs' progress floors must be independent.
        floor_a = svc._last_progress_by_job.get("job-a")
        floor_b = svc._last_progress_by_job.get("job-b")

        # job-a emitted up to progress=0.5 (5×0.1), job-b up to 1.0 clamped.
        # The exact value depends on throttling, but they must not be equal
        # (job-b advances faster) and must not have bled into each other.
        if floor_a is not None and floor_b is not None:
            assert floor_a != floor_b, (
                f"Cross-job bleed: job-a floor={floor_a} == job-b floor={floor_b}"
            )
        # Neither ring should contain the other job's samples.
        ring_a = svc._eta_rings.get("job-a")
        ring_b = svc._eta_rings.get("job-b")
        if ring_a is not None and ring_b is not None:
            assert ring_a is not ring_b, "Same ETA ring object shared between jobs (bleed)"

    @pytest.mark.timeout(10)
    def test_monotonic_floor_independent_per_job(self):
        """High-progress publish on job-X must not advance the floor of job-Y."""
        svc, _events, wall_now, _ = _make_local_service()

        # Seed job-A with a high floor.
        svc.publish(job_id="job-x", status="running", progress=0.9, eta_seconds=5)
        # job-Y starts fresh.
        svc.publish(job_id="job-y", status="running", progress=0.1, eta_seconds=50)

        assert svc._last_progress_by_job["job-x"] == 0.9
        assert svc._last_progress_by_job["job-y"] == 0.1, (
            "job-y floor was contaminated by job-x's progress"
        )

        # job-Y should not be clamped to job-X's floor.
        result = svc.publish(job_id="job-y", status="running", progress=0.2, eta_seconds=45)
        assert result is not None
        assert result["progress"] == 0.2, (
            f"job-y progress {result['progress']} was clamped to job-x floor {svc._last_progress_by_job['job-x']}"
        )


# ---------------------------------------------------------------------------
# Resolver identity
# ---------------------------------------------------------------------------

class TestResolverIdentity:
    """get_progress_service() and the orchestrator's resolved service are the
    same object after singleton installation.

    R1 revert-check: before this task, create_orchestrator() called
    create_progress_service() (creates a NEW instance each time _GLOBAL_ORCHESTRATOR
    is None), so the orchestrator owned a different instance than the one returned
    by get_progress_service().  After the fix, both resolve to the same object.
    """

    def test_get_progress_service_returns_same_object_across_calls(self):
        """get_progress_service() is idempotent — same object every call."""
        svc1 = get_progress_service()
        svc2 = get_progress_service()
        assert svc1 is svc2

    def test_set_and_get_roundtrip(self):
        """set_progress_service + get_progress_service returns the installed instance."""
        custom = create_progress_service()
        set_progress_service(custom)
        assert get_progress_service() is custom

    def test_orchestrator_uses_singleton(self):
        """The orchestrator resolves the same ProgressService singleton."""
        import app.orchestration.scheduler.orchestrator as orch_mod

        # Reset orchestrator singleton so it re-resolves the PS.
        prev = orch_mod._GLOBAL_ORCHESTRATOR
        orch_mod._GLOBAL_ORCHESTRATOR = None
        try:
            expected_svc = get_progress_service()
            orchestrator = orch_mod.create_orchestrator()
            assert orchestrator.progress_service is expected_svc, (
                "Orchestrator's progress_service is a different instance than get_progress_service()"
            )
        finally:
            orch_mod._GLOBAL_ORCHESTRATOR = prev

    def test_reset_progress_service_clears_singleton(self):
        """reset_progress_service() causes a fresh lazy instance on next call."""
        first = get_progress_service()
        reset_progress_service()
        second = get_progress_service()
        # After reset, the lazy path creates a NEW instance.
        assert second is not first

    def test_local_instances_not_affected_by_singleton(self):
        """Local ProgressService(...) instances constructed directly never
        route through or pollute the singleton."""
        local_svc, _, _, _ = _make_local_service()
        singleton = get_progress_service()
        assert local_svc is not singleton
        # Publishing to local_svc must not touch the singleton's state.
        local_svc.publish(job_id="local-only", status="running", progress=0.5)
        assert "local-only" not in singleton._last_progress_by_job
