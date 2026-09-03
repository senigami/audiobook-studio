"""Tests for app.db.chapter_locks — the per-chapter observability lock (#232 Task 004).

TDD: written before app/db/chapter_locks.py existed. R2 compliant — no
mocking, exercises the real sqlite3 connections and the real chapter_locks
table (added by the Task 001 migration).
"""
from __future__ import annotations

import time

import pytest

from app.db.core import get_connection, get_db_path
from app.db.migrations.registry import MIGRATIONS
from app.db.migrations.runner import run_migrations


@pytest.fixture(autouse=True)
def _ensure_schema():
    """conftest's ``clean_storage`` (function-scoped, autouse) re-runs
    ``init_db()`` before every test, which recreates the schema from scratch
    without the versioned migration registry — so chapter_locks would not
    exist. Re-apply the migration after it, each test (idempotent, guarded
    by schema_migrations; this fixture is defined here rather than in
    conftest so only tests that need the render-block schema pay for it).
    Pytest runs a conftest autouse fixture before a same-scope autouse
    fixture defined in the test module, so this runs after clean_storage."""
    with get_connection() as conn:
        run_migrations(conn, MIGRATIONS)


def test_acquire_and_release_leaves_no_row():
    from app.db.chapter_locks import chapter_lock

    chapter_id = "lock-test-basic"
    with get_connection() as conn:
        with chapter_lock(conn, chapter_id, held_by="test"):
            pass

    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM chapter_locks WHERE chapter_id = ?", (chapter_id,)
        ).fetchone()
    assert row is None, "lock row must be cleared on release"


def test_lock_row_visible_to_other_connection_while_held():
    """Acquire/release must be separate transactions from the protected work,
    so another connection can observe the row mid-operation (closes the
    frontier-pass finding that a nested transaction never commits until the
    whole operation finishes)."""
    from app.db.chapter_locks import chapter_lock

    chapter_id = "lock-test-visible"
    with get_connection() as held_conn:
        with chapter_lock(held_conn, chapter_id, held_by="test-holder"):
            # A second, independent connection to the same DB file must see
            # the row committed by the acquire step.
            with get_connection() as other_conn:
                row = other_conn.execute(
                    "SELECT held_by FROM chapter_locks WHERE chapter_id = ?",
                    (chapter_id,),
                ).fetchone()
            assert row is not None, "lock row must be visible to another connection while held"
            assert row["held_by"] == "test-holder"


def test_second_acquire_while_held_raises():
    from app.db.chapter_locks import ChapterLockHeldError

    chapter_id = "lock-test-conflict"
    # Simulate a live hold from another operation directly.
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO chapter_locks (chapter_id, held_by, acquired_at) VALUES (?, ?, ?)",
            (chapter_id, "other-op", time.time()),
        )
        conn.commit()

    from app.db.chapter_locks import chapter_lock

    with get_connection() as conn:
        with pytest.raises(ChapterLockHeldError):
            with chapter_lock(conn, chapter_id, held_by="me"):
                pass

    # Cleanup
    with get_connection() as conn:
        conn.execute("DELETE FROM chapter_locks WHERE chapter_id = ?", (chapter_id,))
        conn.commit()


def test_stale_lock_is_evicted_and_new_acquire_succeeds():
    from app.db.chapter_locks import chapter_lock, CHAPTER_LOCK_STALE_AFTER_SECONDS

    chapter_id = "lock-test-stale"
    stale_acquired_at = time.time() - (CHAPTER_LOCK_STALE_AFTER_SECONDS + 60)
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO chapter_locks (chapter_id, held_by, acquired_at) VALUES (?, ?, ?)",
            (chapter_id, "crashed-op", stale_acquired_at),
        )
        conn.commit()

    with get_connection() as conn:
        # Must NOT raise — the stale row is evicted before the new insert.
        with chapter_lock(conn, chapter_id, held_by="fresh-op"):
            pass

    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM chapter_locks WHERE chapter_id = ?", (chapter_id,)
        ).fetchone()
    assert row is None
