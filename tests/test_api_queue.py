import pytest
import os
import json
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

def test_queue_api(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.queue import add_to_queue
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    qid = add_to_queue(pid, cid)
    assert qid is not None

    # List queue
    response = client.get("/api/processing_queue")
    assert response.status_code == 200
    assert len(response.json()) == 1

    # Reorder — expects ReorderRequest with queue_ids: List[str]
    # PUT /api/processing_queue/reorder
    response = client.put("/api/processing_queue/reorder", json={"queue_ids": [qid]})
    assert response.status_code == 200

    # Delete item
    response = client.delete(f"/api/processing_queue/{qid}")
    assert response.status_code == 200

    # Clear completed
    response = client.post("/api/processing_queue/clear_completed")
    assert response.status_code == 200
