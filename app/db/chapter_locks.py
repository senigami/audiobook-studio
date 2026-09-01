"""Per-chapter lock observability primitive (#232 Task 004).

``chapter_locks`` provides NO additional correctness serialization beyond
what SQLite's own writer lock already gives every ``BEGIN IMMEDIATE``
transaction on a single DB file — a second such transaction blocks on
SQLite itself the moment it tries to acquire the write lock, whether or not
this table exists. Its only job is answering "what operation is/was
mutating this chapter" (``held_by``, ``acquired_at``) for a human or a
diagnostic query, e.g. why a chapter appears unresponsive or a migration
looks stuck. Every real shape-mutating operation (resync, split, GC's
tombstone sweep) must still wrap its actual work in its own
``BEGIN IMMEDIATE`` transaction regardless of this lock — that transaction,
not this row, is what prevents two such operations from interleaving.

Acquire and release each run in their OWN short transaction, committed
before/after the protected work, specifically so the row is observable by
another connection for the actual duration of the operation — nesting it
inside the protected work's own transaction would mean nothing commits
until the whole operation finishes, so no other connection would ever see
it "held."
"""
from __future__ import annotations

import sqlite3
import time
from contextlib import contextmanager

# Generous: a real migration or a large resync can legitimately run long.
CHAPTER_LOCK_STALE_AFTER_SECONDS = 900


class ChapterLockHeldError(Exception):
    """Raised when a chapter's lock row is already held by a live operation."""

    def __init__(self, chapter_id: str):
        super().__init__(f"chapter {chapter_id} is locked by another operation")
        self.chapter_id = chapter_id


@contextmanager
def chapter_lock(conn: sqlite3.Connection, chapter_id: str, held_by: str):
    """Acquire the observability lock row for ``chapter_id``, then release it.

    Raises ``ChapterLockHeldError`` if a live (non-stale) row already exists
    for this chapter. A row older than ``CHAPTER_LOCK_STALE_AFTER_SECONDS``
    is evicted before the new acquisition is attempted, so a crash between a
    prior acquire and its release never permanently blocks the chapter.

    Does not nest inside a caller's own protected-work transaction — acquire
    commits before the caller's ``with`` block body runs, release commits
    after it exits.
    """
    conn.execute("BEGIN IMMEDIATE")
    conn.execute(
        "DELETE FROM chapter_locks WHERE chapter_id = ? AND acquired_at < ?",
        (chapter_id, time.time() - CHAPTER_LOCK_STALE_AFTER_SECONDS),
    )
    try:
        conn.execute(
            "INSERT INTO chapter_locks (chapter_id, held_by, acquired_at) VALUES (?, ?, ?)",
            (chapter_id, held_by, time.time()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise ChapterLockHeldError(chapter_id)

    try:
        yield
    finally:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM chapter_locks WHERE chapter_id = ?", (chapter_id,))
        conn.commit()
