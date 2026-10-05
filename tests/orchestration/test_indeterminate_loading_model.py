"""Tests for the LOADING_MODEL indeterminate progress frame (Task 009).

Covers:
  - A preparing/model-load publish emits indeterminate=True + reason_code="LOADING_MODEL"
    and NO determinate ETA.
  - The first real-progress (running) frame clears indeterminate
    (flag absent/False, determinate progress present).

Mock boundary (R2): monotonic_clock and wall_clock (external time), broadcaster
(external I/O sink).  We do NOT mock ProgressService internals.
"""

from __future__ import annotations

import pytest

from app.orchestration.progress.service import ProgressService
from app.orchestration.progress.eta import estimate_eta_seconds
from app.api.contracts.events import (
    build_chapter_progress_event,
    build_queue_item_status_event,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_service():
    events: list[tuple[dict, str]] = []
    wall_now = {"value": 100.0}
    monotonic_now = {"value": 500.0}

    def wall_clock():
        return wall_now["value"]

    def monotonic_clock():
        return monotonic_now["value"]

    def broadcaster(*, payload, channel):
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
# Test A: preparing/model-load publish emits indeterminate=True + LOADING_MODEL
# ---------------------------------------------------------------------------

class TestLoadingModelFrame:
    """Publishing with status='preparing' + reason_code='LOADING_MODEL' + indeterminate=True
    must produce the correct frame shape.

    R1 revert-check: before this feature, _build_progress_payload did not accept
    indeterminate or loading_elapsed_seconds.  The publish() call below would raise
    TypeError.  After the feature, the emitted payload carries indeterminate=True
    and the chapters.progress event carries indeterminate=True in its payload.
    """

    def test_preparing_loading_model_emits_indeterminate_true(self):
        """publish() with indeterminate=True emits payload with indeterminate=True."""
        svc, events, _, _ = _make_service()
        emitted = svc.publish(
            job_id="job-loading-1",
            status="preparing",
            progress=0.0,
            message="Loading voice model…",
            reason_code="LOADING_MODEL",
            indeterminate=True,
            chapter_id="ch-1",
            parent_job_id="proj-1",
        )
        assert emitted is not None
        assert emitted.get("indeterminate") is True, (
            f"Expected indeterminate=True in internal payload, got {emitted.get('indeterminate')!r}"
        )

    def test_preparing_loading_model_no_determinate_eta(self):
        """LOADING_MODEL frame must NOT carry a determinate ETA (no model_load_seconds).

        The task spec explicitly forbids fabricating a determinate ETA during
        model load; engine_activity_started_at is used for elapsed-only, not ETA.
        """
        svc, events, _, _ = _make_service()
        emitted = svc.publish(
            job_id="job-loading-2",
            status="preparing",
            progress=0.0,
            message="Loading voice model…",
            reason_code="LOADING_MODEL",
            indeterminate=True,
            # Deliberately no eta_seconds — no fabricated ETA
            chapter_id="ch-2",
            parent_job_id="proj-2",
        )
        assert emitted is not None
        # eta_seconds must be None — no fabricated ETA
        assert emitted.get("eta_seconds") is None, (
            f"LOADING_MODEL frame must not carry a determinate ETA, got {emitted.get('eta_seconds')!r}"
        )

    def test_preparing_loading_model_reason_code_preserved(self):
        """reason_code='LOADING_MODEL' must appear in the internal payload."""
        svc, events, _, _ = _make_service()
        emitted = svc.publish(
            job_id="job-loading-3",
            status="preparing",
            progress=0.0,
            reason_code="LOADING_MODEL",
            indeterminate=True,
            chapter_id="ch-3",
        )
        assert emitted is not None
        assert emitted.get("reason_code") == "LOADING_MODEL", (
            f"reason_code must be 'LOADING_MODEL', got {emitted.get('reason_code')!r}"
        )

    def test_preparing_loading_model_broadcasts_chapter_progress_indeterminate(self):
        """LOADING_MODEL publish must broadcast a chapters.progress event with indeterminate=True."""
        svc, events, _, _ = _make_service()
        svc.publish(
            job_id="job-loading-4",
            status="preparing",
            progress=0.0,
            reason_code="LOADING_MODEL",
            indeterminate=True,
            chapter_id="ch-4",
            parent_job_id="proj-4",
        )
        chap_frames = [p for p, _ in events if p.get("topic") == "chapters.progress"]
        assert chap_frames, "Expected at least one chapters.progress event"
        chap_payload = chap_frames[-1].get("payload", {})
        assert chap_payload.get("indeterminate") is True, (
            f"chapters.progress payload must carry indeterminate=True, got {chap_payload!r}"
        )

    def test_preparing_loading_model_broadcasts_queue_item_indeterminate(self):
        """LOADING_MODEL publish must broadcast a queue.items event with indeterminate=True."""
        svc, events, _, _ = _make_service()
        svc.publish(
            job_id="job-loading-5",
            status="preparing",
            progress=0.0,
            reason_code="LOADING_MODEL",
            indeterminate=True,
            chapter_id="ch-5",
            parent_job_id="proj-5",
        )
        queue_frames = [p for p, _ in events if p.get("topic") == "queue.items"]
        assert queue_frames, "Expected at least one queue.items event"
        queue_payload = queue_frames[-1].get("payload", {})
        assert queue_payload.get("indeterminate") is True, (
            f"queue.items payload must carry indeterminate=True, got {queue_payload!r}"
        )

    def test_loading_elapsed_seconds_threaded_through(self):
        """loading_elapsed_seconds must appear in chapter progress payload when provided."""
        svc, events, _, _ = _make_service()
        svc.publish(
            job_id="job-loading-6",
            status="preparing",
            progress=0.0,
            reason_code="LOADING_MODEL",
            indeterminate=True,
            loading_elapsed_seconds=8.5,
            chapter_id="ch-6",
            parent_job_id="proj-6",
        )
        chap_frames = [p for p, _ in events if p.get("topic") == "chapters.progress"]
        assert chap_frames
        chap_payload = chap_frames[-1].get("payload", {})
        assert chap_payload.get("loadingElapsedSeconds") == pytest.approx(8.5, abs=0.01), (
            f"Expected loadingElapsedSeconds≈8.5, got {chap_payload.get('loadingElapsedSeconds')!r}"
        )


# ---------------------------------------------------------------------------
# Test B: first real-progress frame clears indeterminate
# ---------------------------------------------------------------------------

class TestLoadingModelClears:
    """After LOADING_MODEL, the first running frame must have no indeterminate flag.

    R1 revert-check: before this feature, the running frame never had indeterminate
    in the first place (neither True nor False).  The test that checks the LOADING_MODEL
    frame has indeterminate=True would fail pre-feature.  This complementary test
    verifies that the running frame after model load does NOT carry indeterminate=True.
    """

    def test_first_running_frame_no_indeterminate(self):
        """After LOADING_MODEL, a running-status publish must NOT carry indeterminate=True."""
        svc, events, wall_now, monotonic_now = _make_service()

        # Frame 1: preparing/model-load
        svc.publish(
            job_id="job-clears-1",
            status="preparing",
            progress=0.0,
            reason_code="LOADING_MODEL",
            indeterminate=True,
            chapter_id="ch-c1",
            parent_job_id="proj-c1",
        )

        # Frame 2: real progress starts
        wall_now["value"] += 36.0  # simulated 36s model load
        monotonic_now["value"] += 36.0
        emitted = svc.publish(
            job_id="job-clears-1",
            status="running",
            progress=0.05,
            eta_seconds=120,
            started_at=136.0,
            chapter_id="ch-c1",
            parent_job_id="proj-c1",
        )
        assert emitted is not None
        # indeterminate must be absent or falsy in the running frame
        indeterminate = emitted.get("indeterminate")
        assert not indeterminate, (
            f"Running frame after model-load must NOT have indeterminate=True, got {indeterminate!r}"
        )

    def test_first_running_frame_has_determinate_progress(self):
        """The first running frame must carry a real (>0) determinate progress."""
        svc, events, wall_now, monotonic_now = _make_service()

        # Frame 1: preparing
        svc.publish(
            job_id="job-clears-2",
            status="preparing",
            progress=0.0,
            reason_code="LOADING_MODEL",
            indeterminate=True,
            chapter_id="ch-c2",
        )

        # Frame 2: first real synthesis progress
        wall_now["value"] += 36.0
        monotonic_now["value"] += 36.0
        emitted = svc.publish(
            job_id="job-clears-2",
            status="running",
            progress=0.07,
            eta_seconds=100,
            started_at=136.0,
            chapter_id="ch-c2",
        )
        assert emitted is not None
        progress = emitted.get("progress")
        assert isinstance(progress, float) and progress > 0.0, (
            f"First running frame must have determinate progress > 0, got {progress!r}"
        )

    def test_chapter_progress_running_frame_no_indeterminate(self):
        """chapters.progress running event must not carry indeterminate=True after model load."""
        svc, events, wall_now, monotonic_now = _make_service()

        svc.publish(
            job_id="job-clears-3",
            status="preparing",
            progress=0.0,
            reason_code="LOADING_MODEL",
            indeterminate=True,
            chapter_id="ch-c3",
            parent_job_id="proj-c3",
        )
        events.clear()  # only interested in the running-frame events

        wall_now["value"] += 36.0
        monotonic_now["value"] += 36.0
        svc.publish(
            job_id="job-clears-3",
            status="running",
            progress=0.1,
            eta_seconds=90,
            started_at=136.0,
            chapter_id="ch-c3",
            parent_job_id="proj-c3",
        )
        chap_frames = [p for p, _ in events if p.get("topic") == "chapters.progress"]
        assert chap_frames, "Expected chapters.progress event for running frame"
        chap_payload = chap_frames[-1].get("payload", {})
        indeterminate = chap_payload.get("indeterminate")
        assert not indeterminate, (
            f"chapters.progress running frame must NOT carry indeterminate=True, got {indeterminate!r}"
        )


# ---------------------------------------------------------------------------
# Test C: build_chapter_progress_event and build_queue_item_status_event contracts
# ---------------------------------------------------------------------------

class TestEventBuilderContracts:
    """Direct tests for the indeterminate fields on event builder functions."""

    def test_build_chapter_progress_event_carries_indeterminate(self):
        """build_chapter_progress_event must include indeterminate=True when passed."""
        event = build_chapter_progress_event(
            chapter_id="ch-builder-1",
            status="preparing",
            progress=0.0,
            reason_code="LOADING_MODEL",
            indeterminate=True,
            loading_elapsed_seconds=12.3,
            confidence=0.0,
        )
        payload = event.get("payload", {})
        assert payload.get("indeterminate") is True
        assert payload.get("loadingElapsedSeconds") == pytest.approx(12.3, abs=0.01)

    def test_build_chapter_progress_event_no_indeterminate_when_absent(self):
        """build_chapter_progress_event must not include indeterminate when not passed."""
        event = build_chapter_progress_event(
            chapter_id="ch-builder-2",
            status="running",
            progress=0.3,
            confidence=0.5,
        )
        payload = event.get("payload", {})
        assert "indeterminate" not in payload

    def test_build_queue_item_status_event_carries_indeterminate(self):
        """build_queue_item_status_event must include indeterminate=True when passed."""
        event = build_queue_item_status_event(
            job_id="job-q-1",
            status="preparing",
            progress=0.0,
            reason_code="LOADING_MODEL",
            indeterminate=True,
            loading_elapsed_seconds=5.0,
            confidence=0.0,
        )
        payload = event.get("payload", {})
        assert payload.get("indeterminate") is True
        assert payload.get("loadingElapsedSeconds") == pytest.approx(5.0, abs=0.01)

    def test_build_queue_item_status_event_no_indeterminate_running(self):
        """build_queue_item_status_event must not include indeterminate for running frames."""
        event = build_queue_item_status_event(
            job_id="job-q-2",
            status="running",
            progress=0.2,
            confidence=0.5,
        )
        payload = event.get("payload", {})
        assert "indeterminate" not in payload
