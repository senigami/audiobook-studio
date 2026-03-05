import time
import pytest
from app.db import init_db, update_queue_item, get_queue, create_project, create_chapter, add_to_queue

def test_job_timing_lifecycle():
    """
    Test that started_at and completed_at are correctly tracked in the database
    as a job progresses through its lifecycle.
    """
    # 1. Setup a project and chapter
    pid = create_project("Timing Test Project")
    cid = create_chapter(pid, "Timing Chapter")

    # 2. Add to queue (initially 'queued')
    qid = add_to_queue(pid, cid)

    queue = get_queue()
    item = next(q for q in queue if q['id'] == qid)

    assert item['status'] == 'queued'
    assert item['started_at'] is None
    assert item['completed_at'] is None

    # 3. Mark as 'preparing' (should set started_at)
    update_queue_item(qid, 'preparing')

    queue = get_queue()
    item = next(q for q in queue if q['id'] == qid)
    assert item['status'] == 'preparing'
    assert item['started_at'] is not None
    assert item['completed_at'] is None

    first_started_at = item['started_at']
    time.sleep(0.1)

    # 4. Mark as 'running' (should NOT change started_at)
    update_queue_item(qid, 'running')

    queue = get_queue()
    item = next(q for q in queue if q['id'] == qid)
    assert item['status'] == 'running'
    assert item['started_at'] == first_started_at

    # 5. Mark as 'done' (should set completed_at)
    update_queue_item(qid, 'done')

    queue = get_queue()
    item = next(q for q in queue if q['id'] == qid)
    assert item['status'] == 'done'
    assert item['started_at'] == first_started_at
    assert item['completed_at'] is not None
    assert item['completed_at'] > first_started_at

def test_job_cancellation_timing():
    """Test that cancellation also sets completed_at."""
    pid = create_project("Timing Cancel Project")
    cid = create_chapter(pid, "Cancel Chapter")
    qid = add_to_queue(pid, cid)

    update_queue_item(qid, 'running')
    update_queue_item(qid, 'cancelled')

    queue = get_queue()
    item = next(q for q in queue if q['id'] == qid)
    assert item['status'] == 'cancelled'
    assert item['started_at'] is not None
    assert item['completed_at'] is not None
