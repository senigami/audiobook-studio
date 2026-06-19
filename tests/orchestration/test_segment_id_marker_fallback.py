"""Segment-id fallback when the [START_SEGMENT] marker is missing.

Real-render symptom: an XTTS chapter render emitted [START_SYNTHESIS],
[PROGRESS], and [SEGMENT_SAVED] markers but ZERO [START_SEGMENT] markers
(observed with a stale installed engine build). Without START_SEGMENT the
log_listener never set active_seg_id, so every published frame carried
active_segment_id=None. service.py then gates out all segment_progress frames
(it requires a non-null active_segment_id), so the chapter-segment page's
segment progress bar never mounts and the text highlight never animates.

The orchestrator already knows the render-group structure (script groups +
weights). This test drives a NO-START_SEGMENT stream and asserts the PROGRESS
branch derives active_segment_id from the group structure.

R1 revert-check: before the fallback, the SEGMENT_PROGRESS frames carry
active_segment_id=None and these assertions FAIL. After it, they carry the
active group's leader id. R4: no sleeps — markers driven synchronously.
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
    """Chapter render: 3 segments in 2 render groups (mirrors the real shape)."""

    def __init__(self, bridge):
        self.bridge = bridge
        self.script = [
            {"id": "seg-1a", "ids": ["seg-1a", "seg-1b"], "text": "Group one text.", "save_path": "/tmp/g1.wav", "weight": 40},
            {"id": "seg-2", "ids": ["seg-2"], "text": "Group two.", "save_path": "/tmp/g2.wav", "weight": 60},
        ]

    def get_expected_duration(self, text, engine_id):
        return 30.0

    def describe(self):
        return TaskContext(
            task_id="job-no-start-seg",
            task_type="synthesis",
            payload={"script_text": "Group one text. Group two.", "engine_id": "xtts"},
        )

    @property
    def prefers_local_execution(self):
        return True

    def run(self):
        self.bridge.synthesize({"text": "test"})
        return TaskResult(status="completed")


# Stream with NO [START_SEGMENT] markers — exactly the broken real-render shape.
NO_START_SEGMENT_STREAM = [
    "[START_SYNTHESIS] job-no-start-seg\n",
    "[PROGRESS] 25% job-no-start-seg\n",
    "[PROGRESS] 50% job-no-start-seg\n",
    "[SEGMENT_SAVED] /tmp/g1.wav job-no-start-seg\n",
    "[PROGRESS] 25% job-no-start-seg\n",
    "[PROGRESS] 50% job-no-start-seg\n",
    "[SEGMENT_SAVED] /tmp/g2.wav job-no-start-seg\n",
]


def _run_stream():
    bridge = MagicMock()
    orc = MockOrchestrator()
    task = TwoGroupTask(bridge)
    context = task.describe()
    wd = TtsServerWatchdog()

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None):
        def _side_effect(*args, **kwargs):
            wd._drain_stream(None, "stdout", MockStream(NO_START_SEGMENT_STREAM[:]))
            return {"status": "ok"}
        bridge.synthesize.side_effect = _side_effect
        orc._dispatch(task=task, context=context)
    return orc.published


def test_progress_frames_carry_active_segment_id_without_start_segment_marker():
    """SEGMENT_PROGRESS frames must carry the active group's leader id even when
    no [START_SEGMENT] marker arrived."""
    published = _run_stream()
    seg_progress = [
        e for e in published
        if e.get("reason_code") == "SEGMENT_PROGRESS" and e.get("status") == "running"
    ]
    assert seg_progress, "expected SEGMENT_PROGRESS frames from the PROGRESS markers"
    active_ids = {e.get("active_segment_id") for e in seg_progress}
    assert None not in active_ids, (
        f"every SEGMENT_PROGRESS frame must carry a non-null active_segment_id; got {active_ids}"
    )
    # Group 1 progress credits the group-1 leader; group 2 credits the group-2 leader.
    assert "seg-1a" in active_ids
    assert "seg-2" in active_ids


def test_canonical_start_segment_frame_published_for_synthesized_segment():
    """The synthesized active segment must still get a canonical START_SEGMENT frame
    (published at first-PROGRESS engine confirmation), so the frontend bar mounts."""
    published = _run_stream()
    start_frames = [e for e in published if e.get("reason_code") == "START_SEGMENT"]
    started_ids = {e.get("active_segment_id") for e in start_frames}
    assert "seg-1a" in started_ids, f"expected a START_SEGMENT frame for seg-1a; got {started_ids}"
    assert "seg-2" in started_ids, f"expected a START_SEGMENT frame for seg-2; got {started_ids}"
