import pytest
import json
import uuid
import sqlite3
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.db.migration import migrate_state_json_to_db
from app import config

@pytest.fixture
def mock_db(tmp_path):
    db_path = tmp_path / "test.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE projects (
            id TEXT PRIMARY KEY,
            name TEXT,
            series TEXT,
            author TEXT,
            created_at REAL,
            updated_at REAL
        )
    """)
    cursor.execute("""
        CREATE TABLE chapters (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            title TEXT,
            sort_order INTEGER,
            audio_status TEXT,
            audio_file_path TEXT,
            text_last_modified REAL,
            predicted_audio_length REAL
        )
    """)
    conn.commit()
    yield conn
    conn.close()

def test_migrate_state_json_to_db_no_file(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "BASE_DIR", tmp_path)
    # Should just return
    migrate_state_json_to_db()

def test_migrate_state_json_to_db_success(tmp_path, monkeypatch, mock_db):
    monkeypatch.setattr(config, "BASE_DIR", tmp_path)
    state_file = tmp_path / "state.json"
    state_data = {
        "jobs": {
            "job1": {
                "chapter_file": "c1.txt",
                "status": "done",
                "output_mp3": "c1.mp3",
                "eta_seconds": 120
            },
            "job2": {
                "chapter_file": "c2.txt",
                "status": "queued",
                "custom_title": "Custom Job 2"
            }
        }
    }
    state_file.write_text(json.dumps(state_data))

    with patch("app.db.migration.get_connection", return_value=MagicMock(__enter__=lambda s: mock_db, __exit__=lambda s, *a: None)):
        migrate_state_json_to_db()

        cursor = mock_db.cursor()
        cursor.execute("SELECT COUNT(*) FROM projects")
        assert cursor.fetchone()[0] == 1

        cursor.execute("SELECT COUNT(*) FROM chapters")
        assert cursor.fetchone()[0] == 2

        cursor.execute("SELECT title, audio_status FROM chapters WHERE audio_status='done'")
        row = cursor.fetchone()
        assert row[0] == "c1.txt"
        assert row[1] == "done"

def test_migrate_state_json_to_db_already_migrated(tmp_path, monkeypatch, mock_db):
    monkeypatch.setattr(config, "BASE_DIR", tmp_path)
    state_file = tmp_path / "state.json"
    state_file.write_text('{"jobs": {"j1": {"status": "done"}}}')

    # Pre-fill project
    cursor = mock_db.cursor()
    cursor.execute("INSERT INTO projects (id, name) VALUES ('p1', 'Existing')")
    mock_db.commit()

    with patch("app.db.migration.get_connection", return_value=MagicMock(__enter__=lambda s: mock_db, __exit__=lambda s, *a: None)):
        migrate_state_json_to_db()

        # Should NOT add more projects/chapters
        cursor.execute("SELECT COUNT(*) FROM projects")
        assert cursor.fetchone()[0] == 1
        cursor.execute("SELECT COUNT(*) FROM chapters")
        assert cursor.fetchone()[0] == 0
