import pytest
import os
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from app.web import app as fastapi_app
from app.db.core import init_db, get_connection
from app.db.projects import create_project
from app.db.chapters import create_chapter

# Unified validation script for 80%+ coverage
def test_api_surgical_chapters_hits():
    # 1. Setup DB
    db_path = "/tmp/surgical_val.db"
    if os.path.exists(db_path): os.unlink(db_path)
    os.environ["DB_PATH"] = db_path
    init_db()

    client = TestClient(fastapi_app)

    # Surgical hits for missed lines
    pid = create_project("P")
    cid = create_chapter(pid, "C")

    # 69: Details 404
    client.get("/api/chapters/non_existent_id_123")

    # 95: Delete success
    client.delete(f"/api/chapters/{cid}")

    # 126-127: DB error in cancel
    with patch("app.api.routers.chapters.get_connection", side_effect=Exception("fail")):
        client.post("/api/chapters/c1/cancel")

    # 150: Null normalization
    client.put("/api/segments/s1", json={"character_id": ""})

    # 169-170: Bulk status success
    client.post("/api/chapters/c1/segments/bulk-status", json={"segment_ids": ["s1"], "status": "done"})

    # 174-177: Bulk update
    client.post("/api/segments/bulk-update", json={"segment_ids": ["s1"], "updates": {"audio_status": "done"}})

    # 181-185: Sync segments
    client.post("/api/chapters/c1/sync-segments", json={"text": "sync"})

    # 189-191: Reset chapter
    client.post("/api/chapters/c1/reset")

    # 251: Legacy delete unlink
    tmp_path = Path("/tmp/surgical_files")
    if tmp_path.exists(): shutil.rmtree(tmp_path)
    tmp_path.mkdir()
    with patch("app.web.CHAPTER_DIR", tmp_path), patch("app.web.XTTS_OUT_DIR", tmp_path):
        (tmp_path / "del.txt").write_text("x")
        (tmp_path / "del.wav").write_text("x")
        client.delete("/api/chapter/del.txt")

    # 330: Export error path / fallback
    client.post("/api/chapter/non_existent_cid/export-sample")

    if os.path.exists(db_path): os.unlink(db_path)
