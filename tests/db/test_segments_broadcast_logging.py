"""BP-3: broadcast-failure warnings in app/db/segments.py must go through
the module logger, never a bare print() — DB-layer broadcast paths are
fire-and-forget (never surfaced in an API response body), but a print()
bypasses log handlers/levels/formatting and is invisible to log-based
monitoring.
"""
import logging

import pytest

from app.db.core import init_db
from app.db.projects import create_project
from app.db.chapters import create_chapter
from app.db.segments import update_segment, update_segments_status_bulk


@pytest.fixture(autouse=True)
def _init_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test_audiobook_studio.db"))
    monkeypatch.setenv("STUDIO_DB_PATH", str(tmp_path / "test_studio.db"))
    init_db()


def _make_segment():
    pid = create_project("P-broadcast-log")
    cid = create_chapter(pid, "C-broadcast-log")
    from app.db.core import get_connection

    seg_id = "seg-broadcast-log-1"
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content, audio_status) "
            "VALUES (?, ?, ?, ?, ?)",
            (seg_id, cid, 1, "hello", "pending"),
        )
        conn.commit()
    return pid, cid, seg_id


def test_update_segment_broadcast_failure_is_logged_not_printed(monkeypatch, capsys, caplog):
    _pid, _cid, seg_id = _make_segment()

    def _boom(chapter_id):
        raise RuntimeError("socket broadcast boom")

    monkeypatch.setattr("app.api.ws.broadcast_segments_updated", _boom)

    with caplog.at_level(logging.WARNING, logger="app.db.segments"):
        changed = update_segment(seg_id, audio_status="done")

    assert changed is True, "the broadcast failure must not affect the DB update result"

    captured = capsys.readouterr()
    assert "Failed to broadcast segment update" not in captured.out, (
        "broadcast failures must not be printed to stdout"
    )
    assert any(
        "Failed to broadcast segment update" in record.message
        for record in caplog.records
    ), f"expected a logger.warning call; got records: {[r.message for r in caplog.records]}"


def test_update_segments_status_bulk_broadcast_failure_is_logged_not_printed(monkeypatch, capsys, caplog):
    _pid, cid, seg_id = _make_segment()

    def _boom(chapter_id):
        raise RuntimeError("socket broadcast boom")

    monkeypatch.setattr("app.api.ws.broadcast_segments_updated", _boom)

    with caplog.at_level(logging.WARNING, logger="app.db.segments"):
        update_segments_status_bulk([seg_id], cid, "done")

    captured = capsys.readouterr()
    assert "Failed to broadcast bulk segment update" not in captured.out, (
        "broadcast failures must not be printed to stdout"
    )
    assert any(
        "Failed to broadcast bulk segment update" in record.message
        for record in caplog.records
    ), f"expected a logger.warning call; got records: {[r.message for r in caplog.records]}"
