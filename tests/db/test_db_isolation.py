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

