import pytest
import sqlite3
import os
from pathlib import Path
from app.db.core import get_connection, get_studio_connection, init_db, verify_and_cleanup_legacy_tables

def test_database_separation_isolation(tmp_path, monkeypatch):
    """
    Asserts database separation:
    - User/project tables must reside in audiobook_studio.db.
    - Operational tables (settings, render_performance_samples) must reside in studio.db.
    - Connections to one DB must not be able to query tables belonging to the other.
    """
    # 1. Setup isolated databases in the temp path
    user_db = tmp_path / "test_audiobook_studio.db"
    studio_db = tmp_path / "test_studio.db"

    monkeypatch.setenv("DB_PATH", str(user_db))
    monkeypatch.setenv("STUDIO_DB_PATH", str(studio_db))

    # Run DB initializers
    init_db()

    # 2. Check user DB schemas
    user_conn = sqlite3.connect(user_db)
    user_conn.row_factory = sqlite3.Row
    user_cursor = user_conn.cursor()

    user_cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    user_tables = {row["name"] for row in user_cursor.fetchall()}

    # Should contain project/user tables
    expected_user_tables = {"projects", "chapters", "chapter_segments", "characters", "processing_queue", "speakers"}
    for table in expected_user_tables:
        assert table in user_tables, f"Expected table {table} in user database"

    # Should NOT contain settings or performance metrics tables
    assert "settings" not in user_tables
    assert "render_performance_samples" not in user_tables
    user_conn.close()

    # 3. Check studio DB schemas
    studio_conn = sqlite3.connect(studio_db)
    studio_conn.row_factory = sqlite3.Row
    studio_cursor = studio_conn.cursor()

    studio_cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    studio_tables = {row["name"] for row in studio_cursor.fetchall()}

    assert "settings" in studio_tables
    assert "render_performance_samples" in studio_tables

    # Should NOT contain project tables
    for table in expected_user_tables:
        assert table not in studio_tables, f"Table {table} should not be in studio database"
    studio_conn.close()

    # 4. Verify core connection helpers access the correct isolated databases
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM projects") # Should pass
        with pytest.raises(sqlite3.OperationalError):
            cursor.execute("SELECT 1 FROM settings") # Should fail in user connection

    with get_studio_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM settings") # Should pass
        with pytest.raises(sqlite3.OperationalError):
            cursor.execute("SELECT 1 FROM projects") # Should fail in studio connection


def test_legacy_table_cleanup(tmp_path, monkeypatch):
    """
    Ensure that legacy tables (settings, render_performance_samples) are removed from the user db
    after init when they also exist in the studio db.
    """
    user_db = tmp_path / "test_audiobook_studio.db"
    studio_db = tmp_path / "test_studio.db"
    monkeypatch.setenv("DB_PATH", str(user_db))
    monkeypatch.setenv("STUDIO_DB_PATH", str(studio_db))
    # Initialize databases (creates tables)
    init_db()
    # Manually create legacy tables in user DB to simulate old state
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        cur.execute("CREATE TABLE IF NOT EXISTS render_performance_samples (id INTEGER PRIMARY KEY)")
        conn.commit()
    # Ensure they exist before cleanup
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
        assert cur.fetchone() is not None
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='render_performance_samples'")
        assert cur.fetchone() is not None
    # Run cleanup
    with get_connection() as conn:
        verify_and_cleanup_legacy_tables(conn)
    # Verify they have been removed from user DB
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
        assert cur.fetchone() is None
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='render_performance_samples'")
        assert cur.fetchone() is None
    # Verify they still exist in studio DB
    with get_studio_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
        assert cur.fetchone() is not None
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='render_performance_samples'")
        assert cur.fetchone() is not None


def test_legacy_table_cleanup_with_data(tmp_path, monkeypatch):
    """
    Ensure that data inside legacy tables (settings, render_performance_samples) in user DB
    is migrated/backed up to studio DB instead of being silently dropped.
    """
    user_db = tmp_path / "test_audiobook_studio.db"
    studio_db = tmp_path / "test_studio.db"
    monkeypatch.setenv("DB_PATH", str(user_db))
    monkeypatch.setenv("STUDIO_DB_PATH", str(studio_db))

    # Initialize databases (creates tables in studio_db)
    init_db()

    # Manually create legacy tables with data in user DB
    with sqlite3.connect(user_db) as conn:
        cur = conn.cursor()
        cur.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        cur.execute("INSERT INTO settings (key, value) VALUES ('legacy_key_1', 'legacy_val_1')")
        cur.execute("CREATE TABLE render_performance_samples (id INTEGER PRIMARY KEY, engine TEXT NOT NULL, chars INTEGER NOT NULL, segment_count INTEGER NOT NULL, duration_seconds REAL NOT NULL, synthesis_duration_seconds REAL NOT NULL, inter_group_overhead_seconds REAL NOT NULL, cps REAL NOT NULL, seconds_per_segment REAL NOT NULL, completed_at REAL NOT NULL)")
        cur.execute("INSERT INTO render_performance_samples (engine, chars, segment_count, duration_seconds, synthesis_duration_seconds, inter_group_overhead_seconds, cps, seconds_per_segment, completed_at) VALUES ('xtts', 100, 1, 10.0, 8.0, 2.0, 12.5, 10.0, 17171717.0)")
        conn.commit()

    # Verify studio DB tables are currently empty
    conn = get_studio_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM settings WHERE key = 'legacy_key_1'")
        assert cur.fetchone()[0] == 0
        cur.execute("SELECT COUNT(*) FROM render_performance_samples WHERE engine = 'xtts'")
        assert cur.fetchone()[0] == 0
    finally:
        conn.close()

    # Run cleanup
    conn = get_connection()
    try:
        verify_and_cleanup_legacy_tables(conn)
    finally:
        conn.close()

    # Verify they have been removed from user DB
    with sqlite3.connect(user_db) as conn:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('settings', 'render_performance_samples')")
        assert len(cur.fetchall()) == 0

    # Verify the legacy data was migrated to studio DB
    conn = get_studio_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT value FROM settings WHERE key = 'legacy_key_1'")
        row = cur.fetchone()
        assert row is not None
        assert row[0] == 'legacy_val_1'

        cur.execute("SELECT chars, duration_seconds, synthesis_duration_seconds, completed_at FROM render_performance_samples WHERE engine = 'xtts'")
        row = cur.fetchone()
        assert row is not None
        assert row[0] == 100
        assert row[1] == 10.0
        assert row[2] == 8.0
        assert row[3] == 17171717.0
    finally:
        conn.close()
