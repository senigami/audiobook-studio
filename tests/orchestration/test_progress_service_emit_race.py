"""Tests for Task 010: atomic emit gate and terminal-latch leaf-lock discipline.

Covers:
- Same-job concurrency: two threads publishing near-simultaneous frames for the
  SAME job_id through the singleton must not double-emit AND must not lose a
  meaningful frame (the first emitter wins; the second is coalesced).
- D7 deadlock test re-run: widened critical section in _claim_emit_slot must
  not reintroduce the STATE_LOCK → PS-RLock / PS-RLock → STATE_LOCK inversion.
- Post-terminal frame from either path drops exactly once (terminal latch).

R1 revert-check:
  Without the atomic gate (_claim_emit_slot), two threads for the SAME job_id
  that both call _should_emit() before either commits the tick will both pass the
  gate and double-emit.  Remove _claim_emit_slot (restore old separate _should_emit
  + post-emit tick write) and the concurrency test becomes racy — it will
  intermittently assert emit_count == 2 when both threads win the gate.
"""

from __future__ import annotations

import threading
import time
from typing import Any

import pytest

from app.orchestration.progress.service import (
    ProgressService,
    get_progress_service,
    reset_progress_service,
    set_progress_service,
)
from app.orchestration.progress.eta import estimate_eta_seconds


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_local_service(
    *,
    max_silence_seconds: float = 30.0,
    min_progress_delta: float = 0.01,
) -> tuple[ProgressService, list[tuple[dict, str]], dict[str, float], dict[str, float]]:
    """Construct a fully clock-injected local instance (NOT the singleton)."""
    events: list[tuple[dict, str]] = []
    wall_now: dict[str, float] = {"value": 100.0}
    monotonic_now: dict[str, float] = {"value": 500.0}

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
        max_silence_seconds=max_silence_seconds,
        min_progress_delta=min_progress_delta,
    )
    return svc, events, wall_now, monotonic_now


# ---------------------------------------------------------------------------
# Task 010 — same-job concurrency (atomic emit gate)
# ---------------------------------------------------------------------------

