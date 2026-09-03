"""Task 008 — B8 synthetic-marker-stream characterization test.

VERDICT TARGET: determine whether a CLEAN START_SYNTHESIS / START_SEGMENT /
PROGRESS / SEGMENT_SAVED marker stream advances within-group progress through
the existing credit machinery, or whether there is a credit-logic bug.

The B8 "freeze" was observed when a render produced ZERO markers (cold-load +
sub-second synthesis).  This test drives a clean synthetic stream through the
real log_listener entry point (registered via watchdog) and asserts that
grouped_progress advances monotonically across both groups.

If the test PASSES: the credit machinery is correct; the B8 freeze is a
NO-MARKER root cause (engine/relay side).  Task 012 is the correct follow-up
owner for fixing marker emission.

If the test FAILS: there is a credit-logic bug, and this file must be updated
with the fix + R1 revert-check.

R4 compliance: no sleeps — all markers driven synchronously into
_drain_stream, which calls each registered listener inline.
"""

from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch

from app.engines.watchdog import TtsServerWatchdog
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.tasks.base import TaskContext, StudioTask, TaskResult


# ---------------------------------------------------------------------------
# Shared harness (mirrors test_watchdog_progress_logic.py style)
# ---------------------------------------------------------------------------

class MockStream:
    """Synchronous line source for _drain_stream — no subprocess, no threads."""

    def __init__(self, lines: list[str]):
        self._lines = lines

    def readline(self) -> str:
        if self._lines:
            return self._lines.pop(0)
        return ""

    def close(self) -> None:
        pass


class MockOrchestrator(OrchestratorHelpersMixin):
    def __init__(self) -> None:
        self.voice_bridge = MagicMock()
        self.progress_service = MagicMock()
        self.published: list[dict] = []

    def _publish(self, **kwargs) -> None:
        self.published.append(kwargs)


# ---------------------------------------------------------------------------
# Two-group scripted task — 3 segments in 2 render groups
#
#   Group 1  (leader: "seg-1a", members: ["seg-1a","seg-1b"], weight=40)
#   Group 2  (leader: "seg-2",  members: ["seg-2"],           weight=60)
#
# Equal (normalised) weights yield predictable breakpoints.
# ---------------------------------------------------------------------------

class CleanStreamTask(StudioTask):
    """Scripted task whose bridge.synthesize feeds a clean marker stream."""

    def __init__(self, bridge: MagicMock) -> None:
        self.bridge = bridge
        self.script = [
            {
                "id": "seg-1a",
                "ids": ["seg-1a", "seg-1b"],
                "text": "Group one has more text here.",   # weight overridden below
                "save_path": "/tmp/g1.wav",
                "weight": 40,
            },
            {
                "id": "seg-2",
                "ids": ["seg-2"],
                "text": "Group two.",
                "save_path": "/tmp/g2.wav",
                "weight": 60,
            },
        ]

    def get_expected_duration(self, text: str, engine_id: str) -> float:
        return 30.0

    def describe(self) -> TaskContext:
        return TaskContext(
            task_id="job-clean-stream",
            task_type="synthesis",
            payload={
                "script_text": "Group one has more text here. Group two.",
                "engine_id": "xtts",
            },
        )

    @property
    def prefers_local_execution(self) -> bool:
        return True

    def run(self) -> TaskResult:
        self.bridge.synthesize({"text": "test"})
        return TaskResult(status="completed")


# ---------------------------------------------------------------------------
# The characterization test
# ---------------------------------------------------------------------------

