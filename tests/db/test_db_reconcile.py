import pytest
import os
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.db.core import init_db, get_connection
from app.db.reconcile import (
    reconcile_project_audio, reconcile_all_chapter_statuses
)
from app.db.queue import reconcile_queue_status, upsert_queue_row
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

def test_reconcile_project_audio(db_conn, tmp_path):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")

    expected_file = "chapter.mp3"
    from app.core.config import get_chapter_dir
    c_dir = get_chapter_dir(pid, cid)
    c_dir.mkdir(parents=True, exist_ok=True)
    (c_dir / expected_file).write_bytes(b"mp3")

    # reconcile_project_audio resolves the chapter dir via StorageManager
    # (config.PROJECTS_DIR), the exact same code path get_chapter_dir() used
    # above to seed the fixture — no patch of get_chapter_dir is needed (it
    # isn't called by the code under test at all).
    with patch("subprocess.run") as mock_run:

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

def test_reconcile_project_audio_not_found(db_conn, tmp_path):
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")
    update_chapter(cid, audio_status="done", audio_file_path="old.wav")

    from app.core.config import get_chapter_dir
    c_dir = get_chapter_dir(pid, cid)
    c_dir.mkdir(parents=True, exist_ok=True)

    # No patch of get_chapter_dir needed — see comment in
    # test_reconcile_project_audio above; the code under test resolves the
    # same directory independently via StorageManager/config.PROJECTS_DIR.
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


def test_reconcile_queue_status_does_not_reset_chapter_with_done_row(db_conn):
    """B3 regression: a chapter with a stale running row AND a done row must not be reset to unprocessed."""
    pid = create_project("P1")
    cid = create_chapter(pid, "C1")
    update_chapter(cid, audio_status="processed")

    # Insert a stale running row (not in active_ids, so reconcile will cancel it)
    stale_job_id = "stale-running-job"
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO processing_queue (id, project_id, chapter_id, status, engine) VALUES (?, ?, ?, 'running', 'kokoro')",
            (stale_job_id, pid, cid),
        )
        # Insert a done row for the same chapter
        conn.execute(
            "INSERT INTO processing_queue (id, project_id, chapter_id, status, engine) VALUES (?, ?, ?, 'done', 'kokoro')",
            ("done-job", pid, cid),
        )
        conn.commit()

    # Reconcile with no active jobs — stale running row should be cancelled
    reconcile_queue_status([])

    with get_connection() as conn:
        chapter = conn.execute("SELECT audio_status FROM chapters WHERE id = ?", (cid,)).fetchone()
        stale_row = conn.execute("SELECT status FROM processing_queue WHERE id = ?", (stale_job_id,)).fetchone()

    # Chapter must not have been reset; stale row must have been cancelled
    assert chapter["audio_status"] == "processed", (
        f"Expected 'processed' but got '{chapter['audio_status']}' — B3 regression"
    )
    assert stale_row["status"] == "cancelled"
