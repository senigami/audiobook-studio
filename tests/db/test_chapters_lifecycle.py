import pytest
from pathlib import Path
from unittest.mock import patch
from app.db.chapters import create_chapter, get_chapter, delete_chapter

def test_delete_chapter_deletes_chapter_and_chunk_audio_files(db_conn, tmp_path):
    from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment
    from app.db.projects import create_project

    pid = create_project("P_DEL", "/tmp")
    cid = create_chapter(pid, "CDEL", "One. Two.")

    from app.config import get_chapter_dir, get_project_trash_dir
    chapter_dir = get_chapter_dir(pid, cid)
    trash_dir = get_project_trash_dir(pid)
    chapter_dir.mkdir(parents=True, exist_ok=True)
    (chapter_dir / "segments").mkdir(exist_ok=True)
    trash_dir.mkdir(parents=True, exist_ok=True)


    with patch("app.config.PROJECTS_DIR", tmp_path), \
         patch("app.config.TRASH_DIR", tmp_path / "trash"):
        (tmp_path / "trash").mkdir(exist_ok=True)
        chapter_dir = get_chapter_dir(pid, cid)
        trash_dir = get_project_trash_dir(pid)
        chapter_dir.mkdir(parents=True, exist_ok=True)
        (chapter_dir / "segments").mkdir(exist_ok=True)

        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)

        chapter_wav = chapter_dir / "chapter.wav"
        chunk_name = f"{segs[0]['id']}.wav"
        chunk_path = chapter_dir / "segments" / chunk_name
        chapter_text = chapter_dir / "chapter.txt"
        chapter_wav.write_text("chapter")
        chunk_path.write_text("chunk")
        chapter_text.write_text("chapter text")

        from app.db.chapters import update_chapter
        update_chapter(cid, audio_status="done", audio_file_path="chapter.wav")
        update_segment(segs[0]["id"], audio_status="done", audio_file_path=chunk_name)
        update_segment(segs[1]["id"], audio_status="done", audio_file_path=chunk_name)

        success = delete_chapter(cid)
        assert success is True
        assert not chapter_wav.exists()
        assert not chunk_path.exists()
        assert not chapter_text.exists()
        # V2 trash moves to trash_dir/chapter_id/audio/ and trash_dir/chapter_id/text/
        assert (trash_dir / cid / "audio" / "chapter.wav").exists()
        assert (trash_dir / cid / "audio" / chunk_name).exists()
        assert (trash_dir / cid / "text" / "chapter.txt").exists()
        assert get_chapter(cid) is None

def test_move_chapter_artifacts_to_trash_rejects_invalid_chapter_id(db_conn, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import move_chapter_artifacts_to_trash

    pid = create_project("P_TRASH_SAFE", "/tmp")
    audio_dir = tmp_path / "audio"
    text_dir = tmp_path / "text"
    trash_dir = tmp_path / "trash"
    audio_dir.mkdir()
    text_dir.mkdir()
    trash_dir.mkdir()

    from app.config import get_chapter_dir, get_project_trash_dir
    import uuid
    cid_safe = str(uuid.uuid4())
    chapter_dir = get_chapter_dir(pid, cid_safe)
    trash_dir = get_project_trash_dir(pid)
    chapter_dir.mkdir(parents=True, exist_ok=True)
    trash_dir.mkdir(parents=True, exist_ok=True)

    kept_audio = chapter_dir / "safe.wav"
    kept_text = chapter_dir / "safe.txt"
    kept_audio.write_text("audio")
    kept_text.write_text("text")

    with patch("app.config.PROJECTS_DIR", tmp_path):
        success = move_chapter_artifacts_to_trash(pid, "../escape", explicit_audio_files=["safe.wav"])

    assert success is False
    assert kept_audio.exists()
    assert kept_text.exists()

def test_move_chapter_artifacts_to_trash_rejects_non_uuid_chapter_id(db_conn, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import move_chapter_artifacts_to_trash

    pid = create_project("P_TRASH_UUID", "/tmp")
    audio_dir = tmp_path / "audio"
    text_dir = tmp_path / "text"
    trash_dir = tmp_path / "trash"
    audio_dir.mkdir()
    text_dir.mkdir()
    trash_dir.mkdir()

    def _subdir(_project_id, dirname):
        mapping = {"audio": audio_dir, "text": text_dir, "trash": trash_dir}
        return mapping.get(dirname)

    with patch("app.config.PROJECTS_DIR", tmp_path):
        success = move_chapter_artifacts_to_trash(pid, "not-a-uuid", explicit_audio_files=[])

    assert success is False

def test_cleanup_chapter_audio_files_rejects_traversal_names(db_conn, tmp_path):
    from app.db.projects import create_project
    from app.db.chapters import cleanup_chapter_audio_files

    pid = create_project("P_SAFE", "/tmp")
    cid = create_chapter(pid, "CSAFE")
    from app.config import get_chapter_dir
    chapter_dir = get_chapter_dir(pid, cid)
    chapter_dir.mkdir(parents=True, exist_ok=True)
    kept = chapter_dir / "safe.wav"
    kept.write_text("safe")
    escaped = tmp_path / "escape.wav"
    escaped.write_text("escape")

    with patch("app.config.PROJECTS_DIR", tmp_path):
        cleanup_chapter_audio_files(pid, cid, explicit_files=["../escape.wav"])

    assert kept.exists()
    assert escaped.exists()
