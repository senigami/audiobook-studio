import pytest
import os
import re
import json
import urllib.parse
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

def test_backup_bundle_download(clean_db, client):
    import zipfile
    import io

    # 1. Setup a project with a chapter and "done" audio
    pid = create_project("Download Project")
    from app.db.chapters import create_chapter, update_chapter
    cid = create_chapter(pid, "Chapter 1", "Content")

    # Mock some audio file existence
    from app.config import XTTS_OUT_DIR
    XTTS_OUT_DIR.mkdir(parents=True, exist_ok=True)
    audio_file = XTTS_OUT_DIR / "test_audio.wav"
    audio_file.write_bytes(b"fake wav data")

    update_chapter(cid, audio_status="done", audio_file_path="test_audio.wav")

    # 2. Download the bundle
    response = client.get(f"/api/projects/{pid}/backup-bundle/download")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/x-audiobook-factory-bundle"
    assert "attachment" in response.headers["content-disposition"]
    assert ".abf" in response.headers["content-disposition"]

    # 3. Verify ZIP content
    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        file_list = zf.namelist()
        assert "bundle.json" in file_list
        assert "manifest.json" in file_list
        assert "snapshot.json" in file_list

        # Chapter 1 should be 01_Chapter_1.txt/wav
        assert "chapters/01_Chapter_1.txt" in file_list
        assert "chapters/01_Chapter_1.wav" in file_list

        # Verify metadata content
        bundle_data = json.loads(zf.read("bundle.json"))
        assert bundle_data["project_id"] == pid
        assert bundle_data["snapshot"]["id"] == json.loads(zf.read("snapshot.json"))["id"]

        # Verify chapter map
        chapter_map = bundle_data["chapter_map"]
        assert cid in chapter_map
        assert chapter_map[cid]["text_path"] == "chapters/01_Chapter_1.txt"
        assert chapter_map[cid]["audio_path"] == "chapters/01_Chapter_1.wav"

        # Verify file content
        assert zf.read("chapters/01_Chapter_1.txt").decode("utf-8") == "Content"
        assert zf.read("chapters/01_Chapter_1.wav") == b"fake wav data"

    # Cleanup
    audio_file.unlink()

def test_backup_bundle_with_comment(clean_db, client):
    pid = create_project("Comment Project")
    comment = "This is a test backup comment."
    encoded_comment = urllib.parse.quote(comment)

    response = client.post(f"/api/projects/{pid}/backup-bundle?comment={encoded_comment}")
    assert response.status_code == 200
    assert response.json()["comment"] == comment

    # Also verify download includes it
    response = client.get(f"/api/projects/{pid}/backup-bundle/download?comment={encoded_comment}")
    assert response.status_code == 200
    import zipfile
    import io
    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        bundle_data = json.loads(zf.read("bundle.json"))
        assert bundle_data["comment"] == comment

def test_backup_bundle_chapter_text_and_sanitization(clean_db, client):
    import zipfile
    import io

    pid = create_project("Text Project")
    # Chapter with special characters in title
    create_chapter(pid, "Chapter @ One!", "Chapter one text content.")

    response = client.get(f"/api/projects/{pid}/backup-bundle/download")
    assert response.status_code == 200

    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        file_list = zf.namelist()
        # Should be sanitized to 01_Chapter_One.txt
        assert "chapters/01_Chapter_One.txt" in file_list
        assert zf.read("chapters/01_Chapter_One.txt").decode("utf-8") == "Chapter one text content."

        bundle_data = json.loads(zf.read("bundle.json"))
        chapter_map = bundle_data["chapter_map"]
        cid = list(chapter_map.keys())[0]
        assert chapter_map[cid]["text_path"] == "chapters/01_Chapter_One.txt"
        assert chapter_map[cid]["title"] == "Chapter @ One!"

def test_backup_bundle_disambiguates_chapter_filename_collisions(clean_db, client):
    import zipfile
    import io

    pid = create_project("Collision Project")
    first_id = create_chapter(pid, "Chapter One!", "First version.")
    second_id = create_chapter(pid, "Chapter One?", "Second version.")

    response = client.get(f"/api/projects/{pid}/backup-bundle/download")
    assert response.status_code == 200

    with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
        file_list = zf.namelist()
        assert "chapters/01_Chapter_One.txt" in file_list
        assert "chapters/02_Chapter_One.txt" in file_list
        assert zf.read("chapters/01_Chapter_One.txt").decode("utf-8") == "First version."
        assert zf.read("chapters/02_Chapter_One.txt").decode("utf-8") == "Second version."

        bundle_data = json.loads(zf.read("bundle.json"))
        chapter_map = bundle_data["chapter_map"]
        assert chapter_map[first_id]["text_path"] == "chapters/01_Chapter_One.txt"
        assert chapter_map[second_id]["text_path"] == "chapters/02_Chapter_One.txt"
