import pytest
import os
import io
import json
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.web import app as fastapi_app
from app.db.core import init_db

client = TestClient(fastapi_app)

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_chapters.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)
    init_db()

    # Mock settings to avoid missing default profile error
    from app.state import update_settings
    update_settings({"default_speaker_profile": "DefaultVoice"})

    yield
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_chapter_list_and_create(clean_db):
    from app.db.projects import create_project
    pid = create_project("TestProj")

    # Create chapter (Use correct field names: title, text_content)
    response = client.post(f"/api/projects/{pid}/chapters", data={"title": "Chapter 1", "text_content": "Content"})
    assert response.status_code == 200
    cid = response.json()["chapter"]["id"]

    # List chapters
    response = client.get(f"/api/projects/{pid}/chapters")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Chapter 1"

def test_chapter_crud(clean_db):
    from app.db.projects import create_project
    pid = create_project("TestProj")
    cid = client.post(f"/api/projects/{pid}/chapters", data={"title": "C1", "text_content": "T1"}).json()["chapter"]["id"]

    # Get chapter
    response = client.get(f"/api/chapters/{cid}")
    assert response.status_code == 200
    assert response.json()["title"] == "C1"

    # Update chapter
    response = client.put(f"/api/chapters/{cid}", data={"title": "C1 Updated", "text_content": "T1 Updated"})
    assert response.status_code == 200

    # Delete chapter
    response = client.delete(f"/api/chapters/{cid}")
    assert response.status_code == 200

def test_chapter_segments_sync(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    # Sync segments (triggers extraction)
    response = client.post(f"/api/chapters/{cid}/sync-segments", json={"text": "Hello. How are you?"})
    assert response.status_code == 200

    # List segments
    response = client.get(f"/api/chapters/{cid}/segments")
    assert response.status_code == 200
    assert len(response.json()["segments"]) > 0

def test_chapter_reset(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    response = client.post(f"/api/chapters/{cid}/reset")
    assert response.status_code == 200
