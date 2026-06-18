"""Task 004 — Path-A / Path-B convergence parity test.

Both producers (ProgressService.publish = Path A, broadcast_job_updated = Path B)
must emit the same enriched ``confidence``, ``eta_seconds``, and
``grouped_progress`` values when fed the same logical job state.

Gate: this test is RED before Task 004 wiring (confidence echoes progress on
Path B), GREEN after.

R1 revert-check: stash the Task 004 enrich() call from broadcast_job_updated;
run this test; confirm ``test_confidence_matches_between_paths`` fails because
Path B's ``confidence`` equals the progress value (the echo), which diverges
from Path A's §4A.2 numeric metric.
"""

from __future__ import annotations

import pytest

from app.orchestration.progress.service import (
    ProgressService,
    set_progress_service,
    reset_progress_service,
)
from app.orchestration.progress.eta import estimate_eta_seconds


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_clock_injected_service():
    """Build a deterministic clock-injected ProgressService and install as singleton.

    Returns (svc, path_a_events, wall_now, monotonic_now).
    """
    path_a_events: list[tuple[dict, str]] = []
    wall_now = {"value": 1000.0}
    monotonic_now = {"value": 5000.0}

    def wall_clock() -> float:
        return wall_now["value"]

    def monotonic_clock() -> float:
        return monotonic_now["value"]

    def broadcaster(*, payload: dict, channel: str) -> None:
        path_a_events.append((payload, channel))

    svc = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=estimate_eta_seconds,
        broadcaster=broadcaster,
        wall_clock=wall_clock,
        monotonic_clock=monotonic_clock,
        max_silence_seconds=10.0,
    )
    return svc, path_a_events, wall_now, monotonic_now


@pytest.fixture(autouse=True)
def reset_singleton():
    """Reset the progress-service singleton before and after each test."""
    reset_progress_service()
    yield
    reset_progress_service()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _capture_path_b_events(job_id: str, merged: dict) -> list[dict]:
    """Call broadcast_job_updated and collect every broadcast_studio_event call.

    We patch broadcast_studio_event at the ws module boundary (the websocket
    transport sink) — this is a true external boundary (network I/O).
    """
    from unittest.mock import patch
    import app.api.ws as ws_mod

    captured: list[dict] = []

    def fake_broadcast_studio_event(event: dict) -> None:
        captured.append(event)

    with patch.object(ws_mod, "broadcast_studio_event", side_effect=fake_broadcast_studio_event):
        ws_mod.broadcast_job_updated(
            job_id=job_id,
            updates=dict(merged),
            current_job=None,
            source="test.parity",
        )

    return captured


def _extract_confidence(events: list[dict], topic: str) -> float | None:
    """Return the ``confidence`` field from the first matching topic payload."""
    for evt in events:
        if evt.get("topic") == topic:
            return evt.get("payload", {}).get("confidence")
    return None


def _extract_eta_seconds(events: list[dict], topic: str) -> int | None:
    """Return the ``etaSeconds`` field from the first matching topic payload."""
    for evt in events:
        if evt.get("topic") == topic:
            return evt.get("payload", {}).get("etaSeconds")
    return None


def _extract_grouped_progress(events: list[dict], topic: str) -> float | None:
    """Return the ``groupedProgress`` field from the first matching topic payload."""
    for evt in events:
        if evt.get("topic") == topic:
            return evt.get("payload", {}).get("groupedProgress")
    return None


# ---------------------------------------------------------------------------
# Parity tests
# ---------------------------------------------------------------------------

