import pytest
import sqlite3
import os
from pathlib import Path
from app.db.core import init_db, get_connection
from app.db.chapters import (
    create_chapter, get_chapter, list_chapters, update_chapter,
    delete_chapter, reorder_chapters, reset_chapter_audio
)
from app.db.projects import create_project

@pytest.fixture
def db_conn():
    db_path = "/tmp/test_audiobook.db"
    if os.path.exists(db_path):
        os.unlink(db_path)

    os.environ["DB_PATH"] = db_path
    import app.db.core
    # Force reload of DB_PATH from env if it was already imported
    import importlib
    importlib.reload(app.db.core)

    init_db()
    conn = get_connection()
    yield conn
    conn.close()
    if os.path.exists(db_path):
        os.unlink(db_path)

def test_chapter_crud(db_conn):
    pid = create_project("Test Project", "/tmp")

    # Create
    cid = create_chapter(pid, "Chapter 1", "Some text content", 1)
    assert cid is not None

    # Get
    chapter = get_chapter(cid)
    assert chapter is not None
    assert chapter["title"] == "Chapter 1"

    # Update
    update_chapter(cid, title="Updated Title", audio_status="completed")
    chapter = get_chapter(cid)
    assert chapter["title"] == "Updated Title"
    assert chapter["audio_status"] == "completed"

def test_get_chapter_segments_counts(db_conn):
    pid = create_project("P_SEG", "/tmp")
    cid = create_chapter(pid, "C_SEG")

    # Manually insert segments to test counts
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content, audio_status) VALUES (?, ?, ?, ?, ?)", ("s1", cid, 1, "t1", "done"))
        cursor.execute("INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content, audio_status) VALUES (?, ?, ?, ?, ?)", ("s2", cid, 2, "t2", "unprocessed"))
        conn.commit()

    from app.db.chapters import get_chapter_segments_counts
    done, total = get_chapter_segments_counts(cid)
    assert done == 1
    assert total == 2

def test_get_chapter_disk_checks(db_conn):
    pid = create_project("P_DISK", "/tmp")
    cid = create_chapter(pid, "C_DISK")

    from pathlib import Path
    from unittest.mock import patch

    # Mock config and Path.exists to simulate files on disk
    with patch("app.config.get_project_audio_dir", return_value=Path("/tmp")), \
         patch("pathlib.Path.exists", return_value=True):

        chapter = get_chapter(cid)
        assert chapter["has_wav"] is True
        assert chapter["has_mp3"] is True
        assert chapter["has_m4a"] is True

def test_reorder_chapters(db_conn):
    pid = create_project("P1", "/tmp")
    c1 = create_chapter(pid, "C1", sort_order=1)
    c2 = create_chapter(pid, "C2", sort_order=2)

    reorder_chapters([c2, c1])

    chapters = list_chapters(pid)
    assert chapters[0]["id"] == c2
    assert chapters[1]["id"] == c1
    assert chapters[0]["sort_order"] == 0
    assert chapters[1]["sort_order"] == 1

def test_reset_chapter_audio(db_conn):
    pid = create_project("P2", "/tmp")
    # Need to mock config for physical file checks in reset_chapter_audio
    from unittest.mock import patch
    with patch("app.config.get_project_audio_dir", return_value=Path("/tmp")):
        cid = create_chapter(pid, "C1")
        update_chapter(cid, audio_status="done", audio_file_path="c1.wav")

        success = reset_chapter_audio(cid)
        assert success is True

        chapter = get_chapter(cid)
        assert chapter["audio_status"] == "unprocessed"
        assert chapter["audio_file_path"] is None
