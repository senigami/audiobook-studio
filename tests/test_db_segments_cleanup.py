import pytest
import os
from pathlib import Path
from unittest.mock import patch
from app.db.core import init_db, get_connection
from app.db.chapters import create_chapter
from app.db.projects import create_project
from app.db.segments import cleanup_orphaned_segments

@pytest.fixture
def db_conn():
    db_path = "/tmp/test_audiobook_cleanup.db"
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

def test_cleanup_orphaned_segments_shared_dir(db_conn, tmp_path):
    # Setup two chapters that share the same output directory
    pid = create_project("Shared Dir Project", "/tmp")
    cid_1 = create_chapter(pid, "Chapter 1")
    cid_2 = create_chapter(pid, "Chapter 2")

    with get_connection() as conn:
        cursor = conn.cursor()
        # Valid segment for chapter 1
        cursor.execute("INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content, audio_status) VALUES (?, ?, ?, ?, ?)", 
                       ("chap1_seg", cid_1, 1, "test", "done"))
        # Valid segment for chapter 2
        cursor.execute("INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content, audio_status) VALUES (?, ?, ?, ?, ?)", 
                       ("chap2_seg", cid_2, 1, "test", "done"))
        conn.commit()

    # Create dummy files in the temp directory
    chap1_file = tmp_path / "seg_chap1_seg.wav"
    chap1_file.write_text("dummy")

    chap2_file = tmp_path / "seg_chap2_seg.wav"
    chap2_file.write_text("dummy")

    orphan_file = tmp_path / "seg_orphan_seg.wav"
    orphan_file.write_text("dummy")

    # Mock config to point to our temp directory for both chapters
    with patch("app.config.get_project_audio_dir", return_value=tmp_path):
        # Run cleanup for chapter 1
        cleanup_orphaned_segments(cid_1)

    # Verification
    # Orphan should be deleted
    assert not orphan_file.exists(), "Orphaned segment file was not deleted"

    # Valid files for BOTH chapters must survive
    assert chap1_file.exists(), "Valid segment for Chapter 1 was incorrectly deleted"
    assert chap2_file.exists(), "Valid segment for Chapter 2 was incorrectly deleted"
