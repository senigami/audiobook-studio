import pytest
from fastapi.testclient import TestClient
from app.api.web import app
from app.db import create_project, create_chapter, add_to_queue, update_queue_item, get_chapter, remove_from_queue
from app.db.state import clear_all_jobs

client = TestClient(app)

def test_finished_audio_preserved_after_job_removal():
    """
    Verifies that removing a 'done' job from the queue does NOT reset the chapter's audio status.
    """
    # 1. Setup
    clear_all_jobs()
    pid = create_project("Preserve Finished Audio Test")
    cid = create_chapter(project_id=pid, title="Test Chapter")

    # 2. Enqueue and mark as done
    qid = add_to_queue(pid, cid)
    update_queue_item(qid, "done", audio_length_seconds=10.0)

    # Verify initial state
    chap = get_chapter(cid)
    assert chap['audio_status'] == 'done'

    # 3. Remove the job from the queue
    remove_from_queue(qid)

    # 4. Verify chapter status remains 'done'
    chap_after = get_chapter(cid)
    assert chap_after['audio_status'] == 'done', "Chapter audio_status should still be 'done' after removing the finished job"

def test_queued_audio_reset_after_job_removal():
    """
    Verifies that removing a 'queued' job DOES reset the chapter's audio status.
    """
    # 1. Setup
    clear_all_jobs()
    pid = create_project("Reset Queued Audio Test")
    cid = create_chapter(project_id=pid, title="Queued Chapter")

    # 2. Enqueue
    qid = add_to_queue(pid, cid)

    # Verify initial state
    chap = get_chapter(cid)
    assert chap['audio_status'] == 'processing'

    # 3. Remove the job from the queue
    remove_from_queue(qid)

    # 4. Verify chapter status is reset to 'unprocessed'
    chap_after = get_chapter(cid)
    assert chap_after['audio_status'] == 'unprocessed', "Chapter audio_status should be 'unprocessed' after removing a queued job"

def test_clear_completed_and_cancelled():
    """
    Verifies that 'done' and 'cancelled' jobs are cleared by the clear_completed endpoint.
    """
    # 1. Setup
    from app.db import clear_queue
    clear_queue()
    pid = create_project("Clear Completed Test")
    c1 = create_chapter(pid, "Chap 1")
    c2 = create_chapter(pid, "Chap 2")
    c3 = create_chapter(pid, "Chap 3")

    q1 = add_to_queue(pid, c1)
    q2 = add_to_queue(pid, c2)
    q3 = add_to_queue(pid, c3)

    update_queue_item(q1, "done")
    update_queue_item(q2, "cancelled")
    # q3 stays 'queued'

    # 2. Call clear_completed
    response = client.post("/api/processing_queue/clear_completed")
    assert response.status_code == 200
    assert response.json()["cleared"] >= 2

    # 3. Verify queue
    response = client.get("/api/processing_queue")
    queue = response.json()
    ids = [item['id'] for item in queue]

    assert q1 not in ids, "Done job should be cleared"
    assert q2 not in ids, "Cancelled job should be cleared"
    assert q3 in ids, "Queued job should NOT be cleared"
