import pytest
import os
import json
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
    # Create
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

    # Reorder
    r = client.post(f"/api/projects/{pid}/reorder_chapters", data={"chapter_ids": json.dumps([cid])})
    assert r.status_code == 200

def test_project_audiobooks_and_assemble(clean_db):
    pid = client.post("/api/projects", data={"name": "P1"}).json()["project_id"]
    # Create a chapter and mark it as done
    from app.db.chapters import create_chapter, update_chapter
    cid = create_chapter(pid, "C1", "T1")
    update_chapter(cid, audio_status="done", audio_file_path="C1.wav")

    # List audiobooks
    response = client.get(f"/api/projects/{pid}/audiobooks")
    assert response.status_code == 200

    # Prepare
    response = client.get("/api/projects/audiobook/prepare")
    assert response.status_code == 200

    # Assemble
    from unittest.mock import patch
    with patch("app.api.routers.projects.put_job"), patch("app.api.routers.projects.enqueue"):
        # We don't send 'chapters' list explicitly if we want it to use all chapters from project
        # In the router: it lists chapters for the project.
        response = client.post(f"/api/projects/{pid}/assemble", 
                               data={"title": "Book", "author": "Me", "narrator": "V1"})
        assert response.status_code == 200
