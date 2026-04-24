import pytest
import os
import io
import json
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.db.core import init_db

@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from app.web import app as fastapi_app
    return TestClient(fastapi_app)

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

    from app.state import update_settings
    update_settings({"default_speaker_profile": "DefaultVoice"})

    yield
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_chapter_list_and_create(clean_db, client):
    from app.db.projects import create_project
    pid = create_project("TestProj")

    response = client.post(f"/api/projects/{pid}/chapters", data={"title": "Chapter 1", "text_content": "Content"})
    assert response.status_code == 200
    cid = response.json()["chapter"]["id"]

    response = client.get(f"/api/projects/{pid}/chapters")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title"] == "Chapter 1"

def test_chapter_crud(clean_db, client):
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

    response = client.put(f"/api/chapters/{cid}", data={"speaker_profile_name": "XTTS Voice"})
    assert response.status_code == 200
    assert response.json()["chapter"]["speaker_profile_name"] == "XTTS Voice"

    response = client.get(f"/api/chapters/{cid}")
    assert response.status_code == 200
    assert response.json()["speaker_profile_name"] == "XTTS Voice"

    response = client.put(f"/api/chapters/{cid}", data={"speaker_profile_name": "__USE_DEFAULT__"})
    assert response.status_code == 200
    assert response.json()["chapter"]["speaker_profile_name"] is None

    response = client.get(f"/api/chapters/{cid}")
    assert response.status_code == 200
    assert response.json()["speaker_profile_name"] is None

    # Delete chapter
    response = client.delete(f"/api/chapters/{cid}")
    assert response.status_code == 200

def test_chapter_segments_sync_and_update(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import get_chapter_segments
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "Hello world.")

    # Sync segments
    response = client.post(f"/api/chapters/{cid}/sync-segments", json={"text": "Hello. How are you?"})
    assert response.status_code == 200

    # List segments
    response = client.get(f"/api/chapters/{cid}/segments")
    assert response.status_code == 200
    segs = response.json()["segments"]
    assert len(segs) > 0
    sid = segs[0]["id"]

    # Update segment
    response = client.put(f"/api/segments/{sid}", json={"text_content": "Updated segment text"})
    assert response.status_code == 200
    assert get_chapter_segments(cid)[0]["text_content"] == "Updated segment text"

    # Bulk status update without a backing file gets normalized back to
    # unprocessed when segments are reloaded from the DB/disk view.
    response = client.post(f"/api/chapters/{cid}/segments/bulk-status", json={"segment_ids": [sid], "status": "done"})
    assert response.status_code == 200
    assert get_chapter_segments(cid)[0]["audio_status"] == "unprocessed"

    # Bulk update
    response = client.post("/api/segments/bulk-update", json={"segment_ids": [sid], "updates": {"audio_status": "done"}})
    assert response.status_code == 200

def test_chapter_cancel_and_reset(clean_db, client):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    # Cancel
    response = client.post(f"/api/chapters/{cid}/cancel")
    assert response.status_code == 200

    # Reset
    response = client.post(f"/api/chapters/{cid}/reset")
    assert response.status_code == 200

def test_export_and_stream(clean_db, tmp_path, client):
    from app.web import app as fastapi_app
    from app.db.projects import create_project
    from app.db.chapters import create_chapter, update_chapter
    from app.api.routers.chapters import get_xtts_out_dir
    pid = create_project("P1")
    cid = create_chapter(pid, "C1", "T1")

    fastapi_app.dependency_overrides[get_xtts_out_dir] = lambda: tmp_path

    # Create a dummy wav
    wav_file = tmp_path / f"{cid}.wav"
    wav_file.write_bytes(b"RIFF...")

    # Stream
    response = client.get(f"/api/chapters/{cid}/stream")
    assert response.status_code == 200

    # Export sample
    response = client.post(f"/api/chapters/{cid}/export-sample")
    assert response.status_code == 200
    expected_url = f"/api/projects/{pid}/chapters/{cid}/assets/audio"
    assert response.json()["url"].startswith(expected_url)

    fastapi_app.dependency_overrides = {}