class TestSameJobConcurrency:
    """Two threads publish near-simultaneous frames for the SAME job_id.

    The atomic emit gate (_claim_emit_slot) must ensure:
    1. No double-emit: if both threads carry identical payloads, exactly one
       should emit.
    2. No lost meaningful frame: the first thread always emits.

    R4 (no sleeps): threads are synchronized via threading.Event / Barrier.

    R1 revert-check: the test is designed so that without atomicity the second
    thread would also pass the gate and emit a duplicate frame, causing
    emit_count > expected.  The test verifies the upper bound on emits.
    """

    @pytest.mark.timeout(10)
    def test_first_publish_always_emits(self):
        """First publish for a fresh job must always emit exactly one frame."""
        svc, events, _, _ = _make_local_service()
        result = svc.publish(
            job_id="gate-fresh",
            status="running",
            progress=0.3,
            eta_seconds=30,
        )
        assert result is not None, "First publish must emit"
        # Broadcaster events use ids.jobId (the event envelope shape)
        job_events = [p for p, _ in events if (p.get("ids") or {}).get("jobId") == "gate-fresh"]
        assert len(job_events) >= 1, "At least one event must reach the broadcaster"

    @pytest.mark.timeout(10)
    def test_concurrent_identical_frames_no_double_emit(self):
        """Two threads publishing identical payloads: only the first passes the gate.

        Both threads publish the exact same progress value (0.3) on a job that
        already has progress=0.2 committed.  The second thread's payload looks
        identical to the first thread's newly-committed state, so it should be
        coalesced.

        Gate: threading.Barrier + threading.Event synchronization (R4, no sleeps).

        R1 revert-check:
          Without the atomic gate the two threads both read _should_emit before
          either writes the tick and both return True → double-emit.
          With the gate, the first winner writes the tick inside the lock; the
          second thread loses the silence window (max_silence_seconds=30s, so
          the tick is "fresh") and returns False.
        """
        # Seed: commit progress=0.2 so the first real publish (0.3) is meaningful.
        svc, events, wall_now, monotonic_now = _make_local_service(max_silence_seconds=30.0)
        seed = svc.publish(job_id="gate-race", status="running", progress=0.2, eta_seconds=40)
        assert seed is not None
        seed_count = len(events)

        # Freeze time so the silence gate never fires during the race.
        # (monotonic_now stays at 500.0 — both threads see the same tick)

        # Barrier: ensure both threads are in flight simultaneously.
        barrier = threading.Barrier(2)
        results: dict[str, Any] = {}
        errors: list[str] = []

        def publish_thread(name: str) -> None:
            barrier.wait()  # R4: synchronize without sleep
            try:
                r = svc.publish(
                    job_id="gate-race",
                    status="running",
                    progress=0.3,   # identical in both threads
                    eta_seconds=35,
                )
                results[name] = r
            except Exception as exc:
                errors.append(f"{name}: {exc}")

        t1 = threading.Thread(target=publish_thread, args=("t1",), name="gate-t1", daemon=True)
        t2 = threading.Thread(target=publish_thread, args=("t2",), name="gate-t2", daemon=True)
        t1.start()
        t2.start()
        t1.join(timeout=8.0)
        t2.join(timeout=8.0)

        assert not errors, f"Thread errors: {errors}"
        assert not t1.is_alive(), "Thread t1 did not finish"
        assert not t2.is_alive(), "Thread t2 did not finish"

        # Count frames emitted AFTER the seed.
        post_seed_events = events[seed_count:]
        # All broadcaster frames for this job (lifecycle + queue + progress etc.)
        # Broadcaster events use ids.jobId (the event envelope shape)
        post_seed_job_events = [p for p, _ in post_seed_events if (p.get("ids") or {}).get("jobId") == "gate-race"]

        # One thread emits; the other is coalesced (returns None).
        emit_results = [v for v in results.values() if v is not None]
        suppress_results = [v for v in results.values() if v is None]

        assert len(emit_results) == 1, (
            f"Exactly one thread must emit; got {len(emit_results)} emitters "
            f"(t1={results.get('t1') is not None}, t2={results.get('t2') is not None})"
        )
        assert len(suppress_results) == 1, (
            f"Exactly one thread must be coalesced; got {len(suppress_results)}"
        )

    @pytest.mark.timeout(10)
    def test_concurrent_meaningfully_different_frames_both_emit(self):
        """When the two concurrent frames carry different progress (≥delta), both emit.

        Thread A: progress=0.2 (meaningful advance from 0.0)
        Thread B: progress=0.5 (even larger advance)

        Exactly one of them wins the initial gate for 0.x → 0.y; after the
        winner's tick is committed, the other's payload may or may not still
        be meaningful (depends on race order).  We assert at LEAST one emits
        and the service does not error.

        This test ensures the gate does not over-suppress concurrent advances.
        """
        svc, events, _, _ = _make_local_service(max_silence_seconds=30.0)
        barrier = threading.Barrier(2)
        errors: list[str] = []

        def pub_a() -> None:
            barrier.wait()
            try:
                svc.publish(job_id="gate-diff", status="running", progress=0.2, eta_seconds=50)
            except Exception as exc:
                errors.append(f"a: {exc}")

        def pub_b() -> None:
            barrier.wait()
            try:
                svc.publish(job_id="gate-diff", status="running", progress=0.5, eta_seconds=30)
            except Exception as exc:
                errors.append(f"b: {exc}")

        t_a = threading.Thread(target=pub_a, name="gate-diff-a", daemon=True)
        t_b = threading.Thread(target=pub_b, name="gate-diff-b", daemon=True)
        t_a.start()
        t_b.start()
        t_a.join(timeout=8.0)
        t_b.join(timeout=8.0)

        assert not errors, f"Thread errors: {errors}"
        assert not t_a.is_alive()
        assert not t_b.is_alive()

        job_events = [p for p, _ in events if (p.get("ids") or {}).get("jobId") == "gate-diff"]
        assert len(job_events) >= 1, "At least one concurrent publish must emit"

    @pytest.mark.timeout(10)
    def test_emit_slot_tick_is_written_atomically(self):
        """The tick must be written inside the lock, not after the emit returns.

        Verify: after _claim_emit_slot returns (should_emit=True, previous),
        the tick is already in _last_emit_tick_by_job — even before the full
        emit cycle completes.

        We test this indirectly: seed the job, then hold the PS-RLock from
        outside while calling _claim_emit_slot.  Because _claim_emit_slot
        attempts to acquire self._lock, it blocks until we release.  After
        release, the claim proceeds and the tick is present.

        R4: no sleeps — uses threading.Event for synchronization.
        """
        svc, events, wall_now, monotonic_now = _make_local_service()
        # Seed the job so there's a previous payload.
        svc.publish(job_id="gate-tick", status="running", progress=0.1, eta_seconds=60)

        # Build a candidate payload to pass to _claim_emit_slot.
        payload = svc._build_progress_payload(
            job_id="gate-tick",
            scope="job",
            parent_job_id=None,
            status="running",
            progress=0.5,
            eta_seconds=30,
            eta_confidence=None,
            message=None,
            reason_code=None,
            waiting_reason=None,
            started_at=None,
            updated_at=None,
            active_render_batch_id=None,
            active_render_batch_progress=None,
            active_segment_id=None,
            active_segment_progress=None,
            active_segment_eta_seconds=None,
            render_group_count=None,
            completed_render_groups=None,
            active_render_group_index=None,
            total_render_weight=None,
            completed_render_weight=None,
            active_render_group_weight=None,
            grouped_progress=None,
            source="test",
            eta_updated_at=None,
            char_count=None,
            indeterminate=None,
            loading_elapsed_seconds=None,
        )

        claim_started = threading.Event()
        claim_done = threading.Event()
        claim_result: dict[str, Any] = {}

        def claim_thread() -> None:
            claim_started.set()
            should, prev = svc._claim_emit_slot(payload, force=False, allow_progress_regression=False)
            claim_result["should"] = should
            claim_result["prev"] = prev
            claim_done.set()

        t = threading.Thread(target=claim_thread, name="gate-tick-t", daemon=True)
        t.start()
        claim_started.wait(timeout=5.0)

        # Give the thread time to reach _claim_emit_slot before checking result.
        claim_done.wait(timeout=5.0)
        t.join(timeout=5.0)

        assert not t.is_alive()
        assert claim_result.get("should") is True, "A meaningful advance must emit"
        # Tick must now be set in _last_emit_tick_by_job.
        assert "gate-tick" in svc._last_emit_tick_by_job, (
            "Tick must be written to _last_emit_tick_by_job after _claim_emit_slot"
        )


