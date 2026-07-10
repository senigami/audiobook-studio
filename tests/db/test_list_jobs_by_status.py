"""Unit tests for app.db.queue.list_jobs_by_status (B18 fix)."""

from __future__ import annotations

import pytest
from app.db.core import init_db, get_connection
from app.db.queue import list_jobs_by_status, upsert_queue_row
from app.db.projects import create_project
from app.db.chapters import create_chapter


def test_list_jobs_by_status_returns_matching_rows(db_conn):
    """list_jobs_by_status returns rows that match the requested status."""
    pid = create_project("P-list-status")
    cid = create_chapter(pid, "C-list-status")

    upsert_queue_row("job-running-1", project_id=pid, chapter_id=cid, status="running")
    upsert_queue_row("job-queued-1", project_id=pid, chapter_id=cid, status="queued")

    running = list_jobs_by_status("running")
    assert any(r["id"] == "job-running-1" for r in running)
    assert not any(r["id"] == "job-queued-1" for r in running)


def test_list_jobs_by_status_returns_dicts(db_conn):
    """Rows returned are plain dicts (not sqlite3.Row objects)."""
    pid = create_project("P-dict-check")
    cid = create_chapter(pid, "C-dict-check")
    upsert_queue_row("job-dict-1", project_id=pid, chapter_id=cid, status="waiting")

    rows = list_jobs_by_status("waiting")
    for row in rows:
        assert isinstance(row, dict)
        assert "id" in row
        assert "status" in row
        assert "project_id" in row
        assert "chapter_id" in row


def test_list_jobs_by_status_empty_when_no_match(db_conn):
    """Returns empty list when no rows match the status."""
    result = list_jobs_by_status("preparing")
    assert result == []
