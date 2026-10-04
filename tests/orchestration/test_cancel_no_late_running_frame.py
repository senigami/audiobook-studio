"""A cancelled chapter render emits no later running/completed progress frame.

Guard (green before and after): the real ProgressService retains the terminal
payload and its emit gate drops any non-re-entry frame after it, so a late
``_publish_progress`` from the unwinding task cannot un-cancel the row.

Mock boundary (R2): only the websocket broadcaster is captured; the real
ProgressService and ChapterSynthesisTask._publish_progress run.
"""
from __future__ import annotations

import pytest

from app.db.state import Job, clear_all_jobs, get_jobs, put_job, update_job
from app.orchestration.progress.service import (
    ProgressService,
    estimate_eta_seconds,
    reconcile_work_item,
)
from app.orchestration.tasks.segment_synthesis import ChapterSynthesisTask

_JOB_ID = "chap-g1"


@pytest.fixture
def cancelled_chapter():
    """Seed the job the way cancel() leaves it, then publish the forced `cancelled` frame."""
    clear_all_jobs()
    put_job(Job(id=_JOB_ID, engine="xtts", status="running", created_at=1.0, chapter_file="c.txt"))
    update_job(_JOB_ID, status="cancelled", force_broadcast=True)

    frames: list[dict] = []

    def _capture(payload: dict, channel: str = "jobs") -> None:
        frames.append({"channel": channel, **payload})

    service = ProgressService(reconcile_fn=reconcile_work_item, eta_fn=estimate_eta_seconds, broadcaster=_capture)
    task = ChapterSynthesisTask(
        task_id=_JOB_ID,
        engine_id="mixed",
        chapter_id="chapter-g1",
        project_id="proj-1",
        output_path="/tmp/chap-g1.wav",
        script=[],
    )
    task._progress_service = service
    service.publish(
        job_id=_JOB_ID, status="cancelled", chapter_id="chapter-g1", parent_job_id="proj-1",
        message="Chapter render cancelled.", reason_code="user_cancel", force=True,
    )
    assert frames and {_status(f) for f in frames} == {"cancelled"}
    return task, frames, len(frames)


def _status(frame: dict) -> str | None:
    return frame["payload"].get("status")


def _late_frames(frames: list[dict], baseline: int) -> list[dict]:
    return frames[baseline:]


def test_late_running_frame_after_cancelled_is_dropped(cancelled_chapter):
    task, frames, baseline = cancelled_chapter
    task._publish_progress(completed=1, total=3, status="running")
    assert _late_frames(frames, baseline) == []


def test_late_completed_frame_after_cancelled_publishes_no_done_frame(cancelled_chapter):
    task, frames, baseline = cancelled_chapter
    task._publish_progress(completed=3, total=3, status="completed")
    late = _late_frames(frames, baseline)
    assert [f for f in late if _status(f) in {"done", "completed"}] == []
    assert late == []


def test_stored_job_status_stays_cancelled(cancelled_chapter):
    task, _frames, _baseline = cancelled_chapter
    task._publish_progress(completed=1, total=3, status="running")
    task._publish_progress(completed=3, total=3, status="completed")
    assert get_jobs()[_JOB_ID].status == "cancelled"
