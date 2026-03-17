import pytest
import os
from fastapi.testclient import TestClient
from app.web import app as fastapi_app
from app.db.core import init_db

client = TestClient(fastapi_app)

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_projects.db"
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

def test_project_crud(clean_db):
    # Create — returns {"status": "ok", "project_id": pid}
    response = client.post("/api/projects", data={"name": "New Project"})
    assert response.status_code == 200
    pid = response.json()["project_id"]

    # List
    response = client.get("/api/projects")
    assert response.status_code == 200
    assert any(p["id"] == pid for p in response.json())

    # Get
    response = client.get(f"/api/projects/{pid}")
    assert response.status_code == 200
    assert response.json()["name"] == "New Project"

    # Update
    response = client.put(f"/api/projects/{pid}", data={"name": "Updated Project"})
    assert response.status_code == 200

    # Delete
    response = client.delete(f"/api/projects/{pid}")
    assert response.status_code == 200

def test_project_chapters(clean_db):
    pid = client.post("/api/projects", data={"name": "P1"}).json()["project_id"]

    # Create chapter
    r = client.post(f"/api/projects/{pid}/chapters",
                    data={"title": "Chapter 1", "text_content": "Hello world."})
    assert r.status_code == 200
    cid = r.json()["chapter"]["id"]

    # List chapters
    r = client.get(f"/api/projects/{pid}/chapters")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["title"] == "Chapter 1"

    # Reorder (single chapter, trivial)
    r = client.post(f"/api/projects/{pid}/reorder_chapters", data={"chapter_ids": cid})
    assert r.status_code == 200
