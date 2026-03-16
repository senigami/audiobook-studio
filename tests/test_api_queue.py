import pytest
import os
import json
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.web import app as fastapi_app
from app.db.core import init_db

client = TestClient(fastapi_app)

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

    yield

    if os.path.exists(db_path):
        os.unlink(db_path)
    fastapi_app.dependency_overrides = {}

def test_list_and_add_to_queue(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")

    # Add - In generation.py, POST /api/processing_queue
    with patch("app.api.routers.generation.get_settings", return_value={"default_speaker_profile": "P1"}), \
         patch("app.api.routers.generation.get_project_text_dir", return_value=tmp_path), \
         patch("app.api.routers.generation.put_job"), \
         patch("app.api.routers.generation.enqueue"):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid})
        assert response.status_code == 200
        qid = response.json()["queue_id"]

    # List - In queue.py, GET /api/processing_queue
    response = client.get("/api/processing_queue")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert "predicted_audio_length" in data[0]
    assert "char_count" in data[0]

def test_queue_item_manipulation(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.queue import add_to_queue
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")
    qid = add_to_queue(pid, cid)

    # Reorder - In queue.py, PUT /api/processing_queue/reorder
    response = client.put("/api/processing_queue/reorder", json={"queue_ids": [qid]})
    assert response.status_code == 200

    # Delete single - In queue.py, DELETE /api/processing_queue/{queue_id}
    with patch("app.api.routers.queue.cancel_job"):
        response = client.delete(f"/api/processing_queue/{qid}")
        assert response.status_code == 200

def test_queue_bulk_actions(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.queue import add_to_queue, update_queue_item
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")
    qid = add_to_queue(pid, cid)
    update_queue_item(qid, "done")

    # Clear completed (history) - In queue.py, POST /api/processing_queue/clear_completed
    response = client.post("/api/processing_queue/clear_completed")
    assert response.status_code == 200

    # Clear all - In queue.py, POST /api/processing_queue/clear
    add_to_queue(pid, cid)
    response = client.post("/api/processing_queue/clear")
    assert response.status_code == 200

    # Mass delete - In queue.py, DELETE /api/processing_queue
    response = client.delete("/api/processing_queue")
    assert response.status_code == 200

def test_queue_state_actions(clean_db):
    # Resume - In generation.py, POST /api/generation/resume
    with patch("app.api.routers.generation.set_paused") as mock_set:
        response = client.post("/api/generation/resume")
        assert response.status_code == 200
        mock_set.assert_called_with(False)

    # Pause
    with patch("app.api.routers.generation.set_paused") as mock_set:
        response = client.post("/api/generation/pause")
        assert response.status_code == 200
        mock_set.assert_called_with(True)

def test_queue_add_duplicate(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.queue import add_to_queue
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")
    add_to_queue(pid, cid)

    # According to generation.py: if already in queue and not completed, returns 200 with queue_id
    with patch("app.api.routers.generation.get_settings", return_value={"default_speaker_profile": "P1"}):
        response = client.post("/api/processing_queue", data={"project_id": pid, "chapter_id": cid})
        assert response.status_code == 200
        assert "queue_id" in response.json()
