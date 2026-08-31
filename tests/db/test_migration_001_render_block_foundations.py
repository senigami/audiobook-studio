"""Tests for migration version 1: segment_render_block_foundations (#232 Task 001).

Purely additive migration — new columns/tables only, no existing row rewritten
except the text_hash backfill. Exercised against a real schema built by
app.db.core.init_db(), not a synthetic throwaway table, so the ALTER TABLE
statements run against the actual chapter_segments/chapters shape.
"""
import hashlib
import os
import sqlite3
import uuid

import pytest

from app.db.migrations.runner import run_migrations


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test_render_block_foundations.db"
    monkeypatch.setenv("DB_PATH", str(path))
    from app.db.core import init_db

    init_db()
    return path


def _raw_connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _columns(conn, table):
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}


def _seed_chapter_with_segments(conn, n=3):
    project_id = str(uuid.uuid4())
    chapter_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO projects (id, name) VALUES (?, ?)", (project_id, "Test Project")
    )
    conn.execute(
        "INSERT INTO chapters (id, project_id, title) VALUES (?, ?, ?)",
        (chapter_id, project_id, "Chapter One"),
    )
    segment_ids = []
    for i in range(n):
        segment_id = str(uuid.uuid4())
        segment_ids.append(segment_id)
        conn.execute(
            "INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content) "
            "VALUES (?, ?, ?, ?)",
            (segment_id, chapter_id, i, f"Sentence number {i}."),
        )
    conn.commit()
    return chapter_id, segment_ids


def test_pre_migration_schema_lacks_new_columns_and_tables(db_path):
    """R1 baseline: confirms the columns/tables genuinely don't exist yet."""
    conn = _raw_connect(db_path)
    try:
        seg_cols = _columns(conn, "chapter_segments")
        chapter_cols = _columns(conn, "chapters")
        assert "start_offset" not in seg_cols
        assert "end_offset" not in seg_cols
        assert "text_hash" not in seg_cols
        assert "render_epoch" not in chapter_cols

        tables = {
            row["name"]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        assert "chapter_locks" not in tables
        assert "segment_audio_tombstones" not in tables
    finally:
        conn.close()


def test_migration_adds_columns_and_tables(db_path):
    from app.db.migrations.registry import MIGRATIONS

    conn = _raw_connect(db_path)
    try:
        _seed_chapter_with_segments(conn)
        applied = run_migrations(conn, MIGRATIONS, db_path=db_path)
        assert [m.version for m in applied] == [1]

        seg_cols = _columns(conn, "chapter_segments")
        chapter_cols = _columns(conn, "chapters")
        assert "start_offset" in seg_cols
        assert "end_offset" in seg_cols
        assert "text_hash" in seg_cols
        assert "render_epoch" in chapter_cols

        tables = {
            row["name"]
            for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        assert "chapter_locks" in tables
        assert "segment_audio_tombstones" in tables

        # render_epoch defaults to 0 for existing rows
        row = conn.execute("SELECT render_epoch FROM chapters LIMIT 1").fetchone()
        assert row["render_epoch"] == 0
    finally:
        conn.close()


def test_migration_backfills_text_hash_for_every_existing_row(db_path):
    from app.db.migrations.registry import MIGRATIONS
    from app.db.segments import segment_text_hash

    conn = _raw_connect(db_path)
    try:
        chapter_id, segment_ids = _seed_chapter_with_segments(conn, n=5)
        run_migrations(conn, MIGRATIONS, db_path=db_path)

        null_count = conn.execute(
            "SELECT COUNT(*) AS c FROM chapter_segments WHERE text_hash IS NULL"
        ).fetchone()["c"]
        assert null_count == 0

        rows = conn.execute(
            "SELECT id, text_content, text_hash FROM chapter_segments WHERE chapter_id = ?",
            (chapter_id,),
        ).fetchall()
        assert len(rows) == 5
        for row in rows:
            expected = segment_text_hash(row["text_content"])
            assert row["text_hash"] == expected
            # sanity: matches the raw sha256 formula directly, not just the helper
            assert expected == hashlib.sha256(
                row["text_content"].strip().encode("utf-8")
            ).hexdigest()
    finally:
        conn.close()


def test_migration_is_idempotent_on_already_migrated_db(db_path):
    from app.db.migrations.registry import MIGRATIONS

    conn = _raw_connect(db_path)
    try:
        _seed_chapter_with_segments(conn)
        first = run_migrations(conn, MIGRATIONS, db_path=db_path)
        assert len(first) == 1

        # Re-running must be a safe no-op: no ALTER TABLE re-attempted (which
        # would raise "duplicate column name" in sqlite), no rows re-applied.
        second = run_migrations(conn, MIGRATIONS, db_path=db_path)
        assert second == []
    finally:
        conn.close()
