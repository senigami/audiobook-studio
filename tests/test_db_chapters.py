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


def _existing_project_audio_dir(path: Path):
    return lambda _project_id, dirname: Path(path) if dirname == "audio" else None

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

def test_get_chapter_disk_checks(db_conn, tmp_path):
    pid = create_project("P_DISK", "/tmp")
    cid = create_chapter(pid, "C_DISK")

    from pathlib import Path
    from unittest.mock import patch

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
    with patch("app.config.get_project_audio_dir", return_value=Path("/tmp")), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(Path("/tmp"))):
        cid = create_chapter(pid, "C1")
        update_chapter(cid, audio_status="done", audio_file_path="c1.wav")

        success = reset_chapter_audio(cid)
        assert success is True

        chapter = get_chapter(cid)
        assert chapter["audio_status"] == "unprocessed"
        assert chapter["audio_file_path"] is None


def test_reset_chapter_audio_deletes_chunk_files(db_conn, tmp_path):
    from unittest.mock import patch
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P2B", "/tmp")
    cid = create_chapter(pid, "C1", "One. Two.")

    with patch("app.config.get_project_audio_dir", return_value=tmp_path), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(tmp_path)):
        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)
        chunk_name = f"chunk_{segs[0]['id']}.wav"
        chunk_path = tmp_path / chunk_name
        chunk_path.write_text("chunk")

        update_chapter(cid, audio_status="done", audio_file_path=f"{cid}.wav")
        update_segment(segs[0]["id"], audio_status="done", audio_file_path=chunk_name)
        update_segment(segs[1]["id"], audio_status="done", audio_file_path=chunk_name)

        success = reset_chapter_audio(cid)
        assert success is True
        assert not chunk_path.exists()

def test_update_segment_only_cleans_edited_segment_files(db_conn, tmp_path):
    from unittest.mock import patch
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P3", "/tmp")
    cid = create_chapter(pid, "C3", "One. Two.")

    with patch("app.config.get_project_audio_dir", return_value=tmp_path), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(tmp_path)):
        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)
        sid1 = segs[0]["id"]
        sid2 = segs[1]["id"]

        chapter_wav = tmp_path / f"{cid}.wav"
        seg1_wav = tmp_path / f"seg_{sid1}.wav"
        seg2_wav = tmp_path / f"seg_{sid2}.wav"
        chapter_wav.write_text("chapter")
        seg1_wav.write_text("seg1")
        seg2_wav.write_text("seg2")

        update_chapter(cid, audio_status="done", audio_file_path=f"{cid}.wav")
        update_segment(sid1, audio_status="done", audio_file_path=seg1_wav.name)
        update_segment(sid2, audio_status="done", audio_file_path=seg2_wav.name)
        update_segment(sid1, text_content="Updated one.")

        assert not chapter_wav.exists()
        assert not seg1_wav.exists()
        assert seg2_wav.exists()

        chapter = get_chapter(cid)
        assert chapter["audio_status"] == "unprocessed"
        assert chapter["audio_file_path"] is None

        segs_after = get_chapter_segments(cid)
        seg1_after = next(s for s in segs_after if s["id"] == sid1)
        seg2_after = next(s for s in segs_after if s["id"] == sid2)
        assert seg1_after["audio_status"] == "unprocessed"
        assert seg1_after["audio_file_path"] is None
        assert seg2_after["audio_status"] == "done"


def test_delete_chapter_deletes_chapter_and_chunk_audio_files(db_conn, tmp_path):
    from unittest.mock import patch
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment

    pid = create_project("P_DEL", "/tmp")
    cid = create_chapter(pid, "CDEL", "One. Two.")

    audio_dir = tmp_path / "audio"
    text_dir = tmp_path / "text"
    trash_dir = tmp_path / "trash"
    audio_dir.mkdir()
    text_dir.mkdir()
    trash_dir.mkdir()

    def _subdir(_project_id, dirname):
        mapping = {"audio": audio_dir, "text": text_dir, "trash": trash_dir}
        return mapping.get(dirname)

    with patch("app.config.get_project_audio_dir", return_value=audio_dir), \
         patch("app.config.get_project_text_dir", return_value=text_dir), \
         patch("app.config.get_project_trash_dir", return_value=trash_dir), \
         patch("app.config.find_existing_project_subdir", side_effect=_subdir):
        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)

        chapter_wav = audio_dir / f"{cid}.wav"
        chunk_name = f"chunk_{segs[0]['id']}.wav"
        chunk_path = audio_dir / chunk_name
        chapter_text = text_dir / f"{cid}_0.txt"
        chapter_wav.write_text("chapter")
        chunk_path.write_text("chunk")
        chapter_text.write_text("chapter text")

        update_chapter(cid, audio_status="done", audio_file_path=chapter_wav.name)
        update_segment(segs[0]["id"], audio_status="done", audio_file_path=chunk_name)
        update_segment(segs[1]["id"], audio_status="done", audio_file_path=chunk_name)

        success = delete_chapter(cid)
        assert success is True
        assert not chapter_wav.exists()
        assert not chunk_path.exists()
        assert not chapter_text.exists()
        assert (trash_dir / cid / "audio" / chapter_wav.name).exists()
        assert (trash_dir / cid / "audio" / chunk_name).exists()
        assert (trash_dir / cid / "text" / chapter_text.name).exists()
        assert get_chapter(cid) is None


