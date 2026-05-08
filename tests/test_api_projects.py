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

def test_project_crud(clean_db, client):
    # Create
    response = client.post("/api/projects", data={"name": "New Project", "speaker_profile_name": "Woman - New Zealand"})
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
    assert response.json()["speaker_profile_name"] == "Woman - New Zealand"

    # Update
    response = client.put(f"/api/projects/{pid}", data={"name": "Updated Project", "speaker_profile_name": "Test"})
    assert response.status_code == 200
    assert client.get(f"/api/projects/{pid}").json()["name"] == "Updated Project"
    assert client.get(f"/api/projects/{pid}").json()["speaker_profile_name"] == "Test"

    response = client.put(f"/api/projects/{pid}", data={"speaker_profile_name": "__USE_DEFAULT__"})
    assert response.status_code == 200
    assert client.get(f"/api/projects/{pid}").json()["speaker_profile_name"] is None

    # Delete
    response = client.delete(f"/api/projects/{pid}")
    assert response.status_code == 200
    assert client.get(f"/api/projects/{pid}").status_code == 404


def test_project_list_and_detail_do_not_migrate_on_read(clean_db, client):
    pid = client.post("/api/projects", data={"name": "Fast List Project"}).json()["project_id"]

    with patch("app.domain.projects.migration.migrate_project_to_v2") as migrate:
        response = client.get("/api/projects")

    assert response.status_code == 200
    assert any(project["id"] == pid for project in response.json())
    migrate.assert_not_called()

    with patch("app.domain.projects.migration.migrate_project_to_v2") as migrate:
        response = client.get(f"/api/projects/{pid}")

    assert response.status_code == 200
    migrate.assert_not_called()


def test_project_chapters(clean_db, client):
    pid = client.post("/api/projects", data={"name": "P1"}).json()["project_id"]

    # Create chapters
    r1 = client.post(f"/api/projects/{pid}/chapters",
                     data={"title": "Chapter 1", "text_content": "Hello world."})
    r2 = client.post(f"/api/projects/{pid}/chapters",
                     data={"title": "Chapter 2", "text_content": "Second chapter."})
    assert r1.status_code == 200
    assert r2.status_code == 200
    cid1 = r1.json()["chapter"]["id"]
    cid2 = r2.json()["chapter"]["id"]

    # List chapters
    r = client.get(f"/api/projects/{pid}/chapters")
    assert r.status_code == 200
    assert [c["title"] for c in r.json()] == ["Chapter 1", "Chapter 2"]

    # Reorder and verify the order changes
    r = client.post(f"/api/projects/{pid}/reorder_chapters", data={"chapter_ids": json.dumps([cid2, cid1])})
    assert r.status_code == 200

    r = client.get(f"/api/projects/{pid}/chapters")
    assert [c["id"] for c in r.json()] == [cid2, cid1]

def test_project_audiobooks_and_assemble(clean_db, client):
    pid = client.post("/api/projects", data={"name": "P1"}).json()["project_id"]
    # Create a chapter and mark it as done
    from app.db.chapters import create_chapter, update_chapter
    cid = create_chapter(pid, "C1", "T1")
    # Create a physical file so resolve_chapter_asset_path finds it
    from app.config import get_chapter_dir
    c_dir = get_chapter_dir(pid, cid)
    c_dir.mkdir(parents=True, exist_ok=True)
    (c_dir / "chapter.wav").write_text("dummy audio")
    update_chapter(cid, audio_status="done", audio_file_path="chapter.wav")

    # List audiobooks
    response = client.get(f"/api/projects/{pid}/audiobooks")
    assert response.status_code == 200


    # Assemble
    from unittest.mock import patch
    with patch("app.api.routers.projects_assembly.put_job") as mock_put_job, \
         patch("app.api.routers.projects_assembly.create_orchestrator") as mock_create_orch:
        mock_orch = mock_create_orch.return_value
        # We don't send 'chapters' list explicitly if we want it to use all chapters from project
        response = client.post(f"/api/projects/{pid}/assemble", 
                               data={"title": "Book", "author": "Me", "narrator": "V1"})
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert "job_id" in response.json()
        mock_put_job.assert_called_once()
        mock_orch.submit.assert_called_once()
