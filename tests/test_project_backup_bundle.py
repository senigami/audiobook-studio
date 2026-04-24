import pytest
import os
import re
from fastapi.testclient import TestClient
from app.web import app
from app.db.core import init_db
from app.db.projects import create_project
from app.db.chapters import create_chapter

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def clean_db():
    # Use a separate test DB to avoid interference
    db_path = "/tmp/test_project_backup.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path

    # Force reload of DB core to pick up the new path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)

    init_db()
    yield
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_backup_bundle_creation(clean_db, client):
    # 1. Setup a project with metadata and chapters
    pid = create_project("My Backup Project", author="Author Name", series="The Series")
    create_chapter(pid, "Chapter One", "Once upon a time...")
    create_chapter(pid, "Chapter Two", "The end.")

    # 2. Request a backup bundle
    response = client.post(f"/api/projects/{pid}/backup-bundle")
    assert response.status_code == 200

    bundle = response.json()

    # 3. Verify bundle identity and naming
    assert bundle["project_id"] == pid
    assert "bundle_name" in bundle
    assert bundle["bundle_name"].startswith("My_Backup_Project_")
    assert bundle["bundle_name"].endswith(".abf")
    assert re.search(r"\d{8}_\d{6}", bundle["bundle_name"]) # Date-stamped naming

    # 4. Verify snapshot foundation
    snapshot = bundle["snapshot"]
    assert snapshot["project_id"] == pid
    assert "metadata_json" in snapshot
    assert snapshot["metadata_json"]["project_title"] == "My Backup Project"
    assert snapshot["metadata_json"]["author"] == "Author Name"
    assert snapshot["metadata_json"]["series"] == "The Series"
    assert len(snapshot["chapter_ids"]) == 2

    # 5. Verify export manifest foundation
    manifest = bundle["export_manifest"]
    assert manifest["project_id"] == pid
    assert manifest["format_id"] == "backup"
    assert manifest["snapshot_id"] == snapshot["id"]
    assert manifest["include_audio"] is True
    assert manifest["include_cover_art"] is True
    assert len(manifest["chapter_ids"]) == 2

    # 6. Verify portability (no absolute paths)
    # Check for anything starting with / or having a drive letter in metadata
    metadata_str = str(snapshot["metadata_json"])
    assert not re.search(r"['\"][A-Z]:\\", metadata_str) # Windows absolute
    assert not re.search(r"['\"]/(Users|home|tmp|var)/", metadata_str) # Unix absolute

def test_backup_bundle_not_found(clean_db, client):
    response = client.post("/api/projects/nonexistent/backup-bundle")
    assert response.status_code == 404
    assert "Project not found" in response.json()["message"]

def test_backup_bundle_safe_title_normalization(clean_db, client):
    # Test that special characters are handled in the bundle name
    pid = create_project("Project @#$% With! Special Characters")
    response = client.post(f"/api/projects/{pid}/backup-bundle")
    bundle_name = response.json()["bundle_name"]

    # Should be normalized to something like Project______With__Special_Characters_...
    assert "Project" in bundle_name
    assert "Special_Characters" in bundle_name
    assert "@" not in bundle_name
    assert "#" not in bundle_name
    assert "$" not in bundle_name
    assert "%" not in bundle_name
    assert "!" not in bundle_name
