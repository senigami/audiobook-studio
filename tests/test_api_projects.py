import pytest
import io
import json
import uuid
import os
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.web import app as fastapi_app
from app.db.core import init_db, get_connection
import app.config

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

def test_list_projects(clean_db):
    from app.db.projects import create_project
    create_project("Project 1")

    response = client.get("/api/projects")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "Project 1"

def test_create_project(clean_db, tmp_path):
    cover_content = b"fake-image-content"
    cover_file = io.BytesIO(cover_content)

    with patch("app.api.routers.projects.COVER_DIR", tmp_path / "covers"):
        response = client.post("/api/projects", data={"name": "New Project", "author": "Author 1"}, files={"cover": ("cover.jpg", cover_file, "image/jpeg")})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        pid = data["project_id"]

        # Verify it exists
        resp = client.get(f"/api/projects/{pid}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Project"
        assert "/out/covers/" in resp.json()["cover_image_path"]

def test_get_project_not_found(clean_db):
    response = client.get("/api/projects/non-existent")
    assert response.status_code == 404

def test_update_project(clean_db, tmp_path):
    from app.db.projects import create_project
    pid = create_project("Old Name")

    # Not found
    response = client.put("/api/projects/wrong", data={"name": "New Name"})
    assert response.status_code == 404

    # Success with cover
    cover_file = io.BytesIO(b"new-cover")
    with patch("app.api.routers.projects.COVER_DIR", tmp_path / "covers"):
        response = client.put(f"/api/projects/{pid}", data={"name": "New Name"}, files={"cover": ("new.png", cover_file, "image/png")})
        assert response.status_code == 200

        resp = client.get(f"/api/projects/{pid}")
        assert resp.json()["name"] == "New Name"
        assert ".png" in resp.json()["cover_image_path"]

def test_delete_project(clean_db):
    from app.db.projects import create_project
    pid = create_project("To Delete")

    response = client.delete(f"/api/projects/{pid}")
    assert response.status_code == 200

    response = client.delete(f"/api/projects/{pid}")
    assert response.status_code == 404

def test_reorder_chapters(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    c1 = create_chapter(pid, "C1")
    c2 = create_chapter(pid, "C2")

    # Success
    response = client.post(f"/api/projects/{pid}/reorder_chapters", data={"chapter_ids": json.dumps([c2, c1])})
    assert response.status_code == 200

    # Bad JSON
    response = client.post(f"/api/projects/{pid}/reorder_chapters", data={"chapter_ids": "invalid-json"})
    assert response.status_code == 400

def test_assemble_project_errors(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")

    # No chapters
    response = client.post(f"/api/projects/{pid}/assemble")
    assert response.status_code == 400

    cid = create_chapter(pid, "C1")
    # Not done
    response = client.post(f"/api/projects/{pid}/assemble")
    assert response.status_code == 400

    # Project not found
    response = client.post("/api/projects/missing/assemble")
    assert response.status_code == 404

def test_assemble_project_success(clean_db, tmp_path):
    from app.db.projects import create_project, update_project
    from app.db.chapters import create_chapter, update_chapter
    pid = create_project("P1")
    update_project(pid, cover_image_path="/out/covers/mycover.jpg")
    cid = create_chapter(pid, "C1")
    update_chapter(cid, audio_status="done", audio_file_path="C1.wav")

    with patch("app.jobs.enqueue"), patch("app.state.put_job"), patch("app.api.routers.projects.COVER_DIR", tmp_path):
        response = client.post(f"/api/projects/{pid}/assemble", data={"chapter_ids": json.dumps([cid])})
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

def test_prepare_audiobook(clean_db, tmp_path):
    with patch("app.api.routers.projects.XTTS_OUT_DIR", tmp_path):
        (tmp_path / "chapter_1.mp3").write_text("audio")

        with patch("app.engines.get_audio_duration", return_value=10.0), \
             patch("app.api.routers.projects.get_jobs", return_value={}):
            response = client.get("/api/projects/audiobook/prepare")
            assert response.status_code == 200
            data = response.json()
            assert len(data["chapters"]) == 1
            assert data["chapters"][0]["filename"] == "chapter_1.mp3"

def test_list_project_audiobooks(clean_db, tmp_path):
    from app.db.projects import create_project
    pid = create_project("P1")

    m4b_dir = tmp_path / "m4b"
    m4b_dir.mkdir()
    book_file = m4b_dir / "book.m4b"
    book_file.write_text("m4b data")
    (m4b_dir / "book.jpg").write_text("cover")

    with patch("app.api.routers.projects.get_project_m4b_dir", return_value=m4b_dir), \
         patch("subprocess.run") as mock_run:

        mock_run.return_value = MagicMock(stdout=json.dumps({"format": {"duration": "100", "tags": {"title": "My Book"}}}), returncode=0)

        response = client.get(f"/api/projects/{pid}/audiobooks")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["filename"] == "book.m4b"
        assert data[0]["cover_url"] is not None
        assert data[0]["duration_seconds"] == 100.0