def test_move_chapter_artifacts_to_trash_rejects_invalid_chapter_id(db_conn, tmp_path):
    from unittest.mock import patch
    from app.db.chapters import move_chapter_artifacts_to_trash

    pid = create_project("P_TRASH_SAFE", "/tmp")
    audio_dir = tmp_path / "audio"
    text_dir = tmp_path / "text"
    trash_dir = tmp_path / "trash"
    audio_dir.mkdir()
    text_dir.mkdir()
    trash_dir.mkdir()

    kept_audio = audio_dir / "safe.wav"
    kept_text = text_dir / "safe.txt"
    kept_audio.write_text("audio")
    kept_text.write_text("text")

    def _subdir(_project_id, dirname):
        mapping = {"audio": audio_dir, "text": text_dir, "trash": trash_dir}
        return mapping.get(dirname)

    with patch("app.config.get_project_audio_dir", return_value=audio_dir), \
         patch("app.config.get_project_text_dir", return_value=text_dir), \
         patch("app.config.get_project_trash_dir", return_value=trash_dir), \
         patch("app.config.find_existing_project_subdir", side_effect=_subdir):
        success = move_chapter_artifacts_to_trash(pid, "../escape", explicit_audio_files=["safe.wav"])

    assert success is False
    assert kept_audio.exists()
    assert kept_text.exists()


def test_cleanup_chapter_audio_files_rejects_traversal_names(db_conn, tmp_path):
    from unittest.mock import patch
    from app.db.chapters import cleanup_chapter_audio_files

    pid = create_project("P_SAFE", "/tmp")
    cid = create_chapter(pid, "CSAFE")
    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()
    kept = audio_dir / "safe.wav"
    kept.write_text("safe")
    escaped = tmp_path / "escape.wav"
    escaped.write_text("escape")

    with patch("app.config.get_project_audio_dir", return_value=audio_dir), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(audio_dir)):
        cleanup_chapter_audio_files(pid, cid, explicit_files=["../escape.wav"])

    assert kept.exists()
    assert escaped.exists()


def test_update_chapter_text_change_preserves_stale_chapter_audio_until_rebuild(db_conn, tmp_path):
    from unittest.mock import patch
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db import update_segment

    pid = create_project("P6", "/tmp")
    cid = create_chapter(pid, "C6", "One. Two.")

    with patch("app.config.get_project_audio_dir", return_value=tmp_path), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(tmp_path)):
        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)
        sid1 = segs[0]["id"]
        sid2 = segs[1]["id"]

        chapter_wav = tmp_path / f"{cid}.wav"
        seg1_wav = tmp_path / f"seg_{sid1}.wav"
        seg2_wav = tmp_path / f"seg_{sid2}.wav"
        chapter_wav.write_text("chapter")
        seg1_wav.write_text("seg1")
        seg2_wav.write_text("seg2")

        update_segment(sid1, audio_status="done", audio_file_path=seg1_wav.name, audio_generated_at=111.0)
        update_segment(sid2, audio_status="done", audio_file_path=seg2_wav.name, audio_generated_at=112.0)
        update_chapter(cid, audio_status="done", audio_file_path=f"{cid}.wav", audio_generated_at=123.0)
        update_chapter(cid, text_content="One. Three.")

        assert chapter_wav.exists()
        assert seg1_wav.exists()
        assert not seg2_wav.exists()

        chapter = get_chapter(cid)
        assert chapter["audio_status"] == "unprocessed"
        assert chapter["audio_file_path"] == f"{cid}.wav"
        assert chapter["audio_generated_at"] == 123.0
        assert chapter["has_wav"] is True

        segs_after = get_chapter_segments(cid)
        assert len(segs_after) == 2
        assert segs_after[0]["audio_status"] == "done"
        assert segs_after[0]["audio_file_path"] == seg1_wav.name
        assert segs_after[1]["audio_status"] == "unprocessed"
        assert segs_after[1]["audio_file_path"] is None


def test_sync_chapter_segments_preserves_rendered_file_links(db_conn, tmp_path):
    from unittest.mock import patch
    from app.db.segments import sync_chapter_segments, get_chapter_segments

    pid = create_project("P4", "/tmp")
    cid = create_chapter(pid, "C4", "One. Two.")

    with patch("app.config.get_project_audio_dir", return_value=tmp_path), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(tmp_path)):
        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)
        sid1 = segs[0]["id"]
        sid2 = segs[1]["id"]

        seg1_wav = tmp_path / f"seg_{sid1}.wav"
        seg2_wav = tmp_path / f"seg_{sid2}.wav"
        seg1_wav.write_text("seg1")
        seg2_wav.write_text("seg2")

        from app.db import update_segment
        update_segment(sid1, audio_status="done", audio_file_path=seg1_wav.name, audio_generated_at=123.0)
        update_segment(sid2, audio_status="done", audio_file_path=seg2_wav.name, audio_generated_at=124.0)

        sync_chapter_segments(cid, "One. Two.")
        refreshed = get_chapter_segments(cid)
        assert refreshed[0]["audio_status"] == "done"
        assert refreshed[0]["audio_file_path"] == seg1_wav.name
        assert refreshed[0]["audio_generated_at"] == 123.0
        assert refreshed[1]["audio_status"] == "done"
        assert refreshed[1]["audio_file_path"] == seg2_wav.name
        assert refreshed[1]["audio_generated_at"] == 124.0


