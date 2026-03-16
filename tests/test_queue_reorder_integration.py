import pytest
import os
from unittest.mock import patch, MagicMock
import queue
from app.jobs.core import job_queue, assembly_queue
from app.jobs import sync_memory_queue
from app.db.core import init_db
from app.db.queue import upsert_queue_row

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_queue_sync.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path

    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    init_db()

    # Clear memory queues
    while not job_queue.empty():
        job_queue.get()
        job_queue.task_done()
    while not assembly_queue.empty():
        assembly_queue.get()
        assembly_queue.task_done()

    yield

    if os.path.exists(db_path):
        os.unlink(db_path)

def test_sync_memory_queue_priority(clean_db):
    # Insert jobs out of order in DB
    # Job 1 (older), Job 2 (newer)
    from app.db.core import get_connection
    with get_connection() as conn:
        cursor = conn.cursor()
        upsert_queue_row("job-old", status="queued")
        upsert_queue_row("job-new", status="queued")
        # Set timestamps manually: job-old (100.0), job-new (200.0)
        cursor.execute("UPDATE processing_queue SET created_at = 100.0 WHERE id = 'job-old'")
        cursor.execute("UPDATE processing_queue SET created_at = 200.0 WHERE id = 'job-new'")
        conn.commit()

    # In ASC sort, job-old (100.0) is FIRST.
    # sync_memory_queue should put job-old into the FIFO queue first.

    sync_memory_queue()

    assert job_queue.qsize() == 2
    first = job_queue.get()
    second = job_queue.get()

    assert first == "job-old"
    assert second == "job-new"
