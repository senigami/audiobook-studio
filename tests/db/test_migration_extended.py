import pytest
import os
import time
import uuid
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.db.legacy_migration import import_legacy_filesystem_data

from app.db.migration import migrate_legacy_project_covers

def test_import_legacy_filesystem_data_no_files(tmp_path):
    chap_dir = tmp_path / "chapters"
    chap_dir.mkdir()

    with patch("app.db.legacy_migration.CHAPTER_DIR", chap_dir):
        res = import_legacy_filesystem_data()
        assert res["status"] == "success"
        assert "No legacy text files found" in res["message"]

def test_import_legacy_filesystem_data_success(tmp_path):
    chap_dir = tmp_path / "chapters"
    out_dir = tmp_path / "audio_out"
    chap_dir.mkdir()
    out_dir.mkdir()

    (chap_dir / "chap1.txt").write_text("Chapter 1 content", encoding="utf-8")
    (out_dir / "chap1.mp3").write_text("audio", encoding="utf-8")

    (chap_dir / "chap2.txt").write_text("Chapter 2 content", encoding="utf-8")
    # chap2 has no audio

    mock_conn = MagicMock()
    mock_cursor = mock_conn.cursor.return_value

    with patch("app.db.legacy_migration.CHAPTER_DIR", chap_dir), \
         patch("app.db.legacy_migration.AUDIO_OUT_DIR", out_dir), \
         patch("app.db.legacy_migration.create_project", return_value="proj_123"), \
         patch("app.db.legacy_migration.get_connection", return_value=MagicMock(__enter__=lambda s: mock_conn, __exit__=lambda s, *a: None)):

        res = import_legacy_filesystem_data()

        assert res["status"] == "success"
        assert "Successfully imported 2 chapters" in res["message"]
        assert res["project_id"] == "proj_123"

        # Verify database calls
        assert mock_cursor.execute.call_count == 2
        # Check calls (status is at index 5 in the tuple)
        calls = mock_cursor.execute.call_args_list
        statuses = [call[0][1][5] for call in calls]
        assert "done" in statuses
        assert "unprocessed" in statuses

def test_migrate_legacy_project_covers_success(tmp_path):
    # Setup paths
    projects_dir = tmp_path / "projects"
    cover_dir = tmp_path / "uploads" / "covers"
    projects_dir.mkdir()
    cover_dir.mkdir(parents=True)

    # Valid UUID for project ID
    proj_id = str(uuid.uuid4())

    # Create legacy cover
    (cover_dir / "old_cover.jpg").write_text("fake-image")

    # Mock DB
    mock_conn = MagicMock()
    mock_cursor = mock_conn.cursor.return_value
    # Mock row as a dict-like object (sqlite3.Row)
    mock_cursor.fetchall.return_value = [
        {"id": proj_id, "cover_image_path": "/out/covers/old_cover.jpg"}
    ]

    with patch("app.core.config.PROJECTS_DIR", projects_dir), \
         patch("app.core.config.COVER_DIR", cover_dir), \
         patch("app.db.migration.get_connection", return_value=MagicMock(__enter__=lambda s: mock_conn, __exit__=lambda s, *a: None)):

        count = migrate_legacy_project_covers()
        assert count == 1

        # Verify file moved (copied actually in the implementation)
        assert (projects_dir / proj_id / "cover" / "cover.jpg").exists()

        # Verify DB updated
        calls = mock_cursor.execute.call_args_list
        update_call = None
        for call in calls:
            if "UPDATE projects SET cover_image_path = ?" in call[0][0]:
                update_call = call
                break
        assert update_call is not None
        assert update_call[0][1][0] == f"/projects/{proj_id}/cover/cover.jpg"
