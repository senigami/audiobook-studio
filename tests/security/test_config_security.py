import pytest
import os
from pathlib import Path
from app.config import get_chapter_dir, _find_file, PROJECTS_DIR, CHAPTER_DIR

def test_get_chapter_dir_traversal_blocked(tmp_path):
    # Setup mock PROJECTS_DIR
    mock_projects = tmp_path / "projects"
    mock_projects.mkdir()

    with pytest.MonkeyPatch.context() as m:
        m.setattr("app.config.PROJECTS_DIR", mock_projects)

        # Valid ID
        p_dir = get_chapter_dir("proj1", "chap1")
        assert "proj1/chapters/chap1" in str(p_dir)

        # Traversal ID
        with pytest.raises(ValueError, match="Path escapes root"):
            get_chapter_dir("proj1", "../../evil")

def test_find_file_traversal_blocked(tmp_path):
    # Setup mock roots
    mock_chapters = tmp_path / "chapters"
    mock_chapters.mkdir()

    evil_dir = tmp_path / "evil"
    evil_dir.mkdir()
    (evil_dir / "secret.txt").write_text("pwned")

    with pytest.MonkeyPatch.context() as m:
        m.setattr("app.config.CHAPTER_DIR", mock_chapters)
        m.setattr("app.config.XTTS_OUT_DIR", tmp_path / "xtts")
        m.setattr("app.config.VOICES_DIR", tmp_path / "voices")
        m.setattr("app.config.PROJECTS_DIR", tmp_path / "projects")
        # Mock temp dir to something else so evil_dir isn't allowed by the test-mode escape hatch
        m.setattr("tempfile.gettempdir", lambda: str(tmp_path / "not_evil"))

        # Try to find file in an unauthorized directory
        res = _find_file(evil_dir, "secret.txt")
        assert res is None

        # Valid directory
        (mock_chapters / "valid.txt").write_text("ok")
        res = _find_file(mock_chapters, "valid.txt")
        assert res is not None
        assert res.name == "valid.txt"
