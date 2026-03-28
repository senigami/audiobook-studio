import pytest
import os
from pathlib import Path
from app.db.core import init_db, get_connection
from app.db.queue import (
    upsert_queue_row, add_to_queue, get_queue, clear_queue,
    update_queue_item, reconcile_queue_status, reorder_queue,
    clear_completed_queue, remove_from_queue
)
from app.db.projects import create_project
from app.db.chapters import create_chapter, get_chapter

@pytest.fixture
def db_conn():
    db_path = "/tmp/test_queue.db"
    if os.path.exists(db_path):
        os.unlink(db_path)

    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)

    init_db()
    conn = get_connection()
    yield conn
    conn.close()
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_queue_lifecycle(db_conn):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")

    # Add to queue
    qid = add_to_queue(pid, cid)
    assert qid is not None
    assert qid.startswith("job-")

    # Check chapter status updated
    assert get_chapter(cid)["audio_status"] == "processing"

    # Get queue
    q = get_queue()
    import pprint
    pprint.pprint(q)
    assert len(q) == 1
    assert q[0]["id"] == qid
    assert q[0]["status"] == "queued"

    # Duplicate add should return None
    assert add_to_queue(pid, cid) is None

    # Update to running
    update_queue_item(qid, "running")
    assert get_queue()[0]["status"] == "running"
    assert get_chapter(cid)["audio_status"] == "processing"

    # Update to done
    update_queue_item(qid, "done", audio_length_seconds=12.5, output_file="c1.wav")
    assert get_chapter(cid)["audio_status"] == "done"
    assert get_chapter(cid)["audio_length_seconds"] == 12.5

    # Verify metadata joined in get_queue
    q = get_queue()
    import pprint
    pprint.pprint(q)
    assert q[0]["predicted_audio_length"] is not None
    assert q[0]["char_count"] is not None

    # Clear completed
    count = clear_completed_queue()
    assert count == 1
    assert len(get_queue()) == 0

def test_upsert_queue_row(db_conn):
    upsert_queue_row("manual-job", status="running", custom_title="System Task")
    q = get_queue()
    import pprint
    pprint.pprint(q)
    assert len(q) == 1
    assert q[0]["id"] == "manual-job"
    assert q[0]["custom_title"] == "System Task"

def test_clear_queue(db_conn):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")
    add_to_queue(pid, cid)

    clear_queue()
    assert len(get_queue()) == 0
    assert get_chapter(cid)["audio_status"] == "unprocessed"

def test_reconcile_queue_status(db_conn):
    qid1 = "job1"
    qid2 = "job2"
    upsert_queue_row(qid1, status="running")
    upsert_queue_row(qid2, status="queued")

    reconcile_queue_status([qid1]) # qid2 should be cancelled

    q = {row["id"]: row for row in get_queue()}
    assert q[qid1]["status"] == "running"
    assert q[qid2]["status"] == "cancelled"

def test_reorder_and_remove(db_conn):
    pid = create_project("P1")
    c1 = create_chapter(pid, "C1")
    c2 = create_chapter(pid, "C2")
    q1 = add_to_queue(pid, c1)
    q2 = add_to_queue(pid, c2)

    reorder_queue([q2, q1])

    # Sort is ASC by created_at. 
    # [q2, q1] passed to reorder_queue means q2 gets lower timestamp than q1.
    # Therefore, q2 should be FIRST.
    q = get_queue()
    assert q[0]["id"] == q2
    assert q[1]["id"] == q1

    remove_from_queue(q1)
    assert len(get_queue()) == 1
    assert get_chapter(c1)["audio_status"] == "unprocessed"


def test_reconcile_queue_status_cancels_orphaned_queued_rows(db_conn):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")
    qid = add_to_queue(pid, cid)

    reconcile_queue_status([])

    q = {row["id"]: row for row in get_queue()}
    assert q[qid]["status"] == "cancelled"
    assert get_chapter(cid)["audio_status"] == "unprocessed"
