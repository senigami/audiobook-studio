"""Shared primitives for the ``segment_audio_tombstones`` table (#232 Task 004).

A tombstone row records that a segment audio filename was intentionally
invalidated (by resync, or by the write-back guard discarding a stale
render) and has become a GC deletion candidate. Writing one on invalidation
and clearing one on a successful re-render belong to those call sites
(Task 002/003, per ``01-map.md``'s Locking/GC parts and this task's own
"Who writes tombstones"/"Who clears tombstones" sections) — this module is
just the shared SQL so neither call site hand-rolls it.
"""
from __future__ import annotations

import sqlite3
import time

from app.db.core import get_connection


def write_tombstone(conn: sqlite3.Connection, chapter_id: str, filename: str) -> None:
    """Record ``filename`` as a GC deletion candidate. Caller commits."""
    conn.execute(
        """
        INSERT INTO segment_audio_tombstones (filename, chapter_id, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT (filename, chapter_id) DO UPDATE SET created_at = excluded.created_at
        """,
        (filename, chapter_id, time.time()),
    )


def clear_tombstone(conn: sqlite3.Connection, chapter_id: str, filename: str) -> None:
    """Remove a tombstone for a filename that is live again. Caller commits."""
    conn.execute(
        "DELETE FROM segment_audio_tombstones WHERE chapter_id = ? AND filename = ?",
        (chapter_id, filename),
    )


def has_tombstone(chapter_id: str, filename: str) -> bool:
    """Standalone check for read paths outside an existing connection/lock.

    The version-1 migration (#232 Task 001) is what creates this table; a
    DB that predates it (or a test fixture building a minimal schema by
    hand without running the migration registry) simply has no tombstones
    yet, so treat "table doesn't exist" the same as "no tombstone" rather
    than raising — this is a pure read-path availability check, not a
    correctness-critical write.
    """
    with get_connection() as conn:
        try:
            row = conn.execute(
                "SELECT 1 FROM segment_audio_tombstones WHERE chapter_id = ? AND filename = ? LIMIT 1",
                (chapter_id, filename),
            ).fetchone()
        except sqlite3.OperationalError as exc:
            if "no such table" in str(exc):
                return False
            raise
    return row is not None
