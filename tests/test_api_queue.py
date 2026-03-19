import pytest
import os
import json
from unittest.mock import patch
from app.db.core import init_db

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app
    return TestClient(fastapi_app)

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_queue.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    init_db()

    from app.state import update_settings
    update_settings({"default_speaker_profile": "DefaultVoice"})

    yield
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_queue_api(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    cid1 = create_chapter(pid, "C1", "T1")
    cid2 = create_chapter(pid, "C2", "T2")

    # Add to queue (from generation.py)
    with patch("app.api.routers.generation.enqueue"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid1})
        assert response.status_code == 200
        qid1 = response.json()["queue_id"]

        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid2})
        assert response.status_code == 200
        qid2 = response.json()["queue_id"]

    # Get queue (from queue.py)
    response = client.get("/api/processing_queue")
    assert response.status_code == 200
    queue_data = response.json()
    ids = [item["id"] for item in queue_data]
    assert ids.index(qid1) < ids.index(qid2)

    # Reorder queue
    response = client.put("/api/processing_queue/reorder", json={"queue_ids": [qid2, qid1]})
    assert response.status_code == 200

    response = client.get("/api/processing_queue")
    ids = [item["id"] for item in response.json()]
    assert ids.index(qid2) < ids.index(qid1)

    # Delete from queue
    response = client.delete(f"/api/processing_queue/{qid1}")
    assert response.status_code == 200
    response = client.get("/api/processing_queue")
    assert qid1 not in [item["id"] for item in response.json()]

    # Clear completed
    response = client.post("/api/processing_queue/clear_completed")
    assert response.status_code == 200