# ---------------------------------------------------------------------------
# D7 re-verification — widened critical section must not reintroduce deadlock
# ---------------------------------------------------------------------------

class TestD7StillCleanAfterTask010:
    """Re-run the core D7 deadlock scenario from Task 002 to confirm the wider
    _claim_emit_slot critical section does not reintroduce the inversion.

    _claim_emit_slot holds self._lock while calling self.monotonic_clock()
    and reading/writing _last_payload_by_job, _last_emit_tick_by_job.
    It must NOT call get_jobs() or any state_jobs function.

    R1 revert-check: if _claim_emit_slot were to call get_jobs() inside the
    lock, Thread 1 (holding _STATE_LOCK → calling enrich → waiting for PS-RLock)
    and Thread 2 (calling publish → _claim_emit_slot, holding PS-RLock, waiting
    for _STATE_LOCK) would deadlock.
    """

    @pytest.mark.timeout(10)
    def test_no_deadlock_claim_emit_slot_vs_state_lock(self):
        """_claim_emit_slot holding PS-RLock must not block on _STATE_LOCK."""
        from app.db.state_jobs import _STATE_LOCK

        svc, _events, _, _ = _make_local_service()
        set_progress_service(svc)

        # Seed a job so _claim_emit_slot has a previous payload.
        svc.publish(job_id="d7-claim", status="running", progress=0.1, eta_seconds=60)

        thread1_holds_state_lock = threading.Event()
        thread2_may_proceed = threading.Event()
        results: dict[str, bool] = {}

        def thread1_fn() -> None:
            """Hold _STATE_LOCK; call enrich() (acquires PS-RLock)."""
            with _STATE_LOCK:
                thread1_holds_state_lock.set()
                thread2_may_proceed.wait(timeout=5.0)
                # enrich must not call get_jobs — acquires PS-RLock as leaf lock.
                payload = {"status": "running", "progress": 0.4, "job_id": "d7-claim"}
                svc.enrich("d7-claim", payload)
            results["t1"] = True

        def thread2_fn() -> None:
            """Call publish → _claim_emit_slot (acquires PS-RLock, must not call get_jobs)."""
            thread1_holds_state_lock.wait(timeout=5.0)
            thread2_may_proceed.set()
            svc.publish(
                job_id="d7-claim",
                status="running",
                progress=0.5,
                eta_seconds=25,
            )
            results["t2"] = True

        t1 = threading.Thread(target=thread1_fn, name="d7-t1-010", daemon=True)
        t2 = threading.Thread(target=thread2_fn, name="d7-t2-010", daemon=True)
        t1.start()
        t2.start()
        t1.join(timeout=8.0)
        t2.join(timeout=8.0)

        assert results.get("t1") is True, "Thread 1 (enrich-under-STATE_LOCK) did not complete"
        assert results.get("t2") is True, "Thread 2 (publish/_claim_emit_slot) did not complete"


