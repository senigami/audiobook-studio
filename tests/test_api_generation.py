import pytest
import os
import json
import uuid
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.web import app as fastapi_app
from app.db.core import init_db

client = TestClient(fastapi_app)

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_generation.db"
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
    fastapi_app.dependency_overrides = {}

def test_generation_bake_fixed(clean_db):
    # Fixed Job init bug in generation.py line 88
    with patch("app.api.routers.generation.put_job"), \
         patch("app.api.routers.generation.enqueue"):
        response = client.post("/api/generation/bake/chap1")
        assert response.status_code == 200
        assert "job_id" in response.json()

def test_generation_cancel_and_bulk_fixed(clean_db):
    # Patch the actual sources where they are imported FROM or where they LIVE
    with patch("app.api.routers.generation.clear_job_queue"), \
         patch("app.state.delete_jobs") as mock_del_state, \
         patch("app.state.get_jobs", return_value={}):
        response = client.post("/api/generation/cancel-all")
        assert response.status_code == 200

    with patch("app.state.get_jobs", return_value={"j1": MagicMock(chapter_id="c1", status="queued")}), \
         patch("app.api.routers.generation.cancel_job_worker"):
        response = client.post("/api/chapters/c1/cancel")
        assert response.status_code == 200

def test_enqueue_single(clean_db):
    with patch("app.api.routers.generation.put_job"), \
         patch("app.api.routers.generation.enqueue"):
        response = client.post("/api/generation/enqueue-single", data={"chapter_file": "test.txt"})
        assert response.status_code == 200
        assert "job_id" in response.json()

def test_generation_add_errors(clean_db):
    # No profile
    with patch("app.api.routers.generation.get_settings", return_value={}):
        response = client.post("/api/processing_queue", data={"project_id": "p1", "chapter_id": "c1"})
        assert response.status_code == 400
        assert "No speaker profile selected" in response.json()["message"]

    # Already in queue case (db_add_to_queue returns None)
    with patch("app.api.routers.generation.get_settings", return_value={"default_speaker_profile": "P1"}), \
         patch("app.api.routers.generation.db_add_to_queue", return_value=None), \
         patch("app.db.chapters.get_connection"):
        # We need a mock for db.get_queue inside api_add_to_queue
        # But and the code also catches all exceptions at line 82
        response = client.post("/api/processing_queue", data={"project_id": "p1", "chapter_id": "c1"})
        # Should hit line 37 in generation.py if existing check finds nothing
        assert response.status_code == 400
