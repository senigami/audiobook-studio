import pytest
import os
import time
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.migration import import_legacy_filesystem_data

def test_import_legacy_filesystem_data_no_files(tmp_path):
    chap_dir = tmp_path / "chapters"
    chap_dir.mkdir()

    with patch("app.migration.CHAPTER_DIR", chap_dir):
        res = import_legacy_filesystem_data()
        assert res["status"] == "success"
        assert "No legacy text files found" in res["message"]

def test_import_legacy_filesystem_data_success(tmp_path):
    chap_dir = tmp_path / "chapters"
    out_dir = tmp_path / "xtts_out"
    chap_dir.mkdir()
    out_dir.mkdir()

    (chap_dir / "chap1.txt").write_text("Chapter 1 content", encoding="utf-8")
    (out_dir / "chap1.mp3").write_text("audio", encoding="utf-8")

    (chap_dir / "chap2.txt").write_text("Chapter 2 content", encoding="utf-8")
    # chap2 has no audio

    mock_conn = MagicMock()
    mock_cursor = mock_conn.cursor.return_value

    with patch("app.migration.CHAPTER_DIR", chap_dir), \
         patch("app.migration.XTTS_OUT_DIR", out_dir), \
         patch("app.migration.create_project", return_value="proj_123"), \
         patch("app.migration.get_connection", return_value=MagicMock(__enter__=lambda s: mock_conn, __exit__=lambda s, *a: None)):

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
