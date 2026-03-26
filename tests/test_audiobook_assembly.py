import pytest
from fastapi.testclient import TestClient
from app.web import app
from app.config import COVER_DIR, get_project_cover_dir
from app.db import create_project, create_chapter, update_chapter
from app.db.projects import migrate_legacy_project_covers
from app.state import load_state
import os

client = TestClient(app)

def test_assemble_project_cover_path_resolution(tmp_path):
    # 1. Setup a project with a virtual cover path
    project_name = "Cover Test Project"
    pid = create_project(project_name)
    cover_dir = get_project_cover_dir(pid)
    cover_dir.mkdir(parents=True, exist_ok=True)
    cover_filename = "cover.png"
    real_cover_file = cover_dir / cover_filename
    real_cover_file.write_text("fake image data")
    virtual_cover_path = f"/projects/{pid}/cover/{cover_filename}"

    from app.db import update_project
    update_project(pid, cover_image_path=virtual_cover_path)

    # 2. Add a processed chapter so assembly is allowed
    cid = create_chapter(pid, "Chapter 1")
    # Mark as done so assembly doesn't error out
    update_chapter(cid, audio_status='done', audio_file_path='test.mp3')

    # 3. Trigger assembly
    response = client.post(f"/api/projects/{pid}/assemble")
    assert response.status_code == 200
    job_id = response.json()["job_id"]

    # 4. Verify the job in state has an absolute path for the cover, unique filename, and metadata title
    state = load_state()
    job_data = state["jobs"][job_id]

    # Unique filename check
    assert project_name in job_data["chapter_file"]
    assert job_data["chapter_file"] != project_name # should be timestamped

    # Clean title check
    assert job_data["custom_title"] == project_name

    expected_absolute_path = os.path.abspath(str(real_cover_file))
    assert job_data["cover_path"] == expected_absolute_path
    assert os.path.isabs(job_data["cover_path"])
    assert "out/covers" not in job_data["cover_path"]


def test_migrate_legacy_project_cover_into_project_storage():
    project_name = "Legacy Cover Project"
    cover_filename = "legacy_cover.png"
    virtual_cover_path = f"/out/covers/{cover_filename}"

    COVER_DIR.mkdir(parents=True, exist_ok=True)
    legacy_cover = COVER_DIR / cover_filename
    legacy_cover.write_text("legacy image data")

    pid = create_project(project_name, cover_image_path=virtual_cover_path)

    migrated = migrate_legacy_project_covers()

    assert migrated >= 1
    project_cover = get_project_cover_dir(pid) / "cover.png"
    assert project_cover.exists()

    from app.db import get_project
    project = get_project(pid)
    assert project["cover_image_path"] == f"/projects/{pid}/cover/cover.png"

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
