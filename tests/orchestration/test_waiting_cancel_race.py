"""A cancel that lands while a paused submit is being admitted must not be undone."""
from unittest.mock import patch

from app.db import add_to_queue, create_chapter, create_project, get_queue
from app.db.core import get_connection
from app.db.queue import update_queue_item
from app.db.state import Job, clear_all_jobs, get_jobs, put_job, update_job


def test_cancel_during_paused_admission_stays_cancelled(orchestrator, make_task):
    clear_all_jobs()
    task = make_task()
    paused = {"admitted": False, "task_type": "synthesis", "task_id": "t1",
              "waiting_reason": "Orchestrator is paused."}

    def reserve(**_kw):
        assert orchestrator.cancel("t1") is True
        return paused

    with patch("app.orchestration.scheduler.orchestrator.reserve_task_resources", side_effect=reserve):
        orchestrator.submit(task)

    assert get_jobs()["t1"].status == "cancelled"


def test_waiting_publish_does_not_revive_a_cancelled_job_or_its_queue_row():
    clear_all_jobs()
    pid = create_project("Cancel race")
    cid = create_chapter(pid, "C1", "T1")
    jid = add_to_queue(pid, cid)
    put_job(Job(id=jid, project_id=pid, chapter_id=cid, chapter_file=f"{cid}_0.txt",
                status="cancelled", created_at=1.0, engine="xtts"))
    update_queue_item(jid, "cancelled")

    update_job(jid, status="waiting_for_resources")

    assert get_jobs()[jid].status == "cancelled"
    with get_connection() as conn:
        status = conn.execute("SELECT status FROM processing_queue WHERE id = ?", (jid,)).fetchone()["status"]
    assert status == "cancelled"


def test_queued_job_still_goes_to_waiting_and_on_to_preparing():
    clear_all_jobs()
    put_job(Job(id="q1", chapter_file="c.txt", status="queued", created_at=1.0, engine="xtts"))

    update_job("q1", status="waiting_for_resources")
    assert get_jobs()["q1"].status == "waiting_for_resources"

    update_job("q1", status="preparing")
    assert get_jobs()["q1"].status == "preparing"
