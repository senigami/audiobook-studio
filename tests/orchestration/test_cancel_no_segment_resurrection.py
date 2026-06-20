"""A cancelled render must not resurrect segment audio state.

Lost-update race (the systemic bug behind the Rebuild no-synthesis reuse):
chapter reset cancels the active render and then sets the chapter's segments to
audio_status='unprocessed'. But ``orchestrator.cancel()`` is cooperative — it
signals the engine and returns immediately while the render's dispatch thread is
still parked in ``voice_bridge.synthesize()``. Its still-registered log listener
kept processing straggler ``[SEGMENT_SAVED]`` lines and re-marked segments
audio_status='done' AFTER ``reset_chapter_audio`` committed. The next render then
saw every render group "done" and reused the cached audio instead of
re-synthesizing (observed as a no-synthesis re-stitch on "Rebuild").

``on_cancel()`` sets ``task._cancelled = True`` synchronously inside
``orchestrator.cancel()`` — before the route runs the DB reset. So the fix is:
once a task is cancelled, its log listener must not write segment 'done' state.

R1 revert-check: before the guard, the post-cancel ``[SEGMENT_SAVED]`` line
calls ``update_segments_bulk(audio_status='done')`` and ``test_cancelled_render``
FAILS. The control test proves the stream really does reach the write when the
task is NOT cancelled. R4: markers driven synchronously, no sleeps.
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


class OneGroupTask(StudioTask):
    """Chapter render: a single render group with one saved segment."""

    def __init__(self, bridge, cancelled=False):
        self.bridge = bridge
        self._cancelled = cancelled
        self.script = [
            {"id": "seg-1", "ids": ["seg-1"], "text": "Group one text.", "save_path": "/tmp/g1.wav", "weight": 100},
        ]

    def get_expected_duration(self, text, engine_id):
        return 30.0

    def describe(self):
        return TaskContext(
            task_id="job-cancel-race",
            task_type="synthesis",
            chapter_id="chap-1",
            payload={"script_text": "Group one text.", "engine_id": "xtts"},
        )

    @property
    def prefers_local_execution(self):
        return True

    def run(self):
        self.bridge.synthesize({"text": "test"})
        return TaskResult(status="completed")


# A straggler [SEGMENT_SAVED] arriving after the job was cancelled.
SAVED_STREAM = ["[SEGMENT_SAVED] /tmp/g1.wav job-cancel-race\n"]


def _run_stream(cancelled):
    bridge = MagicMock()
    orc = MockOrchestrator()
    task = OneGroupTask(bridge, cancelled=cancelled)
    context = task.describe()
    wd = TtsServerWatchdog()
    update_mock = MagicMock()

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", update_mock), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None):
        def _side_effect(*args, **kwargs):
            wd._drain_stream(None, "stdout", MockStream(SAVED_STREAM[:]))
            return {"status": "ok"}
        bridge.synthesize.side_effect = _side_effect
        orc._dispatch(task=task, context=context)
    return update_mock


def _done_writes(update_mock):
    return [c for c in update_mock.call_args_list if c.kwargs.get("audio_status") == "done"]


def test_cancelled_render_does_not_remark_segment_done():
    """A [SEGMENT_SAVED] processed after the job is cancelled must NOT write
    audio_status='done' — otherwise it resurrects the segment state the reset
    just cleared, and the next render reuses stale audio."""
    update_mock = _run_stream(cancelled=True)
    assert not _done_writes(update_mock), (
        "a cancelled render re-marked a segment audio_status='done' on a straggler "
        "[SEGMENT_SAVED]; this resurrects state a chapter reset just cleared"
    )


def test_active_render_marks_segment_done():
    """Control: a NON-cancelled render's [SEGMENT_SAVED] still writes 'done',
    proving the stream reaches the write and the guard above is meaningful."""
    update_mock = _run_stream(cancelled=False)
    assert _done_writes(update_mock), (
        "expected a non-cancelled render to mark its saved segment audio_status='done'"
    )
