import pytest
from fastapi.testclient import TestClient
from app.web import app
from app.config import COVER_DIR
from app.db import create_project, create_chapter, update_chapter
from app.state import load_state
import os
import json

client = TestClient(app)

def test_assemble_project_cover_path_resolution(tmp_path):
    # 1. Setup a project with a virtual cover path
    project_name = "Cover Test Project"
    cover_filename = "test_cover.png"
    virtual_cover_path = f"/out/covers/{cover_filename}"

    # Ensure COVER_DIR exists in the test env (handled by conftest usually, but safe to check)
    COVER_DIR.mkdir(parents=True, exist_ok=True)
    real_cover_file = COVER_DIR / cover_filename
    real_cover_file.write_text("fake image data")

    pid = create_project(project_name, cover_image_path=virtual_cover_path)

    # 2. Add a processed chapter so assembly is allowed
    cid = create_chapter(pid, "Chapter 1")
    # Mark as done so assembly doesn't error out
    update_chapter(cid, audio_status='done', audio_file_path='test.mp3')

    # 3. Trigger assembly
    response = client.post(f"/api/projects/{pid}/assemble")
    assert response.status_code == 200
    job_id = response.json()["job_id"]

    # 4. Verify the job in state has an absolute path for the cover
    state = load_state()
    job_data = state["jobs"][job_id]

    expected_absolute_path = str(COVER_DIR / cover_filename)
    assert job_data["cover_path"] == expected_absolute_path
    assert os.path.isabs(job_data["cover_path"])
    assert "out/covers" not in job_data["cover_path"]

def test_assemble_project_no_cover():
    # Verify it still works without a cover
    pid = create_project("No Cover Project")
    cid = create_chapter(pid, "Chapter 1")
    update_chapter(cid, audio_status='done', audio_file_path='test.mp3')

    response = client.post(f"/api/projects/{pid}/assemble")
    assert response.status_code == 200
    job_id = response.json()["job_id"]

    state = load_state()
    job_data = state["jobs"][job_id]
    assert job_data["cover_path"] is None
