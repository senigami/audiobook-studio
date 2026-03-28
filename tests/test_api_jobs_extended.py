import pytest
from fastapi.testclient import TestClient
import time
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.web import app
from app.models import Job
from app.state import put_job, delete_jobs, clear_all_jobs
from app.config import XTTS_OUT_DIR

client = TestClient(app)

@pytest.fixture
def clean_jobs():
    clear_all_jobs()
    yield
    clear_all_jobs()

def test_api_jobs_dynamic_progress(clean_jobs):
    # Create a running job with eta
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

    with patch("app.jobs.reconcile.cleanup_and_reconcile") as mock_cleanup:
        response = client.get("/api/jobs")
        assert response.status_code == 200
        data = response.json()
        mock_cleanup.assert_not_called()

    # Find our job
    job_data = next((j for j in data if j["id"] == jid), None)
    assert job_data is not None
    # Progress should be around 0.1 (10/100)
    assert 0.09 <= job_data["progress"] <= 0.11


def test_api_jobs_does_not_block_on_reconciliation(clean_jobs):
    poisoned = AssertionError("cleanup_and_reconcile should not run inside /api/jobs")

    with (
        patch("app.api.routers.jobs.cleanup_and_reconcile", side_effect=poisoned, create=True),
        patch("app.jobs.cleanup_and_reconcile", side_effect=poisoned),
        patch("app.jobs.reconcile.cleanup_and_reconcile", side_effect=poisoned),
    ):
        response = client.get("/api/jobs")

    assert response.status_code == 200
    assert response.elapsed.total_seconds() < 1.0

def test_api_jobs_auto_discovery(clean_jobs, tmp_path, monkeypatch):
    # Mock XTTS_OUT_DIR to a temp path
    mock_out_dir = tmp_path / "xtts_out"
    mock_out_dir.mkdir()
    monkeypatch.setattr("app.api.routers.jobs.XTTS_OUT_DIR", mock_out_dir)

    # Create a dummy chapter file in state via legacy_list_chapters mock
    mock_chapter = MagicMock()
    mock_chapter.name = "discovered.txt"
    monkeypatch.setattr("app.api.routers.jobs.legacy_list_chapters", lambda: [mock_chapter])

    # Create the output file
    (mock_out_dir / "discovered.mp3").write_text("audio")

    response = client.get("/api/jobs")
    assert response.status_code == 200
    data = response.json()

    # Should find the auto-discovered job
    job_data = next((j for j in data if j["chapter_file"] == "discovered.txt"), None)
    assert job_data is not None
    assert job_data["status"] == "done"
    assert job_data["id"] == "discovered-discovered.txt"

def test_api_get_job_not_found(clean_jobs):
    response = client.get("/api/jobs/nonexistent")
    assert response.status_code == 404
    assert response.json()["message"] == "Job not found"

def test_api_cancel_job():
    with patch("app.api.routers.jobs.cancel_job_worker") as mock_cancel:
        response = client.post("/api/cancel", data={"job_id": "test_id"})
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        mock_cancel.assert_called_once_with("test_id")

def test_api_update_job_title(clean_jobs):
    jid = "test_update_title"
    job = Job(
        id=jid,
        engine="xtts",
        chapter_file="chapter_to_update.txt",
        status="queued",
        created_at=time.time()
    )
    put_job(job)

    response = client.post("/api/jobs/update-title", data={
        "chapter_file": "chapter_to_update.txt",
        "new_title": "New Awesome Title"
    })
    assert response.status_code == 200
    assert response.json()["updated"] == 1

    # Verify in state
    from app.state import get_jobs
    updated_job = get_jobs()[jid]
    assert updated_job.custom_title == "New Awesome Title"


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

    response = client.get("/api/jobs")
    assert response.status_code == 200
    data = response.json()

    returned_ids = {j["id"] for j in data}
    assert "job-a" in returned_ids
    assert "job-b" in returned_ids
