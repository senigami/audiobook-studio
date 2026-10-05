import pytest
from fastapi.testclient import TestClient
import time
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.api.web import app
from app.db.models import Job
from app.db.state import put_job, delete_jobs, clear_all_jobs


client = TestClient(app)

@pytest.fixture
def clean_jobs():
    clear_all_jobs()
    yield
    clear_all_jobs()

def test_api_jobs_returns_authoritative_running_progress(clean_jobs):
    # REST returns persisted ground truth; the frontend owns predictive motion.
    jid = "test_running_job"
    now = time.time()
    job = Job(
        id=jid,
        engine="xtts",
        chapter_file="chapter1.txt",
        status="running",
        started_at=now - 10,
        eta_seconds=100,
        created_at=now
    )
    put_job(job)

    with client.websocket_connect("/ws") as websocket:
        websocket.send_json({"type": "jobs_snapshot_request"})
        data = websocket.receive_json()["jobs"]

    job_data = next((j for j in data if j["id"] == jid), None)
    assert job_data is not None
    assert job_data["progress"] == 0.0


def test_api_jobs_uses_authoritative_progress_when_segment_tracking_is_active(clean_jobs):
    jid = "test_segment_job"
    now = time.time()
    job = Job(
        id=jid,
        engine="xtts",
        chapter_file="chapter1.txt",
        status="running",
        started_at=now - 50,
        eta_seconds=100,
        created_at=now,
        progress=0.22,
        active_segment_id="seg-1",
        active_segment_progress=0.75,
    )
    put_job(job)

    with client.websocket_connect("/ws") as websocket:
        websocket.send_json({"type": "jobs_snapshot_request"})
        data = websocket.receive_json()["jobs"]

    job_data = next((j for j in data if j["id"] == jid), None)
    assert job_data is not None
    assert job_data["progress"] == 0.22


def test_api_jobs_preserves_zero_running_progress_when_segment_id_exists_but_segment_progress_is_idle(clean_jobs):
    jid = "test_segment_idle_job"
    now = time.time()
    job = Job(
        id=jid,
        engine="xtts",
        chapter_file="chapter1.txt",
        status="running",
        started_at=now - 20,
        eta_seconds=100,
        created_at=now,
        progress=0.0,
        active_segment_id="seg-1",
        active_segment_progress=0.0,
    )
    put_job(job)

    with client.websocket_connect("/ws") as websocket:
        websocket.send_json({"type": "jobs_snapshot_request"})
        data = websocket.receive_json()["jobs"]

    job_data = next((j for j in data if j["id"] == jid), None)
    assert job_data is not None
    assert job_data["progress"] == 0.0


def test_api_jobs_preserves_zero_preparing_progress_when_started(clean_jobs):
    jid = "test_preparing_reload_job"
    now = time.time()
    job = Job(
        id=jid,
        engine="xtts",
        chapter_file="chapter1.txt",
        status="preparing",
        started_at=now - 20,
        eta_seconds=100,
        created_at=now,
        progress=0.0,
    )
    put_job(job)

    with client.websocket_connect("/ws") as websocket:
        websocket.send_json({"type": "jobs_snapshot_request"})
        data = websocket.receive_json()["jobs"]

    job_data = next((j for j in data if j["id"] == jid), None)
    assert job_data is not None
    assert job_data["progress"] == 0.0


def test_api_jobs_does_not_block_on_reconciliation(clean_jobs):
    with client.websocket_connect("/ws") as websocket:
        start_time = time.time()
        websocket.send_json({"type": "jobs_snapshot_request"})
        websocket.receive_json()
        assert (time.time() - start_time) < 1.0





def test_api_jobs_returns_multiple_live_jobs_for_same_chapter_file(clean_jobs):
    now = time.time()
    put_job(Job(
        id="job-a",
        engine="mixed",
        chapter_file="overview.txt",
        status="queued",
        created_at=now,
    ))
    put_job(Job(
        id="job-b",
        engine="mixed",
        chapter_file="overview.txt",
        status="queued",
        created_at=now + 1,
    ))

    with client.websocket_connect("/ws") as websocket:
        websocket.send_json({"type": "jobs_snapshot_request"})
        data = websocket.receive_json()["jobs"]

    returned_ids = {j["id"] for j in data}
    assert "job-a" in returned_ids
    assert "job-b" in returned_ids


def test_api_jobs_preserves_live_metadata_fields(clean_jobs):
    now = time.time()
    put_job(Job(
        id="job-live-metadata",
        engine="mixed",
        chapter_file="chapter.txt",
        status="running",
        created_at=now,
        updated_at=now + 5,
        progress=0.55,
        eta_seconds=12,
        # Task 007: the snapshot handler routes each row through enrich(sample=False),
        # which replaces the raw Job.eta_confidence string/None with the §4A.2 float.
        # Asserting the raw string value here is no longer correct — the contract is
        # that eta_confidence is a numeric float in the snapshot, not the stored string.
        eta_confidence="stable",
        reason_code="resource_wait_gpu",
        active_render_batch_id="batch-1",
        active_render_batch_progress=0.6,
    ))

    with client.websocket_connect("/ws") as websocket:
        websocket.send_json({"type": "jobs_snapshot_request"})
        data = websocket.receive_json()["jobs"]

    job_data = next((j for j in data if j["id"] == "job-live-metadata"), None)
    assert job_data is not None
    assert job_data["updated_at"] == now + 5
    # Task 007: eta_confidence is now a §4A.2 float from enrich(sample=False),
    # not the raw "stable" string stored in the Job model.
    assert isinstance(job_data["eta_confidence"], float), (
        f"After Task 007 wiring, eta_confidence must be a §4A.2 float, "
        f"got {type(job_data['eta_confidence'])}: {job_data['eta_confidence']!r}"
    )
    assert 0.0 <= job_data["eta_confidence"] <= 1.0
    assert job_data["reason_code"] == "resource_wait_gpu"
    assert job_data["active_render_batch_id"] == "batch-1"
    assert job_data["active_render_batch_progress"] == 0.6