def test_sync_chapter_segments_does_not_cross_match_reordered_duplicates(db_conn, tmp_path):
    from unittest.mock import patch
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db import update_segment

    pid = create_project("P5", "/tmp")
    cid = create_chapter(pid, "C5", "Repeat. Middle. Repeat.")

    with patch("app.config.get_project_audio_dir", return_value=tmp_path), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(tmp_path)):
        sync_chapter_segments(cid, "Repeat. Middle. Repeat.")
        segs = get_chapter_segments(cid)
        first_id, middle_id, last_id = [s["id"] for s in segs]

        first_file = tmp_path / f"seg_{first_id}.wav"
        middle_file = tmp_path / f"seg_{middle_id}.wav"
        last_file = tmp_path / f"seg_{last_id}.wav"
        first_file.write_text("first")
        middle_file.write_text("middle")
        last_file.write_text("last")

        update_segment(first_id, audio_status="done", audio_file_path=first_file.name, audio_generated_at=1.0)
        update_segment(middle_id, audio_status="done", audio_file_path=middle_file.name, audio_generated_at=2.0)
        update_segment(last_id, audio_status="done", audio_file_path=last_file.name, audio_generated_at=3.0)

        sync_chapter_segments(cid, "Repeat. Repeat. Middle.")
        refreshed = get_chapter_segments(cid)

        assert refreshed[0]["text_content"].strip() == "Repeat."
        assert refreshed[0]["audio_status"] == "done"
        assert refreshed[0]["audio_file_path"] == first_file.name
        assert refreshed[1]["text_content"].strip() == "Repeat."
        assert refreshed[1]["audio_status"] == "unprocessed"
        assert refreshed[1]["audio_file_path"] is None
        assert refreshed[2]["text_content"].strip() == "Middle."
        assert refreshed[2]["audio_status"] == "unprocessed"
        assert refreshed[2]["audio_file_path"] is None


def test_sync_chapter_segments_invalidates_trailing_segments_after_shift(db_conn, tmp_path):
    from unittest.mock import patch
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db import update_segment

    pid = create_project("P6", "/tmp")
    cid = create_chapter(pid, "C6", "Alpha. Bravo. Charlie. Delta.")

    with patch("app.config.get_project_audio_dir", return_value=tmp_path), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(tmp_path)):
        sync_chapter_segments(cid, "Alpha. Bravo. Charlie. Delta.")
        segs = get_chapter_segments(cid)
        sid1, sid2, sid3, sid4 = [s["id"] for s in segs]

        file1 = tmp_path / f"seg_{sid1}.wav"
        file2 = tmp_path / f"seg_{sid2}.wav"
        file3 = tmp_path / f"seg_{sid3}.wav"
        file4 = tmp_path / f"seg_{sid4}.wav"
        file1.write_text("one")
        file2.write_text("two")
        file3.write_text("three")
        file4.write_text("four")

        update_segment(sid1, audio_status="done", audio_file_path=file1.name, audio_generated_at=1.0)
        update_segment(sid2, audio_status="done", audio_file_path=file2.name, audio_generated_at=2.0)
        update_segment(sid3, audio_status="done", audio_file_path=file3.name, audio_generated_at=3.0)
        update_segment(sid4, audio_status="done", audio_file_path=file4.name, audio_generated_at=4.0)

        sync_chapter_segments(cid, "Alpha. New Bravo. Charlie. Delta.")
        refreshed = get_chapter_segments(cid)

        assert refreshed[0]["text_content"].strip() == "Alpha."
        assert refreshed[0]["audio_status"] == "done"
        assert refreshed[0]["audio_file_path"] == file1.name

        assert refreshed[1]["text_content"].strip() == "New Bravo."
        assert refreshed[1]["audio_status"] == "unprocessed"
        assert refreshed[1]["audio_file_path"] is None

        assert refreshed[2]["text_content"].strip() == "Charlie."
        assert refreshed[2]["audio_status"] == "unprocessed"
        assert refreshed[2]["audio_file_path"] is None

        assert refreshed[3]["text_content"].strip() == "Delta."
        assert refreshed[3]["audio_status"] == "unprocessed"
        assert refreshed[3]["audio_file_path"] is None

        assert file1.exists()
        assert not file2.exists()
        assert not file3.exists()
        assert not file4.exists()
