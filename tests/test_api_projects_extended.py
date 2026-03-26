import io
from fastapi.testclient import TestClient
from app.web import app
from app.db import create_project, get_project, create_chapter, update_chapter

client = TestClient(app)

def test_create_project_with_cover():
    cover_content = b"fake image content"
    files = {"cover": ("cover.jpg", io.BytesIO(cover_content), "image/jpeg")}
    data = {"name": "Cover Project", "series": "Series 1", "author": "Author 1"}

    response = client.post("/api/projects", data=data, files=files)
    assert response.status_code == 200
    pid = response.json()["project_id"]

    project = get_project(pid)
    assert project["cover_image_path"] == f"/projects/{pid}/cover/cover.jpg"

def test_update_project_with_cover():
    pid = create_project("Update Project")
    cover_content = b"new fake image content"
    files = {"cover": ("new_cover.jpg", io.BytesIO(cover_content), "image/jpeg")}
    data = {"name": "Updated Name"}

    response = client.put(f"/api/projects/{pid}", data=data, files=files)
    assert response.status_code == 200

    project = get_project(pid)
    assert project["name"] == "Updated Name"
    assert project["cover_image_path"] == f"/projects/{pid}/cover/cover.jpg"

def test_list_project_audiobooks():
    pid = create_project("Audiobook List Project")
    # This route tries to run ffprobe, so it might fail if ffmpeg isn't installed.
    # But let's check it returns something (even if empty) or handles failures.
    response = client.get(f"/api/projects/{pid}/audiobooks")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_assemble_project_error_no_chapters():
    pid = create_project("Empty Project")
    response = client.post(f"/api/projects/{pid}/assemble")
    assert response.status_code == 400
    assert "No chapters found" in response.json()["error"]

def test_assemble_project_error_not_processed():
    pid = create_project("Unprocessed Project")
    cid = create_chapter(pid, "Unprocessed Chapter", "Text")

    response = client.post(f"/api/projects/{pid}/assemble")
    assert response.status_code == 400
    assert "not processed yet" in response.json()["error"]

def test_prepare_audiobook_modal():
    response = client.get("/api/projects/audiobook/prepare")
    assert response.status_code == 200
    assert "chapters" in response.json()

def test_reorder_chapters_error():
    pid = create_project("Reorder Error Project")
    # Invalid JSON
    response = client.post(f"/api/projects/{pid}/reorder_chapters", data={"chapter_ids": "invalid-json"})
    assert response.status_code == 400
