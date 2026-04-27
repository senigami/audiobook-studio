import pytest
import os
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock

from app.domain.projects.migration import migrate_project_to_v2
from app import config

@pytest.fixture
def mock_projects_root(tmp_path):
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()
    with patch("app.config.PROJECTS_DIR", projects_dir):
        yield projects_dir

def test_migrate_project_to_v2_traversal_blocked(mock_projects_root):
    # Setup legacy project
    pid = "project1"
    pdir = mock_projects_root / pid
    pdir.mkdir()

    audio_dir = pdir / "audio"
    audio_dir.mkdir()
    text_dir = pdir / "text"
    text_dir.mkdir()

    # Create malicious chapter with traversal ID in DB
    evil_cid = "../../evil_chap"
    (audio_dir / "evil.wav").write_text("audio content")

    # We mock list_chapters to return this evil ID
    mock_chapters = [{"id": evil_cid, "audio_file_path": "evil.wav"}]

    with patch("app.domain.projects.migration.list_chapters", return_value=mock_chapters), \
         patch("app.domain.projects.migration.load_project_manifest", return_value={"version": 1}), \
         patch("app.domain.projects.migration.save_project_manifest"):

        # This might raise ValueError or just skip the evil chapter
        # If it doesn't block it, it might try to create chapters/../../evil_chap
        # which is projects/evil_chap (outside project1)

        # Currently, migrate_project_to_v2 uses Path objects which might resolve this,
        # but CodeQL wants to see explicit containment checks.

        try:
            migrate_project_to_v2(pid)
        except (ValueError, OSError):
            pass

    # Verify no directory was created outside pdir
    evil_dir = mock_projects_root / "evil_chap"
    assert not evil_dir.exists()

    # Verify no file was moved outside pdir
    evil_file = mock_projects_root / "chapter.wav"
    assert not evil_file.exists()

def test_migrate_project_to_v2_success(mock_projects_root):
    # Setup legacy project
    pid = "project1"
    pdir = mock_projects_root / pid
    pdir.mkdir()

    audio_dir = pdir / "audio"
    audio_dir.mkdir()
    text_dir = pdir / "text"
    text_dir.mkdir()

    cid = "chap1"
    (audio_dir / f"{cid}.wav").write_text("audio content")
    (text_dir / f"{cid}.txt").write_text("text content")

    mock_chapters = [{"id": cid}]

    with patch("app.domain.projects.migration.list_chapters", return_value=mock_chapters), \
         patch("app.domain.projects.migration.load_project_manifest", return_value={"version": 1}), \
         patch("app.domain.projects.migration.save_project_manifest"), \
         patch("app.db.segments.get_chapter_segments", return_value=[]), \
         patch("app.db.segments.update_segment"):

        success = migrate_project_to_v2(pid)
        assert success

    # Verify migration results
    nested_dir = pdir / "chapters" / cid
    assert (nested_dir / "chapter.wav").exists()
    assert (nested_dir / "chapter.txt").exists()
    assert not (audio_dir / f"{cid}.wav").exists()
    assert not (text_dir / f"{cid}.txt").exists()
