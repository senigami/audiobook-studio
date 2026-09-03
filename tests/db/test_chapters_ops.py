import pytest
from pathlib import Path
from unittest.mock import patch
from app.db.chapters import create_chapter, get_chapter, update_chapter, list_chapters, reorder_chapters, reset_chapter_audio
from app.db.projects import create_project

def _existing_project_audio_dir(path: Path):
    return lambda _project_id, dirname: Path(path) if dirname == "audio" else None

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

def test_reset_chapter_audio(db_conn, tmp_path):
    pid = create_project("P2", "/tmp")
    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        cid = create_chapter(pid, "C1")
        update_chapter(cid, audio_status="done", audio_file_path="chapter.wav")

        success = reset_chapter_audio(cid)
        assert success is True

        chapter = get_chapter(cid)
        assert chapter["audio_status"] == "unprocessed"
        assert chapter["audio_file_path"] is None

def test_reset_chapter_audio_deletes_chunk_files(db_conn, tmp_path):
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment
    from app.core.config import get_chapter_dir

    pid = create_project("P2B", "/tmp")
    cid = create_chapter(pid, "C1", "One. Two.")
    with patch("app.core.config.PROJECTS_DIR", tmp_path), \
         patch("app.core.config.TRASH_DIR", tmp_path / "trash"):
        chapter_dir = get_chapter_dir(pid, cid)
        chapter_dir.mkdir(parents=True, exist_ok=True)
        (chapter_dir / "segments").mkdir(exist_ok=True)

        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)
        chunk_name = f"{segs[0]['id']}.wav"
        chunk_path = chapter_dir / "segments" / chunk_name
        chunk_path.write_text("chunk")

        update_chapter(cid, audio_status="done", audio_file_path="chapter.wav")
        update_segment(segs[0]["id"], audio_status="done", audio_file_path=chunk_name)
        update_segment(segs[1]["id"], audio_status="done", audio_file_path=chunk_name)

        success = reset_chapter_audio(cid)
        assert success is True
        assert not chunk_path.exists()

def test_cleanup_chapter_audio_files_deletes_segment_file_by_id(db_conn, tmp_path):
    from app.db.chapters import cleanup_chapter_audio_files
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.core.config import get_chapter_dir

    pid = create_project("P2C", "/tmp")
    cid = create_chapter(pid, "C1", "One. Two.")
    with patch("app.core.config.PROJECTS_DIR", tmp_path), \
         patch("app.core.config.TRASH_DIR", tmp_path / "trash"):
        chapter_dir = get_chapter_dir(pid, cid)
        segment_dir = chapter_dir / "segments"
        segment_dir.mkdir(parents=True, exist_ok=True)

        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)
        target_segment_id = segs[1]["id"]
        target_path = segment_dir / f"{target_segment_id}.wav"
        target_path.write_text("chunk")

        assert cleanup_chapter_audio_files(pid, cid, [target_segment_id]) is True
        assert not target_path.exists()

def test_update_segment_only_cleans_edited_segment_files(db_conn, tmp_path):
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment
    from app.core.config import get_chapter_dir

    pid = create_project("P3", "/tmp")
    cid = create_chapter(pid, "C3", "One. Two.")
    with patch("app.core.config.PROJECTS_DIR", tmp_path), \
         patch("app.core.config.TRASH_DIR", tmp_path / "trash"):
        chapter_dir = get_chapter_dir(pid, cid)
        chapter_dir.mkdir(parents=True, exist_ok=True)
        (chapter_dir / "segments").mkdir(exist_ok=True)

        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)
        sid1 = segs[0]["id"]
        sid2 = segs[1]["id"]

        chapter_wav = chapter_dir / "chapter.wav"
        seg1_wav = chapter_dir / "segments" / f"{sid1}.wav"
        seg2_wav = chapter_dir / "segments" / f"{sid2}.wav"
        chapter_wav.write_text("chapter")
        seg1_wav.write_text("seg1")
        seg2_wav.write_text("seg2")

        update_chapter(cid, audio_status="done", audio_file_path="chapter.wav")
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
