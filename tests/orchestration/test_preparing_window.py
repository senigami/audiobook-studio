"""Tests for the preparing-window ETA suspension fix.

During a mixed render's model-load window the SEGMENT_PENDING (announce) frame
must NOT carry a positive eta_seconds — that stale value would animate the
progress bar throughout the load window.

Frame A (SEGMENT_PENDING): must carry eta_seconds=None, clear_eta=True,
  indeterminate=True, force=True, and durable status="running" (INV-1).
Frame B (LOADING_MODEL): must carry clear_eta=True, force=True (already
  has indeterminate=True, status="preparing" from dispatch path).

Mock boundary (R2): harness patches _publish at the OrchestratorHelpersMixin
boundary (external broadcast sink) and patches time.time (external clock).
We do NOT mock the helper's listener logic, which is the unit under test.

R4: no sleeps; markers fed synchronously with patched time.time.
"""

from __future__ import annotations

import pytest
from unittest.mock import patch

from tests.orchestration.test_startup_eta import _make_listener_harness_for_groups


# ---------------------------------------------------------------------------
# Test: SEGMENT_PENDING frame suspends ETA during the model-load window
# ---------------------------------------------------------------------------

def test_segment_pending_frame_suspends_eta_during_model_load_window(clean_db, monkeypatch):
    """SEGMENT_PENDING frame must clear the ETA (not animate it) while the engine loads.

    Assertions:
    1. The SEGMENT_PENDING frame carries eta_seconds=None, clear_eta=True,
       indeterminate=True, force=True, status="running", active_segment_eta_seconds=None.
    2. No SEGMENT_PENDING frame regresses status to "preparing" (INV-1).
    3. After engine confirmation ([START_SYNTHESIS]), a later frame carries a
       fresh non-None active_segment_eta_seconds (pacing resumes).
    """
    job_id = "preparing-window-eta-test"
    groups = [
        {
            "seg_id": "seg-1",
            "save_path": "/tmp/seg-preparing-1.wav",
            "engine": "xtts",
            "text": "The quick brown fox jumps over the lazy dog",
        },
    ]
    engine_behaviors = {
        "mixed": {},
        "xtts": {
            "timing_markers": {
                "ENGINE_ACTIVITY_STARTED": "Loading XTTS model...",
                "CHAPTER_SYNTHESIS_COMPLETE": "Successfully synthesized",
            },
        },
    }

    listener_cb, jobs_db, published_events = _make_listener_harness_for_groups(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        groups=groups,
        engine_behaviors=engine_behaviors,
    )
    listener = listener_cb[0]
    assert listener is not None, "Log listener must be registered by _dispatch"

    # --- Feed the marker sequence ---
    # t=100: engine announces start of segment (triggers SEGMENT_PENDING frame)
    with patch("time.time", return_value=100.0):
        listener("[START_SEGMENT] seg-1")

    # t=101: engine emits its XTTS cold-load marker (load window open)
    with patch("time.time", return_value=101.0):
        listener("Loading XTTS model...")

    # t=136: engine confirms it is actually synthesizing (load window closes)
    with patch("time.time", return_value=136.0):
        listener("[START_SYNTHESIS] seg-1")

    # --- Assertion 1: SEGMENT_PENDING frame contract ---
    pending_frames = [e for e in published_events if e.get("reason_code") == "SEGMENT_PENDING"]
    assert len(pending_frames) >= 1, "Expected at least one SEGMENT_PENDING frame"

    for frame in pending_frames:
        assert frame.get("eta_seconds") is None, (
            f"SEGMENT_PENDING must not carry a positive eta_seconds during model-load window; "
            f"got {frame.get('eta_seconds')!r}"
        )
        assert frame.get("clear_eta") is True, (
            "SEGMENT_PENDING must set clear_eta=True to suspend the displayed ETA"
        )
        assert frame.get("indeterminate") is True, (
            "SEGMENT_PENDING must set indeterminate=True during the load window"
        )
        assert frame.get("force") is True, (
            "SEGMENT_PENDING must set force=True to guarantee delivery"
        )
        assert frame.get("active_segment_eta_seconds") is None, (
            "SEGMENT_PENDING must leave active_segment_eta_seconds=None "
            "(pacing must not start before engine confirmation)"
        )

    # --- Assertion 2: durable status stays "running" (INV-1) ---
    for frame in pending_frames:
        assert frame.get("status") == "running", (
            f"SEGMENT_PENDING must not regress status to {frame.get('status')!r}; "
            "durable status must remain 'running' (INV-1)"
        )

    # --- Assertion 3: pacing resumes after engine confirmation ---
    # After [START_SYNTHESIS] there should be a START_SEGMENT or later frame
    # with a fresh non-None active_segment_eta_seconds.
    start_synth_frames = [
        e for e in published_events
        if e.get("reason_code") == "START_SEGMENT"
        and e.get("active_segment_eta_seconds") is not None
    ]
    assert len(start_synth_frames) >= 1, (
        "After [START_SYNTHESIS] a frame must carry a non-None active_segment_eta_seconds "
        "to prove pacing has resumed from a fresh value (clear is temporary)"
    )


# ---------------------------------------------------------------------------
# Test: LOADING_MODEL dispatch frame also clears ETA
# ---------------------------------------------------------------------------

def test_loading_model_dispatch_frame_clears_eta(clean_db, monkeypatch):
    """The dispatch-time LOADING_MODEL frame must carry clear_eta=True, force=True.

    This is Frame B: the very first frame emitted when _dispatch() is called,
    covering the cold model load before any [START_SEGMENT] marker arrives.
    """
    job_id = "loading-model-dispatch-eta-test"
    groups = [
        {
            "seg_id": "seg-lm",
            "save_path": "/tmp/seg-lm.wav",
            "engine": "xtts",
            "text": "Hello loading model",
        },
    ]
    engine_behaviors = {
        "mixed": {},
        "xtts": {
            "timing_markers": {
                "ENGINE_ACTIVITY_STARTED": "Loading XTTS model...",
            },
        },
    }

    _listener_cb, _jobs_db, published_events = _make_listener_harness_for_groups(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        groups=groups,
        engine_behaviors=engine_behaviors,
    )

    # The LOADING_MODEL frame is emitted during _dispatch() before any listener is fed.
    loading_frames = [e for e in published_events if e.get("reason_code") == "LOADING_MODEL"]
    assert len(loading_frames) >= 1, "Expected a LOADING_MODEL frame from _dispatch()"

    for frame in loading_frames:
        assert frame.get("clear_eta") is True, (
            "LOADING_MODEL dispatch frame must set clear_eta=True"
        )
        assert frame.get("force") is True, (
            "LOADING_MODEL dispatch frame must set force=True"
        )
        assert frame.get("indeterminate") is True, (
            "LOADING_MODEL dispatch frame must set indeterminate=True (pre-existing)"
        )
        assert frame.get("status") == "preparing", (
            "LOADING_MODEL dispatch frame must keep status='preparing' (forward path, not regression)"
        )
