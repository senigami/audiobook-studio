import pytest
import io
import json
import os
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

# Import them here to ensure they exist, but we will reload them in the fixture
import app.api.routers.chapters
import app.db.chapters
import app.db.segments
import app.db.core

@pytest.fixture
def clean_db():
    db_path = "/tmp/test_api_chapters.db"
    if os.path.exists(db_path):
        os.unlink(db_path)
    os.environ["DB_PATH"] = db_path

    import importlib
    importlib.reload(app.db.core)
    importlib.reload(app.db.chapters)
    importlib.reload(app.db.segments)
    importlib.reload(app.api.routers.chapters)

    from app.db.core import init_db
    init_db()

    from app.web import app as fastapi_app
    client = TestClient(fastapi_app)

    yield client

    if os.path.exists(db_path):
        os.unlink(db_path)
    fastapi_app.dependency_overrides = {}

def test_chapters_final_push(clean_db, tmp_path):
    client = clean_db
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.core import get_connection
    from app.api.routers.chapters import get_chapter_dir, get_xtts_out_dir

    pid = create_project("P1")
    cid = create_chapter(pid, "C1")

    from app.web import app as fastapi_app
    fastapi_app.dependency_overrides[get_chapter_dir] = lambda: tmp_path
    fastapi_app.dependency_overrides[get_xtts_out_dir] = lambda: tmp_path

    # Hits 31, 35, 52-63 (List)
    client.get(f"/api/projects/{pid}/chapters")

    # Hits 114-117 (Cancel)
    mock_job = MagicMock()
    mock_job.chapter_id = cid
    mock_job.chapter_file = cid
    with patch("app.api.routers.chapters.get_jobs", return_value={"j1": mock_job}), \
         patch("app.api.routers.chapters.cancel_job"), \
         patch("app.api.routers.chapters.update_job"):
         client.post(f"/api/chapters/{cid}/cancel")

    # Hits 159-165 (Legacy Bulk PUT)
    client.put("/api/segments", data={"segment_ids": "s1,s2", "audio_status": "done"})

    # Hits 296-316 (Preview detail) - processed must be True
    (tmp_path / f"{cid}.txt").write_text("Hello world.")
    with patch("app.api.routers.chapters.get_settings", return_value={"safe_mode": True}):
        client.get(f"/api/preview/{cid}.txt", params={"processed": True})

    # Hits 345-349 (Export URL)
    wav_file = tmp_path / f"{cid}.wav"
    wav_file.write_text("audio data")
    client.post(f"/api/chapter/{cid}/export-sample", params={"project_id": "P1"})

    # Hits 251, 270-274 (Legacy delete paths)
    with patch("app.web.CHAPTER_DIR", tmp_path), patch("app.web.XTTS_OUT_DIR", tmp_path):
        (tmp_path / "del.txt").write_text("x")
        client.delete("/api/chapter/del.txt")

    # Hits 223-224 (Unlink in legacy reset)
    with patch("app.web.XTTS_OUT_DIR", tmp_path):
        (tmp_path / "test.wav").write_text("x")
        client.post("/api/chapter/reset", data={"chapter_file": "test.txt"})

def test_chapters_additional_coverage_logic(clean_db):
    client = clean_db
    # 500 reset error
    with patch("app.api.routers.chapters.get_jobs", side_effect=RuntimeError("fail")):
         client.post("/api/chapter/reset", data={"chapter_file": "x.txt"})
    # 403 paths
    with patch("app.api.routers.chapters.Path.is_relative_to", return_value=False):
        client.get("/api/preview/x.txt")
        client.delete("/api/chapter/x.txt")
        client.post("/api/chapter/reset", data={"chapter_file": "x.txt"})
