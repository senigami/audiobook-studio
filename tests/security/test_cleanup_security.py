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

    with patch("app.core.config.PROJECTS_DIR", projects_dir), \
         patch("app.core.config.TRASH_DIR", tmp_path / "trash"):
        (tmp_path / "trash").mkdir()
        yield projects_dir


def test_cleanup_chapter_audio_files_traversal_blocked(mock_projects_root):
    """
    A non-UUID chapter_id (e.g. a path traversal string) must be rejected by
    canonical_chapter_id() before any filesystem access occurs.  Calling
    cleanup_chapter_audio_files with such an id must return False (blocked) and
    must not delete any file outside the projects root.
    """
    projects_dir = mock_projects_root

    # Create a sentinel file that must NOT be deleted
    outside_dir = projects_dir.parent / "escape"
    outside_dir.mkdir(exist_ok=True)
    outside_file = outside_dir / "chapter.wav"
    outside_file.write_text("data")

    # Attempt traversal: non-UUID chapter_id goes through the real function
    result = cleanup_chapter_audio_files("p1", "../../escape")

    # The guard (canonical_chapter_id raises ValueError) returns False
    assert result is False, "cleanup should return False for invalid chapter id"

    # The sentinel file must be untouched
    assert outside_file.exists(), "file outside projects root must not be deleted"


def test_move_to_trash_traversal_blocked(mock_projects_root):
    """
    canonical_chapter_id must reject a traversal chapter_id string and prevent
    move_chapter_artifacts_to_trash from creating directories outside the
    project root.
    """
    projects_dir = mock_projects_root

    # Attempt a real traversal via a non-UUID chapter_id
    result = move_chapter_artifacts_to_trash("p1", "../../evil")

    # Should be blocked before any directory is created
    assert result is False

    # Verify no directory was created outside projects_dir
    evil_loc = projects_dir.parent / "evil"
    assert not evil_loc.exists()


