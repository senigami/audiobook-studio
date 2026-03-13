import pytest
import io
import json
import os
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.web import app as fastapi_app
from app.api.routers.chapters import get_chapter_dir, get_xtts_out_dir
from app.db.core import init_db, get_connection
import app.config

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

    yield

    if os.path.exists(db_path):
        os.unlink(db_path)
    fastapi_app.dependency_overrides = {}

def test_chapters_list_and_basic_crud(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")

    # List
    response = client.get(f"/api/projects/{pid}/chapters")
    assert response.status_code == 200

    # Get
    response = client.get(f"/api/chapters/{cid}")
    assert response.status_code == 200

    # Update
    response = client.put(f"/api/chapters/{cid}", data={"title": "Updated"})
    assert response.status_code == 200

    # Delete (standard)
    response = client.delete(f"/api/chapters/{cid}")
    assert response.status_code == 200

def test_segments_and_bulk_operations(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")

    with get_connection() as conn:
        conn.execute("INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content) VALUES (?, ?, ?, ?)", ("s1", cid, 1, "t1"))
        conn.commit()

    # Update single
    response = client.put("/api/segments/s1", json={"audio_status": "done"})
    assert response.status_code == 200

    # Bulk status
    response = client.post(f"/api/chapters/{cid}/segments/bulk-status", json=["s1"], params={"status": "unprocessed"})
    assert response.status_code == 200

    # Legacy bulk update
    response = client.put("/api/segments", data={"segment_ids": "s1", "audio_status": "processing"})
    assert response.status_code == 200

def test_job_cancellation_granular(clean_db):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")

    mock_job = MagicMock()
    mock_job.chapter_id = cid
    mock_job.chapter_file = "test.txt"

    with patch("app.api.routers.chapters.get_jobs", return_value={"j1": mock_job}), \
         patch("app.api.routers.chapters.cancel_job") as mock_cancel, \
         patch("app.api.routers.chapters.update_job"):
        response = client.post(f"/api/chapters/{cid}/cancel")
        assert response.status_code == 200

def test_legacy_reset_and_delete_robust(clean_db, tmp_path):
    # Use resolved paths to solve macOS private/var issues
    base_dir = tmp_path.resolve()
    chapter_dir = (base_dir / "chapters").resolve()
    chapter_dir.mkdir(parents=True)
    xtts_dir = (base_dir / "xtts").resolve()
    xtts_dir.mkdir(parents=True)

    fastapi_app.dependency_overrides[get_chapter_dir] = lambda: chapter_dir
    fastapi_app.dependency_overrides[get_xtts_out_dir] = lambda: xtts_dir

    # Legacy Reset
    with patch("app.web.XTTS_OUT_DIR", xtts_dir), \
         patch("app.api.routers.chapters.get_jobs", return_value={}):
        (xtts_dir / "test.wav").write_text("audio")
        response = client.post("/api/chapter/reset", data={"chapter_file": "test.txt"})
        assert response.status_code == 200
        # Check files but allow for potential delay in OS sync (though shouldn't be needed)
        assert not (xtts_dir / "test.wav").exists()

    # Legacy Delete
    txt_file = (chapter_dir / "test_del.txt").resolve()
    txt_file.write_bytes(b"text")
    wav_file = (xtts_dir / "test_del.wav").resolve()
    wav_file.write_bytes(b"audio")

    assert txt_file.exists(), f"File {txt_file} should exist"

    # Using TestClient with absolute path if needed? No, just the filename
    response = client.delete("/api/chapter/test_del.txt")

    # Debug if failed
    if response.status_code == 404:
        print(f"DEBUG: chapter_dir={chapter_dir}, txt_file={txt_file}, exists={txt_file.exists()}")

    assert response.status_code == 200
    assert not txt_file.exists()

def test_preview_and_security_patches(clean_db, tmp_path):
    base_dir = tmp_path.resolve()
    fastapi_app.dependency_overrides[get_chapter_dir] = lambda: base_dir

    (base_dir / "test.txt").write_text("🚀 content")
    response = client.get("/api/preview/test.txt", params={"processed": True})
    assert response.status_code == 200

    # Traversal triggers via patch
    with patch("app.api.routers.chapters.os.path.basename", return_value=".."):
        response = client.get("/api/preview/safe.txt")
        assert response.status_code == 403

def test_stream_and_export_fallbacks(clean_db, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import create_chapter, update_chapter
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")

    base_dir = tmp_path.resolve()
    fastapi_app.dependency_overrides[get_xtts_out_dir] = lambda: base_dir

    # _0.mp3 fallback
    (base_dir / f"{cid}_0.mp3").write_text("fallback")
    response = client.get(f"/api/chapters/{cid}/stream")
    assert response.status_code == 200

    response = client.post(f"/api/chapter/{cid}/export-sample")
    assert response.status_code == 200

def test_error_handlers(clean_db):
    with patch("app.api.routers.chapters.os.path.basename", side_effect=ValueError("fail")):
        response = client.post("/api/chapter/reset", data={"chapter_file": "xx"})
        assert response.status_code == 500

    with patch("app.api.routers.chapters.os.path.basename", side_effect=ValueError("fail")):
        response = client.delete("/api/chapter/xx")
        assert response.status_code == 500
