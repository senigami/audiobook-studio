"""Exactly one of cancel() / submit()'s tail publishes a task's terminal event."""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app.db.state import Job, clear_all_jobs, delete_jobs, get_jobs, put_job
from app.orchestration.tasks.base import TaskResult

_SLEEP = "app.orchestration.scheduler.orchestrator.time.sleep"


def _statuses(progress_service) -> list[str]:
    return [c.kwargs["status"] for c in progress_service.publish.call_args_list]


def _seed_job(job_id: str) -> None:
    clear_all_jobs()
    put_job(Job(id=job_id, engine="xtts", status="queued", created_at=1.0, chapter_file="c.txt"))


@pytest.mark.parametrize("result", [TaskResult(status="cancelled", message="Chapter render cancelled."),
                                    TaskResult(status="failed", message="boom")])
def test_cancel_then_remove_publishes_nothing_after_cancelled(orchestrator, progress_service, make_task, result):
    # A1: UI remove = cancel() then delete_jobs(); the task unwinds afterwards.
    _seed_job("t258")
    task = make_task("t258")

    def run(*_a, **_k):
        assert orchestrator.cancel("t258") is True
        delete_jobs(["t258"])
        return result

    task.run.side_effect = run
    orchestrator.submit(task)

    statuses = _statuses(progress_service)
    assert statuses[-1] == "cancelled"
    assert "failed" not in statuses and "done" not in statuses
    assert "t258" not in get_jobs(), "no stub job may be recreated after the row was deleted"


def test_cancelled_result_without_cancel_call_ends_cancelled(orchestrator, progress_service, make_task):
    # A2: a task that stops itself (real ChapterSynthesisTask returns "cancelled") is not a failure.
    _seed_job("t258-self")
    task = make_task("t258-self", result=TaskResult(status="cancelled", message="Chapter render cancelled."))
    orchestrator.submit(task)

    statuses = _statuses(progress_service)
    assert statuses[-1] == "cancelled" and "failed" not in statuses
    assert get_jobs()["t258-self"].status == "cancelled"


def test_cancel_during_retry_wait_does_not_redispatch(orchestrator, progress_service, make_task):
    # A3: cancel lands while the 2 s retry wait is pending (time.sleep is the clock boundary, patched).
    _seed_job("t258-retry")
    task = make_task("t258-retry", result=TaskResult(status="failed", message="engine down", retriable=True))
    with patch(_SLEEP, side_effect=lambda _s: orchestrator.cancel("t258-retry")):
        orchestrator.submit(task)

    assert task.run.call_count == 1
    statuses = _statuses(progress_service)
    assert statuses[-1] == "cancelled" and "failed" not in statuses
    assert get_jobs()["t258-retry"].status == "cancelled"


def test_cancel_wins_over_a_completed_result(orchestrator, progress_service, make_task):
    # A4: cancel() popped _active first, so the late "completed" result must not overwrite it (spec 3.4a).
    _seed_job("t258-race")
    task = make_task("t258-race")

    def run(*_a, **_k):
        orchestrator.cancel("t258-race")
        return TaskResult(status="completed")

    task.run.side_effect = run
    orchestrator.submit(task)

    statuses = _statuses(progress_service)
    assert statuses[-1] == "cancelled" and "done" not in statuses
    assert get_jobs()["t258-race"].status == "cancelled"


# --- guards: must pass BEFORE and AFTER the fix --------------------------------------------------

def test_genuine_failure_still_publishes_failed(orchestrator, progress_service, make_task):
    _seed_job("t258-fail")
    orchestrator.submit(make_task("t258-fail", result=TaskResult(status="failed", message="disk full")))
    last = progress_service.publish.call_args_list[-1].kwargs
    assert last["status"] == "failed" and last["reason_code"] == "synthesis_error"
    assert last["message"].startswith("disk full")      # _dispatch_segment decorates the message with an engine/kind suffix
    assert get_jobs()["t258-fail"].status == "failed"


def test_retriable_failure_exhausted_still_publishes_failed(orchestrator, progress_service, make_task):
    _seed_job("t258-exhaust")
    task = make_task("t258-exhaust", result=TaskResult(status="failed", message="down", retriable=True))
    with patch(_SLEEP):
        orchestrator.submit(task)
    assert task.run.call_count == 3
    last = progress_service.publish.call_args_list[-1].kwargs
    assert last["status"] == "failed" and last["reason_code"] == "synthesis_error_retriable"


def test_completion_still_publishes_done(orchestrator, progress_service, make_task):
    _seed_job("t258-ok")
    orchestrator.submit(make_task("t258-ok"))
    assert _statuses(progress_service)[-1] == "done"
    assert get_jobs()["t258-ok"].status == "done"
