import pytest
import os
import uuid
from unittest.mock import patch, MagicMock
from app.db.core import init_db

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_gen.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    init_db()

    from app.state import update_settings
    update_settings({"default_speaker_profile": "Voice1"})

    yield
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_queue_and_bake(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    # Add to queue
    with patch("app.api.routers.generation.put_job"), patch("app.api.routers.generation.enqueue"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid})
        assert response.status_code == 200
        assert "queue_id" in response.json()

    # Bake
    with patch("app.api.routers.generation.put_job"), patch("app.api.routers.generation.enqueue"):
        response = client.post(f"/api/generation/bake/{cid}")
        assert response.status_code == 200
        assert "job_id" in response.json()

def test_pause_resume(clean_db, client):
    response = client.post("/api/generation/pause")
    assert response.status_code == 200

    response = client.post("/api/generation/resume")
    assert response.status_code == 200

def test_generate_segments(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    segs = get_chapter_segments(cid)
    sid = segs[0]['id']

    with patch("app.api.routers.generation.put_job"), patch("app.api.routers.generation.enqueue"):
        response = client.post("/api/segments/generate", data={"segment_ids": sid})
        assert response.status_code == 200
        assert "job_id" in response.json()
