"""A job removed before admission must not be dispatched or recreated."""
from __future__ import annotations

from app.db.state import Job, clear_all_jobs, delete_jobs, get_jobs, put_job


def test_delete_during_reconcile_is_not_dispatched(orchestrator, progress_service, make_task):
    clear_all_jobs()
    task = make_task("t258-g2")
    seen: list[bool] = []

    def reconcile(*_a, **_k):
        seen.append(orchestrator.cancel("t258-g2"))   # not registered yet, so False (route fallback path)
        delete_jobs(["t258-g2"])
        return {"artifact_state": "missing", "can_reuse": False}

    progress_service.reconcile.side_effect = reconcile
    orchestrator.submit(task)

    assert seen == [False]
    task.run.assert_not_called()
    assert "t258-g2" not in get_jobs(), "no stub may be recreated for a deleted job"


def test_clear_queue_delete_without_cancel_is_not_dispatched(orchestrator, progress_service, make_task):
    # DELETE /processing_queue removes queued rows without calling cancel(); a task still waiting for admission must stop.
    clear_all_jobs()
    task = make_task("t258-clear")

    def reconcile(*_a, **_k):
        delete_jobs(["t258-clear"])
        return {"artifact_state": "missing", "can_reuse": False}

    progress_service.reconcile.side_effect = reconcile
    orchestrator.submit(task)

    task.run.assert_not_called()
    assert "t258-clear" not in get_jobs()


def test_missing_job_after_seen_counts_as_cancelled(orchestrator):
    clear_all_jobs()
    assert orchestrator._is_task_cancelled_in_db("nope", job_was_seen=True) is True


# --- guards: the first, second and last pass before AND after; test_running_row_is_not_cancelled_even_when_seen is red before only (new kwarg) ---

def test_never_seen_job_stays_fail_open(orchestrator):
    clear_all_jobs()
    assert orchestrator._is_task_cancelled_in_db("nope") is False


def test_cancelled_row_counts_as_cancelled_and_running_does_not(orchestrator):
    clear_all_jobs()
    put_job(Job(id="a", engine="xtts", status="cancelled", created_at=1.0, chapter_file="c.txt"))
    put_job(Job(id="b", engine="xtts", status="running", created_at=1.0, chapter_file="c.txt"))
    assert orchestrator._is_task_cancelled_in_db("a") is True
    assert orchestrator._is_task_cancelled_in_db("b") is False


def test_running_row_is_not_cancelled_even_when_seen(orchestrator):
    # red before the fix only because job_was_seen does not exist yet
    clear_all_jobs()
    put_job(Job(id="b", engine="xtts", status="running", created_at=1.0, chapter_file="c.txt"))
    assert orchestrator._is_task_cancelled_in_db("b", job_was_seen=True) is False


def test_api_style_task_without_a_precreated_job_still_dispatches(orchestrator, make_task):
    # queued publish creates the row, so the loop sees it and admits the task
    clear_all_jobs()
    task = make_task("t258-api")
    orchestrator.submit(task)
    task.run.assert_called_once()
    assert get_jobs()["t258-api"].status == "done"
