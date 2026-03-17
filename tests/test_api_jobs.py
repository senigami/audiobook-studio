import pytest
import os
import time
from pathlib import Path
from app.db.core import init_db
from app.models import Job

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_jobs.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    init_db()
    yield
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_jobs_api(clean_db, tmp_path, client, monkeypatch):
    from app.state import put_job, get_jobs

    # Use monkeypatch so it's restored after the test!
    from app.api.routers import chapters
    monkeypatch.setattr(chapters, "CHAPTER_DIR", tmp_path)
    from app.jobs import reconcile
    monkeypatch.setattr(reconcile, "CHAPTER_DIR", tmp_path)

    chapter_file = "test.txt"
    (tmp_path / chapter_file).write_text("dummy content")

    # Create a dummy job in memory
    jid = "test-job-1"
    job = Job(id=jid, engine="xtts", chapter_file=chapter_file, status="queued", created_at=time.time())
    put_job(job)

    # List jobs
    response = client.get("/api/jobs")
    assert response.status_code == 200
    assert any(j["id"] == jid for j in response.json())

    # Get job details
    response = client.get(f"/api/jobs/{jid}")
    assert response.status_code == 200
    assert response.json()["id"] == jid

    # Update title
    response = client.post("/api/jobs/update-title", data={"chapter_file": chapter_file, "new_title": "New Title"})
    assert response.status_code == 200
    assert get_jobs()[jid].custom_title == "New Title"

    # Cancel job
    response = client.post("/api/cancel", data={"job_id": jid})
    assert response.status_code == 200

    # Active job
    response = client.get("/api/active_job")
    assert response.status_code == 200
