import pytest
from fastapi.testclient import TestClient
from app.api.web import app
from app.db import create_project, create_chapter, get_chapter, get_chapter_segments
from app.db.state import put_job, Job
import io

client = TestClient(app)

def test_create_chapter_with_file():
    pid = create_project("File Project")
    file_content = b"Chapter text from file"
    files = {"file": ("test.txt", io.BytesIO(file_content), "text/plain")}
    data = {"title": "File Chapter", "sort_order": 1}

    response = client.post(f"/api/projects/{pid}/chapters", data=data, files=files)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["chapter"]["text_content"] == "Chapter text from file"

def test_get_chapter_not_found():
    response = client.get("/api/chapters/non_existent_id")
    assert response.status_code == 404

def test_delete_chapter_not_found():
    response = client.delete("/api/chapters/non_existent_id")
    assert response.status_code == 404

def test_cancel_chapter_generation():
    pid = create_project("Cancel Project")
    cid = create_chapter(pid, "Cancel Chapter", "Some text")

    # Mock a job
    job = Job(id="job123", chapter_id=cid, chapter_file="test.txt", created_at=123.0, status="running", engine="xtts")
    put_job(job)

    response = client.post(f"/api/chapters/{cid}/cancel")
    assert response.status_code == 200
    assert response.json()["cancelled_count"] >= 1

def test_sync_segments():
    pid = create_project("Sync Project")
    cid = create_chapter(pid, "Sync Chapter", "Old text.")

    response = client.post(f"/api/chapters/{cid}/sync-segments", json={"text": "New updated text."})
    assert response.status_code == 200

    segments = get_chapter_segments(cid)
    assert any("New updated text" in s["text_content"] for s in segments)

def test_preview_chapter_not_found():
    import uuid
    cid = str(uuid.uuid4())
    response = client.get(f"/api/chapters/{cid}/preview")
    assert response.status_code == 404

def test_stream_chapter_not_found():
    import uuid
    cid = str(uuid.uuid4())
    response = client.get(f"/api/chapters/{cid}/stream")
    assert response.status_code == 404
