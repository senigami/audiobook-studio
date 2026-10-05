"""Migration version 1: segment_render_block_foundations (#232 Task 001).

Purely additive: new columns and tables only. No existing column is dropped
or retyped, and the only existing data touched is the text_hash backfill
(every pre-existing chapter_segments row gets one, so Task 003's write-back
guard never has to special-case a NULL hash).

start_offset/end_offset are intentionally left NULL for existing rows here —
they are populated by Task 005's destructive collapse migration, which also
adds the ux_seg_start/ux_seg_end unique indexes once real values exist (see
01-map.md's schema section for why a unique index over the nullable columns
is deferred rather than added now).
"""
from __future__ import annotations

import sqlite3

from app.db.segments import segment_text_hash


def _add_column_if_missing(conn: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        conn.execute(ddl)


def migrate_001_render_block_foundations(conn: sqlite3.Connection) -> None:
    _add_column_if_missing(
        conn, "chapter_segments", "start_offset",
        "ALTER TABLE chapter_segments ADD COLUMN start_offset INTEGER",
    )
    _add_column_if_missing(
        conn, "chapter_segments", "end_offset",
        "ALTER TABLE chapter_segments ADD COLUMN end_offset INTEGER",
    )
    _add_column_if_missing(
        conn, "chapter_segments", "text_hash",
        "ALTER TABLE chapter_segments ADD COLUMN text_hash TEXT",
    )
    _add_column_if_missing(
        conn, "chapters", "render_epoch",
        "ALTER TABLE chapters ADD COLUMN render_epoch INTEGER NOT NULL DEFAULT 0",
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS chapter_locks (
            chapter_id TEXT PRIMARY KEY,
            held_by TEXT NOT NULL,
            acquired_at REAL NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS segment_audio_tombstones (
            filename TEXT NOT NULL,
            chapter_id TEXT NOT NULL,
            created_at REAL NOT NULL,
            PRIMARY KEY (filename, chapter_id)
        )
        """
    )

    # Backfill text_hash for every existing row. Done in Python (SELECT +
    # executemany), not raw SQL — SQLite registers no `segment_text_hash`
    # function (see the task file's correction after the frontier-tier pass
    # caught a prior draft trying to call it as if it were one). Runs inside
    # the runner's single BEGIN IMMEDIATE transaction for this migration
    # entry, so atomicity is unaffected.
    rows = conn.execute(
        "SELECT id, text_content FROM chapter_segments WHERE text_hash IS NULL"
    ).fetchall()
    if rows:
        conn.executemany(
            "UPDATE chapter_segments SET text_hash = ? WHERE id = ?",
            [(segment_text_hash(text_content), id_) for id_, text_content in rows],
        )