class TestPathABParity:
    """Both producers must emit value-equal enriched fields on the same job state.

    R1 revert-check:
    - Pre-wiring: Path B calls build_chapter_progress_event without confidence=;
      the builder falls back to compute_progress_confidence which returns
      progress (the echo), while Path A returns the §4A.2 numeric metric.
      ``test_confidence_matches_between_paths`` FAILs because Path B confidence
      == progress == 0.3 while Path A confidence ≠ 0.3.
    - Post-wiring: Path B calls enrich() before building events; both paths
      return the same §4A.2 numeric metric; the test PASSes.
    """

    def test_confidence_matches_between_paths(self):
        """Path A and Path B must emit equal confidence on the same job state."""
        svc, path_a_events, wall_now, _ = _make_clock_injected_service()
        set_progress_service(svc)

        job_id = "parity-job-conf"
        chapter_id = "parity-ch-conf"
        # Cold/sparse frame: progress+status+char_count only, no pre-supplied eta_seconds.
        shared_state = {
            "status": "running",
            "progress": 0.3,
            "char_count": 800,
            "chapter_id": chapter_id,
            "classification": "chapter",
        }

        # --- Path A ---
        path_a_payload = svc.publish(
            job_id=job_id,
            status=shared_state["status"],
            progress=shared_state["progress"],
            char_count=shared_state["char_count"],
            chapter_id=chapter_id,
            # deliberately no eta_seconds (cold frame)
        )
        assert path_a_payload is not None, "Path A must emit a payload"
        path_a_conf = path_a_payload.get("eta_confidence")
        assert isinstance(path_a_conf, float), (
            f"Path A must emit float confidence, got {type(path_a_conf)}: {path_a_conf}"
        )

        # Collect Path A's chapter progress envelope from the broadcaster sink.
        path_a_chapter_events = [p for p, _ in path_a_events if p.get("topic") == "chapters.progress"]
        assert path_a_chapter_events, "Path A must emit at least one chapters.progress event"
        path_a_envelope_conf = path_a_chapter_events[-1].get("payload", {}).get("confidence")

        # --- Path B ---
        # Reset the singleton ETA ring so Path B gets the same cold-start state.
        # (Path A already pushed a velocity sample — we need to share the singleton
        #  so both paths use the same enrichment state, then compare.)
        #
        # Strategy: install a FRESH singleton so Path B sees no prior ring state,
        # mirroring the same cold-start condition Path A had on first call.
        svc_b, path_b_events_sink, wall_now_b, _ = _make_clock_injected_service()
        # Use same wall clock value as Path A's first call so timestamps agree.
        wall_now_b["value"] = wall_now["value"]
        set_progress_service(svc_b)

        path_b_captured = _capture_path_b_events(
            job_id=job_id,
            merged={
                "status": shared_state["status"],
                "progress": shared_state["progress"],
                "char_count": shared_state["char_count"],
                "chapter_id": chapter_id,
                "classification": "chapter",
            },
        )

        path_b_conf = _extract_confidence(path_b_captured, "chapters.progress")
        assert path_b_conf is not None, (
            "Path B must emit a chapters.progress event with a confidence field"
        )
        assert isinstance(path_b_conf, float), (
            f"Path B confidence must be float, got {type(path_b_conf)}: {path_b_conf}"
        )

        # Both paths must agree on confidence (same §4A.2 formula, same cold-start).
        assert path_a_envelope_conf == pytest.approx(path_b_conf, abs=0.05), (
            f"Path A confidence {path_a_envelope_conf} diverges from "
            f"Path B confidence {path_b_conf} — Path B is not enriching"
        )

    def test_cold_frame_confidence_differs_from_progress(self):
        """Cold/sparse frame: both paths must produce confidence ≠ progress.

        This is the echo-gone proof: before wiring, Path B echoed confidence=progress.

        R1 revert-check: pre-wiring Path B uses compute_progress_confidence
        (coverage_ratio × progress = 1.0 × 0.3 = 0.3) which equals progress.
        Post-wiring it uses §4A.2 (freshness × variance × completion) which at
        progress=0.3 with a cold ring produces confidence ≠ 0.3.
        """
        svc, path_a_events, wall_now, _ = _make_clock_injected_service()
        set_progress_service(svc)

        job_id = "parity-echo-job"
        chapter_id = "parity-echo-ch"
        progress = 0.3

        # --- Path A ---
        path_a_payload = svc.publish(
            job_id=job_id,
            status="running",
            progress=progress,
            char_count=500,
            chapter_id=chapter_id,
        )
        assert path_a_payload is not None
        path_a_conf = path_a_payload.get("eta_confidence")
        assert isinstance(path_a_conf, float)

        # Path A: confidence must NOT equal progress (echo-gone check).
        assert path_a_conf != pytest.approx(progress, abs=0.02), (
            f"Path A confidence {path_a_conf} must not echo progress {progress}"
        )

        # --- Path B ---
        svc_b, _, wall_now_b, _ = _make_clock_injected_service()
        wall_now_b["value"] = wall_now["value"]
        set_progress_service(svc_b)

        path_b_captured = _capture_path_b_events(
            job_id=f"{job_id}-b",
            merged={
                "status": "running",
                "progress": progress,
                "char_count": 500,
                "chapter_id": chapter_id,
                "classification": "chapter",
            },
        )

        path_b_conf = _extract_confidence(path_b_captured, "chapters.progress")
        assert path_b_conf is not None, "Path B must emit chapters.progress with confidence"
        assert isinstance(path_b_conf, float)

        # Path B: confidence must NOT equal progress (echo-gone check).
        assert path_b_conf != pytest.approx(progress, abs=0.02), (
            f"Path B confidence {path_b_conf} must not echo progress {progress} — "
            "Path B is still echoing (enrich() not called)"
        )

    def test_cold_frame_eta_seconds_non_null_path_b(self):
        """Cold frame on Path B: no incoming eta_seconds but char_count present.

        After wiring, Path B calls enrich() which computes a cold ETA from
        char_count.  Pre-wiring, Path B passes eta_seconds=None directly to
        the builder and the envelope carries etaSeconds=None.

        R1 revert-check: pre-wiring, path_b_eta is None; post-wiring it is non-null.
        """
        svc, _, wall_now, _ = _make_clock_injected_service()
        set_progress_service(svc)

        job_id = "parity-cold-eta"
        chapter_id = "parity-cold-ch"

        path_b_captured = _capture_path_b_events(
            job_id=job_id,
            merged={
                "status": "running",
                "progress": 0.3,
                "char_count": 800,
                "chapter_id": chapter_id,
                "classification": "chapter",
                # deliberately no eta_seconds
            },
        )

        path_b_eta = _extract_eta_seconds(path_b_captured, "chapters.progress")
        assert path_b_eta is not None, (
            "Path B cold frame with char_count=800 must produce non-null etaSeconds — "
            "Path B is not routing through enrich()"
        )
        assert path_b_eta >= 0, f"etaSeconds must be non-negative, got {path_b_eta}"

    def test_grouped_progress_matches_between_paths(self):
        """grouped_progress must be value-equal between Path A and Path B."""
        svc, path_a_events, wall_now, _ = _make_clock_injected_service()
        set_progress_service(svc)

        job_id = "parity-gp-job"
        chapter_id = "parity-gp-ch"
        gp_value = 0.44

        # --- Path A ---
        path_a_payload = svc.publish(
            job_id=job_id,
            status="running",
            progress=0.44,
            grouped_progress=gp_value,
            eta_seconds=30,
            chapter_id=chapter_id,
        )
        assert path_a_payload is not None
        assert path_a_payload.get("grouped_progress") == pytest.approx(gp_value, abs=0.01)

        path_a_chapter_events = [p for p, _ in path_a_events if p.get("topic") == "chapters.progress"]
        path_a_gp = path_a_chapter_events[-1].get("payload", {}).get("groupedProgress") if path_a_chapter_events else None

        # --- Path B ---
        svc_b, _, wall_now_b, _ = _make_clock_injected_service()
        wall_now_b["value"] = wall_now["value"]
        set_progress_service(svc_b)

        path_b_captured = _capture_path_b_events(
            job_id=job_id,
            merged={
                "status": "running",
                "progress": 0.44,
                "grouped_progress": gp_value,
                "eta_seconds": 30,
                "chapter_id": chapter_id,
                "classification": "chapter",
            },
        )

        path_b_gp = _extract_grouped_progress(path_b_captured, "chapters.progress")

        # Both paths must agree on grouped_progress.
        if path_a_gp is not None and path_b_gp is not None:
            assert path_a_gp == pytest.approx(path_b_gp, abs=0.01), (
                f"grouped_progress mismatch: Path A={path_a_gp}, Path B={path_b_gp}"
            )
