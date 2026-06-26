"""Tests for the preparing-window ETA suspension refinement.

The SEGMENT_PENDING (announce) frame must be ETA-neutral on every segment boundary
(warm renders must not flash). The ETA suspension (clear_eta/indeterminate/force)
now fires only when a REAL model-load marker is detected for the active segment,
which is gated by the ENGINE_ACTIVITY_STARTED branch condition:

    matched_marker_engine == active_engine_id
    AND _active_engine_has_specific_activity_marker(active_engine_id)

This condition is TRUE for cold XTTS groups (whose marker "Loading XTTS model..."
is specific) but FALSE for the mixed handler's generic [ENGINE_ACTIVITY_STARTED]
placeholder (which resolves to the job engine, not the active group engine).

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
# Test 1 — cold load suspends ETA only when a real model-load marker fires
# ---------------------------------------------------------------------------

def test_cold_load_suspends_eta_on_real_load_marker(clean_db, monkeypatch):
    """A real model-load marker (e.g. 'Loading XTTS model...') must trigger
    a per-group LOADING_MODEL suspension frame (clear_eta, indeterminate, force,
    status='running') while the SEGMENT_PENDING announce frame stays ETA-neutral.
    Pacing resumes after engine confirmation ([START_SYNTHESIS]).

    Assertions:
    1. SEGMENT_PENDING frame: clear_eta falsy, indeterminate falsy, eta_seconds None.
    2. A LOADING_MODEL frame with status='running', clear_eta=True, indeterminate=True,
       force=True, eta_seconds=None, active_segment_eta_seconds=None is present.
       (NOT the dispatch-time frame which has status='preparing'.)
    3. After [START_SYNTHESIS], a later START_SEGMENT frame carries a non-None
       active_segment_eta_seconds (pacing resumed).
    """
    job_id = "cold-load-suspension-test"
    groups = [
        {
            "seg_id": "seg-1",
            "save_path": "/tmp/seg-cold-1.wav",
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

    listener_cb, _jobs_db, published_events = _make_listener_harness_for_groups(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        groups=groups,
        engine_behaviors=engine_behaviors,
    )
    listener = listener_cb[0]
    assert listener is not None, "Log listener must be registered by _dispatch"

    # t=100: engine announces start of segment (triggers SEGMENT_PENDING frame)
    with patch("time.time", return_value=100.0):
        listener("[START_SEGMENT] seg-1")

    # t=101: engine emits real XTTS cold-load marker (load window opens)
    with patch("time.time", return_value=101.0):
        listener("Loading XTTS model...")

    # t=140: engine confirms synthesis started (load window closes)
    with patch("time.time", return_value=140.0):
        listener("[START_SYNTHESIS] seg-1")

    # --- Assertion 1: SEGMENT_PENDING frame is ETA-neutral (no flash) ---
    pending_frames = [e for e in published_events if e.get("reason_code") == "SEGMENT_PENDING"]
    assert len(pending_frames) >= 1, "Expected at least one SEGMENT_PENDING frame"

    for frame in pending_frames:
        assert not frame.get("clear_eta"), (
            f"SEGMENT_PENDING must NOT set clear_eta (warm renders must not flash); "
            f"got clear_eta={frame.get('clear_eta')!r}"
        )
        assert not frame.get("indeterminate"), (
            f"SEGMENT_PENDING must NOT set indeterminate; "
            f"got indeterminate={frame.get('indeterminate')!r}"
        )
        assert frame.get("eta_seconds") is None, (
            f"SEGMENT_PENDING must carry eta_seconds=None; got {frame.get('eta_seconds')!r}"
        )

    # --- Assertion 2: per-group LOADING_MODEL suspension frame is emitted ---
    # Must have status='running' (distinguishes from the dispatch-time 'preparing' frame).
    loading_frames = [
        e for e in published_events
        if e.get("reason_code") == "LOADING_MODEL" and e.get("status") == "running"
    ]
    assert len(loading_frames) >= 1, (
        "Expected a per-group LOADING_MODEL frame with status='running' after the real "
        "model-load marker; none found. published reason_codes: "
        + str([e.get("reason_code") for e in published_events])
    )
    for frame in loading_frames:
        assert frame.get("clear_eta") is True, (
            "Per-group LOADING_MODEL frame must set clear_eta=True"
        )
        assert frame.get("indeterminate") is True, (
            "Per-group LOADING_MODEL frame must set indeterminate=True"
        )
        assert frame.get("force") is True, (
            "Per-group LOADING_MODEL frame must set force=True"
        )
        assert frame.get("eta_seconds") is None, (
            "Per-group LOADING_MODEL frame must carry eta_seconds=None"
        )
        assert frame.get("active_segment_eta_seconds") is None, (
            "Per-group LOADING_MODEL frame must carry active_segment_eta_seconds=None"
        )

    # --- Assertion 3: pacing resumes after engine confirmation ---
    resume_frames = [
        e for e in published_events
        if e.get("reason_code") == "START_SEGMENT"
        and e.get("active_segment_eta_seconds") is not None
    ]
    assert len(resume_frames) >= 1, (
        "After [START_SYNTHESIS] a START_SEGMENT frame must carry a non-None "
        "active_segment_eta_seconds to prove pacing has resumed"
    )


# ---------------------------------------------------------------------------
# Test 2 — warm group (generic placeholder) does NOT suspend or flash
# ---------------------------------------------------------------------------

def test_warm_group_does_not_suspend_or_flash(clean_db, monkeypatch):
    """A warm group (no real model-load marker) must not flash the ETA.

    The mixed handler emits [ENGINE_ACTIVITY_STARTED] as a generic bracketed
    placeholder before every group subprocess. This resolves to the JOB engine
    ('mixed'), not the active group engine ('xtts'), so the gating condition
    inside ENGINE_ACTIVITY_STARTED is false and no suspension publish fires.

    Assertions:
    1. SEGMENT_PENDING frame has falsy clear_eta and falsy indeterminate.
    2. No LOADING_MODEL frame with status='running' was emitted (the generic
       activity marker must NOT trigger per-group suspension).
    """
    job_id = "warm-group-no-flash-test"
    groups = [
        {
            "seg_id": "seg-1",
            "save_path": "/tmp/seg-warm-1.wav",
            "engine": "xtts",
            "text": "Warm render, model already loaded",
        },
    ]
    # xtts has a specific marker but we will NOT emit it — instead we emit the
    # generic [ENGINE_ACTIVITY_STARTED] placeholder as the mixed handler does.
    engine_behaviors = {
        "mixed": {},
        "xtts": {
            "timing_markers": {
                "ENGINE_ACTIVITY_STARTED": "Loading XTTS model...",
                "CHAPTER_SYNTHESIS_COMPLETE": "Successfully synthesized",
            },
        },
    }

    listener_cb, _jobs_db, published_events = _make_listener_harness_for_groups(
        monkeypatch,
        job_id=job_id,
        job_engine_id="mixed",
        groups=groups,
        engine_behaviors=engine_behaviors,
    )
    listener = listener_cb[0]
    assert listener is not None, "Log listener must be registered by _dispatch"

    # t=100: announce (SEGMENT_PENDING)
    with patch("time.time", return_value=100.0):
        listener("[START_SEGMENT] seg-1")

    # t=101: the mixed handler's generic placeholder — NOT a real load marker.
    # This resolves to the JOB engine ('mixed'), not the active engine ('xtts').
    with patch("time.time", return_value=101.0):
        listener("[ENGINE_ACTIVITY_STARTED] seg-1")

    # t=102: synthesis starts immediately (warm — no load delay)
    with patch("time.time", return_value=102.0):
        listener("[START_SYNTHESIS] seg-1")

    # --- Assertion 1: SEGMENT_PENDING frame is ETA-neutral (no flash) ---
    pending_frames = [e for e in published_events if e.get("reason_code") == "SEGMENT_PENDING"]
    assert len(pending_frames) >= 1, "Expected at least one SEGMENT_PENDING frame"

    for frame in pending_frames:
        assert not frame.get("clear_eta"), (
            f"SEGMENT_PENDING must NOT set clear_eta on warm group; "
            f"got clear_eta={frame.get('clear_eta')!r}"
        )
        assert not frame.get("indeterminate"), (
            f"SEGMENT_PENDING must NOT set indeterminate on warm group; "
            f"got indeterminate={frame.get('indeterminate')!r}"
        )

    # --- Assertion 2: no per-group LOADING_MODEL suspension was emitted ---
    assert not any(
        e.get("reason_code") == "LOADING_MODEL" and e.get("status") == "running"
        for e in published_events
    ), (
        "Warm group (generic placeholder) must NOT emit a per-group LOADING_MODEL "
        "suspension frame. The generic [ENGINE_ACTIVITY_STARTED] marker resolves to "
        "the job engine, not the active engine, so the gating condition is false."
    )
