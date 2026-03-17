import pytest
import time
import json
import threading
from app.state import update_job, get_jobs
from app.models import Job
from app.db import init_db, add_to_queue
from app.jobs import worker_loop, job_queue
import queue

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

def test_worker_progress_update():
    # 1. Create a dummy job
    jid = "test_progress_job"
    j = Job(
        id=jid,
        engine="xtts",
        chapter_file="nonexistent.txt",
        status="queued",
        created_at=time.time(),
        progress=0.0
    )
    from app.state import put_job
    put_job(j)

    # 2. Add to internal queue
    job_queue.put(jid)

    # Since we can't easily run the real worker_loop because it's already running in background
    # and would try to run real XTTS, we will test the update_job -> listeners -> broadcast chain.

    updates_received = []
    def listener(job_id, updates):
        if job_id == jid:
            updates_received.append(updates)

    from app.state import add_job_listener
    add_job_listener(listener)

    # Simulate what on_output does
    update_job(jid, progress=0.25)

    assert len(updates_received) > 0
    assert updates_received[0]["progress"] == 0.25

def test_prediction_logic():
    # Test the calculation in jobs.py if we can
    from app.jobs import _estimate_seconds

    # Test expectation for _estimate_seconds (minimum is 5)
    assert _estimate_seconds(20, 10) == 5
    assert _estimate_seconds(200, 10) == 20
