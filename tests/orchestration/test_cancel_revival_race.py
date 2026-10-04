"""A task cancel() took ends with its row cancelled, even if a later in-dispatch frame revived it."""
from __future__ import annotations

import threading
from unittest.mock import patch

from app.db.state import Job, clear_all_jobs, delete_jobs, get_jobs, put_job
from app.orchestration.tasks.base import TaskResult

_SLEEP = "app.orchestration.scheduler.orchestrator.time.sleep"
_TERMINAL = {"done", "failed", "cancelled"}


def _statuses(progress_service) -> list[str]:
    return [c.kwargs["status"] for c in progress_service.publish.call_args_list]


def _seed_job(job_id: str) -> None:
    clear_all_jobs()
    put_job(Job(id=job_id, engine="xtts", status="queued", created_at=1.0, chapter_file="c.txt"))


def _cancel_on_first_new_work_preparing(orchestrator, task_id, *, then=None):
    """Wrap _publish so cancel() lands right after the step-5 preparing frame."""
    real_publish = orchestrator._publish

    def publish(**kw):
        real_publish(**kw)
        if kw.get("status") == "preparing" and kw.get("reason_code") == "new_work":
            assert orchestrator.cancel(task_id) is True
            if then:
                then()

    return publish


def test_cancel_before_first_dispatch_ends_cancelled_and_never_runs(orchestrator, progress_service, make_task):
    _seed_job("rv1")
    task = make_task("rv1")
    with patch.object(orchestrator, "_publish", side_effect=_cancel_on_first_new_work_preparing(orchestrator, "rv1")):
        orchestrator.submit(task)

    task.run.assert_not_called()
    assert get_jobs()["rv1"].status == "cancelled"
    assert not orchestrator._active


def test_cancel_between_retry_check_and_dispatch_ends_cancelled(orchestrator, progress_service, make_task):
    _seed_job("rv2")
    task = make_task("rv2", result=TaskResult(status="failed", message="down", retriable=True))
    real_owns = orchestrator._owns_active
    checks = {"n": 0}

    def owns(task_id, t):
        owned = real_owns(task_id, t)
        if task.run.call_count == 1:
            checks["n"] += 1
            if checks["n"] == 2:  # post-failure check passed, now the next attempt's loop-top check
                orchestrator.cancel(task_id)
        return owned

    with patch.object(orchestrator, "_owns_active", side_effect=owns), patch(_SLEEP):
        orchestrator.submit(task)

    assert get_jobs()["rv2"].status == "cancelled"
    assert task.run.call_count == 2  # the check passed, then cancel landed: that dispatch is the race window


def test_nonforced_preparing_frame_revives_cancelled_row_and_tail_restores_it(orchestrator, progress_service, make_task):
    _seed_job("rv3")
    task = make_task("rv3", task_type="synthesis")
    task.is_chapter_fanout = True
    revived = {}

    def run(*_a, **_k):
        assert orchestrator.cancel("rv3") is True
        orchestrator._publish(context=task.describe.return_value, status="preparing", reason_code="pre_load_eta")
        revived["status"] = get_jobs()["rv3"].status
        return TaskResult(status="cancelled", message="Chapter render cancelled.")

    task.run.side_effect = run
    orchestrator.submit(task)

    assert revived["status"] == "preparing"  # the frame does revive the row
    assert get_jobs()["rv3"].status == "cancelled"  # and the tail puts it back


def test_fanout_cancel_after_loop_top_check_with_eta_frame_ends_cancelled(orchestrator, progress_service, make_task):
    _seed_job("rv3b")
    task = make_task("rv3b", task_type="synthesis")
    task.is_chapter_fanout = True
    real_owns = orchestrator._owns_active
    first_check = {"done": False}

    def owns(task_id, t):
        owned = real_owns(task_id, t)
        if not first_check["done"]:
            first_check["done"] = True  # the loop-top check passed, cancel lands before dispatch
            orchestrator.cancel(task_id)
        return owned

    def run(*_a, **_k):
        orchestrator._publish(
            context=task.describe.return_value, status="preparing", eta_seconds=30, reason_code="pre_load_eta"
        )
        return TaskResult(status="cancelled", message="Chapter render cancelled.")

    task.run.side_effect = run
    with patch.object(orchestrator, "_owns_active", side_effect=owns):
        orchestrator.submit(task)

    task.run.assert_called_once()
    assert get_jobs()["rv3b"].status == "cancelled"
    assert not orchestrator._active


def test_row_deleted_after_cancel_is_not_recreated(orchestrator, progress_service, make_task):
    _seed_job("rv4")
    task = make_task("rv4")
    hook = _cancel_on_first_new_work_preparing(orchestrator, "rv4", then=lambda: delete_jobs(["rv4"]))
    with patch.object(orchestrator, "_publish", side_effect=hook):
        orchestrator.submit(task)

    assert "rv4" not in get_jobs()


def test_cancelled_result_for_deleted_row_does_not_recreate_stub(orchestrator, progress_service, make_task):
    _seed_job("rv5")
    task = make_task("rv5")
    task.run.side_effect = lambda *_a, **_k: (delete_jobs(["rv5"]), TaskResult(status="cancelled"))[1]
    orchestrator.submit(task)

    assert "rv5" not in get_jobs()


def test_completion_racing_cancel_yields_no_terminal_after_cancelled(orchestrator, progress_service, make_task):
    """Guard test: also green on the pre-fix source; pins that the lock winner decides."""
    _seed_job("rv6")
    task = make_task("rv6")
    in_run, release = threading.Event(), threading.Event()

    def run(*_a, **_k):
        in_run.set()
        assert release.wait(5)
        return TaskResult(status="completed")

    task.run.side_effect = run
    worker = threading.Thread(target=orchestrator.submit, args=(task,))
    worker.start()
    assert in_run.wait(5)
    assert orchestrator.cancel("rv6") is True
    release.set()
    worker.join(5)

    assert not worker.is_alive()
    statuses = _statuses(progress_service)
    assert "done" not in statuses[statuses.index("cancelled"):]
    assert "failed" not in statuses[statuses.index("cancelled"):]
    assert get_jobs()["rv6"].status in _TERMINAL
    assert get_jobs()["rv6"].status == "cancelled"