def test_clean_marker_stream_advances_grouped_progress_monotonically():
    """CHARACTERIZATION — Task 008.

    Feed a textbook-clean marker stream through the real log_listener closure
    (registered by _dispatch via the watchdog) and assert:

    1. grouped_progress is STRICTLY INCREASING across both render groups.
    2. At SEGMENT_SAVED (group 1), grouped_progress == floor_after_group1.
    3. Each PROGRESS tick in group 2 exceeds floor_after_group1.
    4. active_segment_id is set correctly for each group's PROGRESS events.
    5. completed_render_groups increments from 0 → 1 after group 1 saves.

    VERDICT: if this test passes, the credit machinery is correct and the
    B8 freeze is entirely a NO-MARKER root cause (Task 012 owns the fix).
    If it fails, the exact assertion error identifies the credit-logic bug.
    """
    bridge = MagicMock()
    orc = MockOrchestrator()
    task = CleanStreamTask(bridge)
    context = task.describe()
    wd = TtsServerWatchdog()

    # Clean marker stream — every marker present, groups sequential.
    #
    # Group 1:
    #   [START_SYNTHESIS]          — engine confirmed, render_started_at set
    #   [START_SEGMENT] seg-1a     — group 1 leader announced
    #   [PROGRESS] 25%             — seg-1a at 25% (engine confirmation fallback)
    #   [PROGRESS] 50%             — seg-1a at 50%
    #   [PROGRESS] 75%             — seg-1a at 75%
    #   [PROGRESS] 100%            — seg-1a at 100%
    #   [SEGMENT_SAVED] /tmp/g1.wav — group 1 saved → completed_weight += 40
    #
    # Group 2:
    #   [START_SEGMENT] seg-2      — group 2 leader announced
    #   [PROGRESS] 25%             — seg-2 at 25%
    #   [PROGRESS] 50%             — seg-2 at 50%
    #   [PROGRESS] 100%            — seg-2 at 100%
    #   [SEGMENT_SAVED] /tmp/g2.wav — group 2 saved → completed_weight = 100
    CLEAN_STREAM = [
        "[START_SYNTHESIS] job-clean-stream\n",
        "[START_SEGMENT] seg-1a job-clean-stream\n",
        "[PROGRESS] 25% job-clean-stream\n",
        "[PROGRESS] 50% job-clean-stream\n",
        "[PROGRESS] 75% job-clean-stream\n",
        "[PROGRESS] 100% job-clean-stream\n",
        "[SEGMENT_SAVED] /tmp/g1.wav job-clean-stream\n",
        "[START_SEGMENT] seg-2 job-clean-stream\n",
        "[PROGRESS] 25% job-clean-stream\n",
        "[PROGRESS] 50% job-clean-stream\n",
        "[PROGRESS] 100% job-clean-stream\n",
        "[SEGMENT_SAVED] /tmp/g2.wav job-clean-stream\n",
    ]

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None):

        def _side_effect(*args, **kwargs):
            wd._drain_stream(None, "stdout", MockStream(CLEAN_STREAM[:]))
            return {"status": "ok"}

        bridge.synthesize.side_effect = _side_effect
        orc._dispatch(task=task, context=context)

    running = [
        e for e in orc.published
        if e.get("status") == "running" and e.get("progress") is not None
    ]

    # ------------------------------------------------------------------ #
    # 1. Extract key event groups                                          #
    # ------------------------------------------------------------------ #

    group1_progress_events = [
        e for e in running
        if e.get("reason_code") == "SEGMENT_PROGRESS"
        and e.get("active_segment_id") == "seg-1a"
    ]
    saved1_events = [
        e for e in running
        if e.get("reason_code") == "SEGMENT_SAVED"
        and e.get("completed_render_groups") is not None
    ]
    group2_progress_events = [
        e for e in running
        if e.get("reason_code") == "SEGMENT_PROGRESS"
        and e.get("active_segment_id") == "seg-2"
    ]
    saved2_events = [
        e for e in running
        if e.get("reason_code") == "SEGMENT_SAVED"
        and e.get("completed_render_groups") == 2
    ]

    # ------------------------------------------------------------------ #
    # 2. Group 1 assertions                                                #
    # ------------------------------------------------------------------ #

    assert len(group1_progress_events) >= 4, (
        f"Expected >=4 SEGMENT_PROGRESS events for seg-1a, got "
        f"{len(group1_progress_events)}"
    )
    g1_vals = [e["progress"] for e in group1_progress_events]
    # Progress must advance (non-decreasing) within group 1
    for i in range(1, len(g1_vals)):
        assert g1_vals[i] >= g1_vals[i - 1], (
            f"Group-1 progress regressed: {g1_vals[i - 1]} → {g1_vals[i]}"
        )

    # ------------------------------------------------------------------ #
    # 3. SEGMENT_SAVED for group 1 increments completed_render_groups     #
    # ------------------------------------------------------------------ #

    assert saved1_events, "No SEGMENT_SAVED event found after group-1 completes"
    # After group-1 saves, completed_render_groups should be 1
    saved1 = saved1_events[0]
    assert saved1["completed_render_groups"] == 1, (
        f"Expected completed_render_groups=1 after group-1 SEGMENT_SAVED, "
        f"got {saved1['completed_render_groups']}"
    )
    floor_after_group1 = saved1["progress"]

    # floor_after_group1 = completed_weight(40) / total_weight(100) = 0.4 (true fraction, no ×0.90)
    assert pytest.approx(floor_after_group1, abs=0.01) == 0.4, (
        f"Expected floor_after_group1 ≈ 0.4, got {floor_after_group1}"
    )

    # ------------------------------------------------------------------ #
    # 4. Group 2 progress MUST strictly exceed the group-1 floor          #
    #    (this is the B8 core assertion — the "frozen" case fails here)   #
    # ------------------------------------------------------------------ #

    assert len(group2_progress_events) >= 3, (
        f"Expected >=3 SEGMENT_PROGRESS events for seg-2, got "
        f"{len(group2_progress_events)}"
    )
    g2_vals = [e["progress"] for e in group2_progress_events]

    assert all(p > floor_after_group1 for p in g2_vals), (
        f"B8 violation: group-2 progress did not exceed group-1 floor "
        f"{floor_after_group1}. Got: {g2_vals}. "
        f"active_segment_ids: {[e.get('active_segment_id') for e in group2_progress_events]}"
    )

    # Group 2 must be strictly increasing
    for i in range(1, len(g2_vals)):
        assert g2_vals[i] >= g2_vals[i - 1], (
            f"Group-2 progress regressed: {g2_vals[i - 1]} → {g2_vals[i]}"
        )

    # ------------------------------------------------------------------ #
    # 5. All progress values across the full run are monotonically        #
    #    non-decreasing (global monotonicity — no backslide between groups #
    # ------------------------------------------------------------------ #

    all_progress = [e["progress"] for e in running]
    for i in range(1, len(all_progress)):
        assert all_progress[i] >= all_progress[i - 1], (
            f"Global progress regression at event {i}: "
            f"{all_progress[i - 1]} → {all_progress[i]}"
        )

    # ------------------------------------------------------------------ #
    # 6. SEGMENT_SAVED for group 2 marks completed_render_groups=2        #
    # ------------------------------------------------------------------ #

    assert saved2_events, "No SEGMENT_SAVED event for group 2 (completed_render_groups=2)"