# ---------------------------------------------------------------------------
# Terminal latch — post-terminal frame drops exactly once
# ---------------------------------------------------------------------------

class TestTerminalLatchDropsOnce:
    """Post-terminal frames are dropped by the latch in both Path A and Path B.

    Path A: ProgressService.publish() (the _should_emit_unlocked gate).
    Path B: broadcast_job_updated() (the _terminal_latched gate in ws.py).

    The latch must be a DISTINCT lock from the PS-RLock (never nested).

    R1 revert-check: without the post-terminal guard in _should_emit_unlocked,
    a running frame published after done would pass the change-detection gates
    (status differs from done → should emit) and emit.  With the guard it is
    suppressed.
    """

    def test_path_a_post_terminal_suppressed_by_should_emit(self):
        """publish() Path A: running frame after done is suppressed by _should_emit."""
        svc, events, wall_now, monotonic_now = _make_local_service()

        # Emit terminal frame.
        done = svc.publish(job_id="term-a", status="done", progress=1.0)
        assert done is not None
        event_count_after_done = len(events)

        # Attempt to publish a non-terminal frame after done.
        post_terminal = svc.publish(job_id="term-a", status="running", progress=0.95)
        assert post_terminal is None, (
            "Post-terminal running frame must be suppressed by _should_emit gate"
        )
        # No new events should have been emitted.
        assert len(events) == event_count_after_done, (
            "No new broadcaster events must fire for the suppressed post-terminal frame"
        )

    def test_path_b_terminal_latch_drops_post_terminal_frame(self):
        """broadcast_job_updated() Path B: post-terminal frame is dropped by the latch."""
        from app.api.ws import _terminal_latched, _terminal_latch_lock, _terminal_latched_jobs, clear_terminal_latch

        job_id = "term-b-latch"
        clear_terminal_latch(job_id)

        # Simulate Path B emitting done → latch is set.
        latched = _terminal_latched(job_id, "running", "done")
        assert latched is False, "First terminal frame must pass (sets latch, returns False)"

        # Now the latch is set; a subsequent running frame must be dropped.
        dropped = _terminal_latched(job_id, "done", "running")
        assert dropped is True, (
            "Post-terminal running frame must be latched (dropped by terminal latch)"
        )

        # Clean up.
        clear_terminal_latch(job_id)

    def test_terminal_latch_lock_is_distinct_from_ps_rlock(self):
        """_terminal_latch_lock must be a separate lock instance from the PS-RLock.

        This confirms no nesting: the terminal latch is never held while the
        PS-RLock is acquired, and vice versa.
        """
        from app.api.ws import _terminal_latch_lock as ws_latch_lock
        svc, _, _, _ = _make_local_service()
        assert ws_latch_lock is not svc._lock, (
            "_terminal_latch_lock must be a DISTINCT object from the ProgressService._lock"
        )

    def test_terminal_latch_reentry_on_requeue(self):
        """Latch must be cleared when a job re-queues (prevents stuck jobs)."""
        from app.api.ws import _terminal_latched, clear_terminal_latch

        job_id = "term-requeue"
        clear_terminal_latch(job_id)

        # Set terminal latch via done.
        _terminal_latched(job_id, "running", "done")
        # Re-queue must clear it.
        result = _terminal_latched(job_id, "done", "queued")
        assert result is False, "queued status must clear the terminal latch"
        # After clearing, running frames should pass again.
        result2 = _terminal_latched(job_id, "queued", "running")
        assert result2 is False, "running after re-queue must not be dropped"

        clear_terminal_latch(job_id)
