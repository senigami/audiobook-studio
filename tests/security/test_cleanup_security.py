import pytest
import os
import shutil
from pathlib import Path
from unittest.mock import patch
from app.db.chapters_cleanup import cleanup_chapter_audio_files, move_chapter_artifacts_to_trash

@pytest.fixture
def mock_projects_root(tmp_path):
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()
    xtts_out_dir = tmp_path / "xtts_out"
    xtts_out_dir.mkdir()

    with patch("app.config.PROJECTS_DIR", projects_dir), \
         patch("app.config.XTTS_OUT_DIR", xtts_out_dir), \
         patch("app.config.TRASH_DIR", tmp_path / "trash"):
        (tmp_path / "trash").mkdir()
        yield projects_dir, xtts_out_dir

def test_cleanup_chapter_audio_files_traversal_blocked(mock_projects_root):
    projects_dir, xtts_out_dir = mock_projects_root

    # Create a file outside
    outside_dir = projects_dir.parent / "escape"
    outside_dir.mkdir(exist_ok=True)
    outside_file = outside_dir / "chapter.wav"
    outside_file.write_text("data")

    valid_uuid = "12345678-1234-5678-1234-567812345678"

    # If nested_pdir is manipulated to point outside
    with patch("app.config.get_chapter_dir", return_value=outside_dir):
        cleanup_chapter_audio_files("p1", valid_uuid)

        # Verify it still exists (deletion was blocked)
        assert outside_file.exists()

def test_move_to_trash_traversal_blocked(mock_projects_root):
    projects_dir, _ = mock_projects_root

    # Create a source file to "move"
    src_dir = projects_dir / "p1"
    src_dir.mkdir(parents=True, exist_ok=True)
    src_file = src_dir / "chapter.wav"
    src_file.write_text("audio data")

    valid_uuid = "12345678-1234-5678-1234-567812345678"

    # Mock canonical ID to return a traversal path
    with patch("app.config.canonical_chapter_id", return_value="../../evil"):
        # The hardening logic should catch this
        move_chapter_artifacts_to_trash("p1", valid_uuid)

        # Verify the file was NOT moved to the escape location
        evil_loc = projects_dir.parent / "evil"
        assert not (evil_loc / "audio" / "chapter.wav").exists()
        # Source should still be there or at least not at the evil location
        assert src_file.exists()
