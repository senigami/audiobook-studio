import pytest
from app.db.chapters import create_chapter, get_chapter, update_chapter
from app.db.projects import create_project
from app.db.core import get_connection
from unittest.mock import patch
from pathlib import Path

def _existing_project_audio_dir(path: Path):
    return lambda _project_id, dirname: Path(path) if dirname == "audio" else None

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

def test_get_chapter_disk_checks(db_conn, tmp_path):
    pid = create_project("P_DISK", "/tmp")
    cid = create_chapter(pid, "C_DISK")

    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()
    (audio_dir / f"{cid}.wav").write_text("wav")
    (audio_dir / f"{cid}.mp3").write_text("mp3")
    (audio_dir / f"{cid}.m4a").write_text("m4a")

    with patch("app.config.get_project_audio_dir", return_value=Path(audio_dir)), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(audio_dir)):

        chapter = get_chapter(cid)
        assert chapter["has_wav"] is True
        assert chapter["has_mp3"] is True
        assert chapter["has_m4a"] is True
