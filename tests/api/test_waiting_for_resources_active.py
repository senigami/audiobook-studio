"""A job held as waiting_for_resources is still a live, cancellable, clearable job."""
from fastapi.testclient import TestClient

from app.api.web import app
from app.db import add_to_queue, create_chapter, create_project, get_queue
from app.db.core import get_connection
from app.db.queue import update_queue_item
from app.db.segments import _chapter_has_active_generation
from app.db.state import Job, clear_all_jobs, get_jobs, put_job

client = TestClient(app)


def _waiting_job(pid, cid):
    jid = add_to_queue(pid, cid)
    update_queue_item(jid, "waiting_for_resources")
    put_job(Job(
        id=jid, project_id=pid, chapter_id=cid, chapter_file=f"{cid}_0.txt",
        status="waiting_for_resources", created_at=1.0, engine="xtts", custom_title="C1",
    ))
    return jid


def test_queue_listing_does_not_cancel_a_waiting_row_with_a_live_job():
    clear_all_jobs()
    pid = create_project("Waiting listing")
    cid = create_chapter(pid, "C1", "T1")
    jid = _waiting_job(pid, cid)

    row = next(i for i in client.get("/api/processing_queue").json() if i["id"] == jid)

    assert row["status"] == "waiting_for_resources"


def test_clear_all_removes_a_waiting_job_from_memory_and_the_queue():
    clear_all_jobs()
    pid = create_project("Waiting clear")
    cid = create_chapter(pid, "C1", "T1")
    jid = _waiting_job(pid, cid)

    assert client.delete("/api/processing_queue").status_code == 200

    assert jid not in get_jobs()
    assert jid not in [r["id"] for r in get_queue()]


def test_chapter_cancel_cancels_a_waiting_queue_row():
    clear_all_jobs()
    pid = create_project("Waiting cancel")
    cid = create_chapter(pid, "C1", "T1")
    jid = add_to_queue(pid, cid)
    update_queue_item(jid, "waiting_for_resources")

    assert client.post(f"/api/chapters/{cid}/cancel").status_code == 200

    with get_connection() as conn:
        status = conn.execute("SELECT status FROM processing_queue WHERE id = ?", (jid,)).fetchone()["status"]
    assert status == "cancelled"


def test_waiting_job_counts_as_active_generation_for_its_chapter():
    clear_all_jobs()
    pid = create_project("Waiting active")
    cid = create_chapter(pid, "C1", "T1")
    jid = add_to_queue(pid, cid)
    update_queue_item(jid, "waiting_for_resources")
    assert _chapter_has_active_generation(cid) is True

    with get_connection() as conn:
        conn.execute("DELETE FROM processing_queue WHERE id = ?", (jid,))
        conn.commit()
    put_job(Job(
        id="mem-wait", project_id=pid, chapter_id=cid, chapter_file=f"{cid}_0.txt",
        status="waiting_for_resources", created_at=1.0, engine="xtts",
    ))
    assert _chapter_has_active_generation(cid) is True


def test_terminal_latch_holds_against_a_waiting_frame_but_clears_for_queued():
    from app.api.ws import _terminal_latched, clear_terminal_latch

    clear_terminal_latch("wait-latch")
    _terminal_latched("wait-latch", "running", "done")

    assert _terminal_latched("wait-latch", "done", "waiting_for_resources") is True
    assert _terminal_latched("wait-latch", "done", "queued") is False
    clear_terminal_latch("wait-latch")
