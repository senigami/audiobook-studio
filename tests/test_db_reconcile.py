import pytest
import os
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.db.core import init_db, get_connection
from app.db.reconcile import (
    reconcile_project_audio, reconcile_all_chapter_statuses
)
from app.db.projects import create_project
from app.db.chapters import create_chapter, get_chapter, update_chapter

@pytest.fixture
def db_conn():
    db_path = "/tmp/test_reconcile.db"
    if os.path.exists(db_path):
        os.unlink(db_path)

    os.environ["DB_PATH"] = db_path
    import app.db.core
    import importlib
    importlib.reload(app.db.core)

    init_db()
    conn = get_connection()
    yield conn
    conn.close()
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_reconcile_project_audio(db_conn):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")

    expected_file = f"{cid}.mp3"

    def mock_exists(p_self):
        s = str(p_self)
        if expected_file in s or "audio" in s:
            return True
        return False

    with patch("app.config.get_project_audio_dir", return_value=Path("/tmp/audio")), \
         patch("pathlib.Path.exists", side_effect=mock_exists, autospec=True), \
         patch("os.listdir", return_value=[expected_file]), \
         patch("subprocess.run") as mock_run:

        # Mock ffprobe result
        mock_res = MagicMock()
        mock_res.returncode = 0
        mock_res.stdout = "42.0\n"
        mock_run.return_value = mock_res

        reconcile_project_audio(pid)

        # Check DB
        with get_connection() as conn:
            row = conn.execute("SELECT audio_status, audio_file_path, audio_length_seconds FROM chapters WHERE id = ?", (cid,)).fetchone()
            assert row["audio_status"] == "done"
            assert row["audio_file_path"] == expected_file
            assert row["audio_length_seconds"] == 42.0

def test_reconcile_project_audio_not_found(db_conn):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")
    update_chapter(cid, audio_status="done", audio_file_path="old.wav")

    def mock_exists(p_self):
        s = str(p_self)
        if s.endswith("audio"):
            return True
        return False

    with patch("app.config.get_project_audio_dir", return_value=Path("/tmp/audio")), \
         patch("os.listdir", return_value=[]), \
         patch("pathlib.Path.exists", side_effect=mock_exists, autospec=True):

        reconcile_project_audio(pid)

        with get_connection() as conn:
            row = conn.execute("SELECT audio_status FROM chapters WHERE id = ?", (cid,)).fetchone()
            assert row["audio_status"] == "unprocessed"

def test_reconcile_all_chapter_statuses(db_conn):
    pid = create_project("P1")
    cid1 = create_chapter(pid, "C1")
    cid2 = create_chapter(pid, "C2")
    cid3 = create_chapter(pid, "C3")

    update_chapter(cid1, audio_status="processing")
    update_chapter(cid2, audio_status="processing")
    update_chapter(cid3, audio_status="done", audio_file_path="") # Should be reset

    reconcile_all_chapter_statuses({cid1})

    with get_connection() as conn:
        r1 = conn.execute("SELECT audio_status FROM chapters WHERE id = ?", (cid1,)).fetchone()
        r2 = conn.execute("SELECT audio_status FROM chapters WHERE id = ?", (cid2,)).fetchone()
        r3 = conn.execute("SELECT audio_status FROM chapters WHERE id = ?", (cid3,)).fetchone()
        assert r1["audio_status"] == "processing"
        assert r2["audio_status"] == "unprocessed"
        assert r3["audio_status"] == "unprocessed"

def test_reconcile_all_empty_active(db_conn):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")
    update_chapter(cid, audio_status="processing")

    reconcile_all_chapter_statuses(set())
    with get_connection() as conn:
        row = conn.execute("SELECT audio_status FROM chapters WHERE id = ?", (cid,)).fetchone()
        assert row["audio_status"] == "unprocessed"
