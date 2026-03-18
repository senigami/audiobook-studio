import pytest
import time
from fastapi.testclient import TestClient
from app.web import app
from app.config import get_project_m4b_dir
from app.db import create_project

client = TestClient(app)

def test_project_audiobook_history_endpoint(tmp_path):
    # 1. Setup project
    pid = create_project("History Test")

    # 2. Create mock m4b files in the project's m4b dir
    m4b_dir = get_project_m4b_dir(pid)
    m4b_dir.mkdir(parents=True, exist_ok=True)

    f1 = m4b_dir / "v1.m4b"
    f1.write_text("audio v1")

    # Small delay to ensure mtime difference
    time.sleep(0.1)

    f2 = m4b_dir / "v2.m4b"
    f2.write_text("audio v2")

    # 3. Call the new endpoint
    response = client.get(f"/api/projects/{pid}/audiobooks")
    assert response.status_code == 200
    data = response.json()

    # 4. Verify data structure and sorting (newest first)
    assert len(data) == 2
    assert data[0]["filename"] == "v2.m4b"
    assert data[1]["filename"] == "v1.m4b"

    assert "created_at" in data[0]
    assert "size_bytes" in data[0]
    assert data[0]["size_bytes"] == len("audio v2")
    assert data[0]["url"] == f"/projects/{pid}/m4b/v2.m4b"

def test_project_audiobook_history_not_found():
    response = client.get("/api/projects/non-existent-pid/audiobooks")
    assert response.status_code == 404

def test_delete_audiobook(tmp_path):
    from app.config import AUDIOBOOK_DIR
    AUDIOBOOK_DIR.mkdir(parents=True, exist_ok=True)

    filename = "to_delete.m4b"
    jpg_filename = "to_delete.jpg"

    m4b_path = AUDIOBOOK_DIR / filename
    jpg_path = AUDIOBOOK_DIR / jpg_filename

    m4b_path.write_text("m4b data")
    jpg_path.write_text("jpg data")

    assert m4b_path.exists()
    assert jpg_path.exists()

    response = client.delete(f"/api/audiobook/{filename}")
    assert response.status_code == 200

    assert not m4b_path.exists()
    assert not jpg_path.exists()

def test_delete_audiobook_not_found():
    response = client.delete("/api/audiobook/non-existent.m4b")
    assert response.status_code == 404


def test_delete_audiobook_rejects_traversal(tmp_path, monkeypatch):
    from app.api.routers import settings as settings_router

    audiobook_dir = tmp_path / "audiobooks"
    audiobook_dir.mkdir()
    outside = tmp_path / "escape.m4b"
    outside.write_text("escape")

    monkeypatch.setattr(settings_router, "AUDIOBOOK_DIR", audiobook_dir)

    response = settings_router.delete_audiobook("../../escape.m4b", project_id=None)
    assert response.status_code == 403
    assert outside.exists()
