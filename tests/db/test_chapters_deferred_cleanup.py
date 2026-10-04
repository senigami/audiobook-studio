import sqlite3
from unittest.mock import patch

import pytest

import app.db.chapters as chapters_mod
from app.db import update_segment
from app.db.core import get_connection
from app.db.migrations.registry import MIGRATIONS
from app.db.migrations.runner import run_migrations
from app.db.chapters import create_chapter, update_chapter
from app.db.projects import create_project
from app.db.segments import get_chapter_segments, sync_chapter_segments


class _CommitFailsConnection:
    """Real connection whose commit raises, the only thing mocked (the sqlite boundary)."""

    def __init__(self, real):
        self._real = real

    def __getattr__(self, name):
        return getattr(self._real, name)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self._real.rollback()
        return False

    def commit(self):
        raise sqlite3.OperationalError("disk I/O error")


@pytest.fixture(params=["legacy_schema", "migrated_schema"])
def schema(request, db_conn):
    # db_conn builds the schema without the migration registry; re-apply it for the migrated run.
    if request.param == "migrated_schema":
        with get_connection() as conn:
            run_migrations(conn, MIGRATIONS)
    return request.param


@pytest.fixture
def chapter_with_audio(schema, tmp_path):
    pid = create_project("P248", "/tmp")
    cid = create_chapter(pid, "C248", "One. Two.")
    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        from app.core.config import get_chapter_dir

        seg_dir = get_chapter_dir(pid, cid) / "segments"
        seg_dir.mkdir(parents=True, exist_ok=True)
        segs = get_chapter_segments(cid)
        wavs = {}
        for seg in segs:
            wav = seg_dir / f"{seg['id']}.wav"
            wav.write_text("x")
            update_segment(seg["id"], audio_status="done", audio_file_path=wav.name, audio_generated_at=1.0)
            wavs[seg["id"]] = wav
        yield pid, cid, segs, wavs


def test_update_chapter_commit_failure_keeps_removed_segment_audio(chapter_with_audio):
    _pid, cid, segs, wavs = chapter_with_audio
    real_get_connection = chapters_mod.get_connection
    with patch.object(chapters_mod, "get_connection", lambda: _CommitFailsConnection(real_get_connection())):
        with pytest.raises(sqlite3.OperationalError):
            update_chapter(cid, text_content="One.")

    assert wavs[segs[1]["id"]].exists()
    assert [s["id"] for s in get_chapter_segments(cid)] == [s["id"] for s in segs]


def test_update_chapter_deletes_removed_segment_audio_after_commit(chapter_with_audio):
    _pid, cid, segs, wavs = chapter_with_audio
    result = update_chapter(cid, text_content="One.")

    assert set(result) == {"success", "lost_assignments_count"}
    assert result["success"] is True
    assert wavs[segs[0]["id"]].exists()
    assert not wavs[segs[1]["id"]].exists()


def test_sync_with_caller_conn_defers_cleanup_and_returns_pending(chapter_with_audio):
    pid, cid, segs, wavs = chapter_with_audio
    with chapters_mod.get_connection() as conn:
        result = sync_chapter_segments(cid, "One.", conn=conn)
        assert wavs[segs[1]["id"]].exists()
        conn.rollback()

    assert result["success"] is True
    pending = result["pending_cleanup"]
    assert pending["project_id"] == pid
    assert pending["chapter_id"] == cid
    assert pending["segment_ids"] == [segs[1]["id"]]


def test_sync_without_conn_still_deletes_removed_segment_audio(chapter_with_audio):
    _pid, cid, segs, wavs = chapter_with_audio
    result = sync_chapter_segments(cid, "One.")

    assert "pending_cleanup" not in result
    assert not wavs[segs[1]["id"]].exists()
    assert wavs[segs[0]["id"]].exists()
