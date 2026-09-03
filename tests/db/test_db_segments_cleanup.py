import time

import pytest
import os
from pathlib import Path
from unittest.mock import patch
from app.db.core import init_db, get_connection
from app.db.chapters import create_chapter
from app.db.projects import create_project
from app.db.segments import cleanup_orphaned_segments, get_chapter_segments

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
    seg_dir = tmp_path / "segments"
    seg_dir.mkdir(exist_ok=True)

    chap1_file = seg_dir / "chap1_seg.wav"
    chap1_file.write_text("dummy")

    chap2_file = seg_dir / "chap2_seg.wav"
    chap2_file.write_text("dummy")

    orphan_file = seg_dir / "orphan_seg.wav"
    orphan_file.write_text("dummy")

    # Mock config to point to our temp directory for both chapters
    with patch("app.core.config.get_chapter_dir", return_value=tmp_path):
        # Run cleanup for chapter 1
        cleanup_orphaned_segments(cid_1)

    # Verification
    # Orphan should be deleted
    assert not orphan_file.exists(), "Orphaned segment file was not deleted"

    # Valid files for BOTH chapters must survive
    assert chap1_file.exists(), "Valid segment for Chapter 1 was incorrectly deleted"
    assert chap2_file.exists(), "Valid segment for Chapter 2 was incorrectly deleted"


def test_get_chapter_segments_resets_stale_processing_without_active_work(db_conn, tmp_path):
    pid = create_project("Processing Cleanup Project")
    cid = create_chapter(pid, "Stale Processing Chapter")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content, audio_status) VALUES (?, ?, ?, ?, ?)",
            ("seg_processing", cid, 0, "stale processing text", "processing"),
        )
        conn.commit()

    with patch("app.core.config.get_chapter_dir", return_value=tmp_path):
        rows = get_chapter_segments(cid)

    assert rows[0]["audio_status"] == "unprocessed"

    with get_connection() as conn:
        refreshed = conn.execute(
            "SELECT audio_status, audio_file_path FROM chapter_segments WHERE id = ?",
            ("seg_processing",),
        ).fetchone()
        assert refreshed["audio_status"] == "unprocessed"
        assert refreshed["audio_file_path"] is None


def test_get_chapter_segments_skips_tombstoned_missing_file_instead_of_nulling(db_conn, tmp_path):
    """#232 Task 004: a 'done' row whose audio file is missing on disk must
    NOT be nulled out by get_chapter_segments' self-heal if the filename has
    a live tombstone — that missing file is expected (mid-grace-period GC),
    and the row's terminal state is GC's business, not this read path's.

    R1 revert-check target: fails against pre-Task-004 code, which nulls
    any 'done' row whose file is missing regardless of tombstone status.
    """
    from app.db.migrations.registry import MIGRATIONS
    from app.db.migrations.runner import run_migrations

    with get_connection() as conn:
        run_migrations(conn, MIGRATIONS)

    pid = create_project("Tombstone Self-Heal Project")
    cid = create_chapter(pid, "Tombstone Self-Heal Chapter")

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO chapter_segments
              (id, chapter_id, segment_order, text_content, audio_status, audio_file_path)
            VALUES (?, ?, 0, 'text', 'done', ?)
            """,
            ("seg_tombstoned", cid, "seg_tombstoned.wav"),
        )
        # Tombstoned — the file is gone because GC already swept it (or is
        # about to), not because the row's data is wrong.
        conn.execute(
            "INSERT INTO segment_audio_tombstones (filename, chapter_id, created_at) VALUES (?, ?, ?)",
            ("seg_tombstoned.wav", cid, time.time()),
        )
        conn.commit()

    # No file on disk at all for seg_tombstoned.wav.
    with patch("app.core.config.get_chapter_dir", return_value=tmp_path):
        rows = get_chapter_segments(cid)

    assert rows[0]["audio_status"] == "done", "Tombstoned-missing row must be left alone, not nulled"
    assert rows[0]["audio_file_path"] == "seg_tombstoned.wav"

    with get_connection() as conn:
        refreshed = conn.execute(
            "SELECT audio_status, audio_file_path FROM chapter_segments WHERE id = ?",
            ("seg_tombstoned",),
        ).fetchone()
        assert refreshed["audio_status"] == "done"
        assert refreshed["audio_file_path"] == "seg_tombstoned.wav"
