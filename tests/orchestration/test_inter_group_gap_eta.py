"""Inter-segment (inter-group) gap overhead must be factored into the live ETA.

Contract: the gap between one render group finishing and the next starting
(model reload / overhead) must be reflected in the countdown so the bar does not
coast to completion during the gap. The calibrated overhead was computed but
dropped (params[1] unused) and calculate_chapter_remaining_eta was dead code.

This drives a 2-group marker stream with a mocked calibration (cps, overhead)
and asserts the SEGMENT_SAVED frame after group 1 carries an ETA that includes
the remaining-group overhead.

R1 revert-check: before the fix, the SEGMENT_SAVED publish passed no eta_seconds
(None) and the overhead term was never applied. R4: synchronous markers.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.engines.watchdog import TtsServerWatchdog
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.tasks.base import TaskContext, StudioTask, TaskResult


class MockStream:
    def __init__(self, lines):
        self._lines = lines

    def readline(self):
        return self._lines.pop(0) if self._lines else ""

    def close(self):
        pass


class MockOrchestrator(OrchestratorHelpersMixin):
    def __init__(self):
        self.voice_bridge = MagicMock()
        self.progress_service = MagicMock()
        self.published: list[dict] = []

    def _publish(self, **kwargs):
        self.published.append(kwargs)


class TwoGroupTask(StudioTask):
    def __init__(self, bridge):
        self.bridge = bridge
        # weights == char counts; total 100, group1=40, group2=60
        self.script = [
            {"id": "g1", "ids": ["g1"], "text": "x" * 40, "save_path": "/tmp/g1.wav", "weight": 40},
            {"id": "g2", "ids": ["g2"], "text": "x" * 60, "save_path": "/tmp/g2.wav", "weight": 60},
        ]

    def get_expected_duration(self, text, engine_id):
        return 30.0

    def describe(self):
        return TaskContext(
            task_id="job-gap",
            task_type="synthesis",
            payload={"script_text": "x" * 100, "engine_id": "xtts"},
        )

    @property
    def prefers_local_execution(self):
        return True

    def run(self):
        self.bridge.synthesize({"text": "test"})
        return TaskResult(status="completed")


STREAM = [
    "[START_SYNTHESIS] job-gap\n",
    "[START_SEGMENT] g1 job-gap\n",
    "[PROGRESS] 50% job-gap\n",
    "[SEGMENT_SAVED] /tmp/g1.wav job-gap\n",
    "[START_SEGMENT] g2 job-gap\n",
    "[PROGRESS] 50% job-gap\n",
    "[SEGMENT_SAVED] /tmp/g2.wav job-gap\n",
]


def test_segment_saved_eta_includes_inter_group_overhead():
    bridge = MagicMock()
    orc = MockOrchestrator()
    task = TwoGroupTask(bridge)
    context = task.describe()
    wd = TtsServerWatchdog()

    # Calibration: 10 chars/sec, 5s inter-group overhead.
    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None), \
         patch("app.orchestration.scheduler.eta.get_calibrated_model_params", return_value=(10.0, 5.0)):
        def _side_effect(*args, **kwargs):
            wd._drain_stream(None, "stdout", MockStream(STREAM[:]))
            return {"status": "ok"}
        bridge.synthesize.side_effect = _side_effect
        orc._dispatch(task=task, context=context)

    saved = [e for e in orc.published if e.get("reason_code") == "SEGMENT_SAVED"]
    assert saved, "expected SEGMENT_SAVED publishes"
    # After group 1 saves: remaining_weight=60, groups_remaining=1.
    # eta = 60/10 + 1*5 = 11s. Without the overhead term it would be 6s.
    g1_saved = saved[0]
    assert g1_saved.get("eta_seconds") == 11, (
        f"group-1 SEGMENT_SAVED ETA must include inter-group overhead (expected 11), "
        f"got {g1_saved.get('eta_seconds')}"
    )


def test_segment_saved_eta_degrades_without_calibration():
    """No calibration history → SEGMENT_SAVED re-anchor ETA is None (honest contract).

    With the fabricated DEFAULT_BASELINE_ENGINE_CPS fallback removed, the SEGMENT_SAVED
    path no longer synthesizes an ETA from char counts when there is no calibration.

    R1 revert-check: on pre-removal code, eta_seconds was non-null (remaining chars /
    16.7 cps).  Post-removal it is None.
    """
    bridge = MagicMock()
    orc = MockOrchestrator()
    task = TwoGroupTask(bridge)
    context = task.describe()
    wd = TtsServerWatchdog()

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None), \
         patch("app.orchestration.scheduler.eta.get_calibrated_model_params", return_value=None):
        def _side_effect(*args, **kwargs):
            wd._drain_stream(None, "stdout", MockStream(STREAM[:]))
            return {"status": "ok"}
        bridge.synthesize.side_effect = _side_effect
        orc._dispatch(task=task, context=context)

    saved = [e for e in orc.published if e.get("reason_code") == "SEGMENT_SAVED"]
    g1_saved = saved[0]
    # No calibration → no fabricated ETA → None.
    assert g1_saved.get("eta_seconds") is None, (
        f"SEGMENT_SAVED without calibration must yield eta_seconds=None, "
        f"got {g1_saved.get('eta_seconds')}"
    )
