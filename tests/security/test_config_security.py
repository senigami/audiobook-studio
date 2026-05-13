import pytest
import os
from pathlib import Path
from app.core.config import get_chapter_dir, _find_file, PROJECTS_DIR

def test_get_chapter_dir_traversal_blocked(tmp_path):
    # Setup mock PROJECTS_DIR
    mock_projects = tmp_path / "projects"
    mock_projects.mkdir()

    valid_proj = "12345678-1234-5678-1234-567812345678"
    valid_chap = "87654321-4321-8765-4321-876543210987"

    with pytest.MonkeyPatch.context() as m:
        m.setattr("app.core.config.PROJECTS_DIR", mock_projects)

        # Valid ID
        p_dir = get_chapter_dir(valid_proj, valid_chap)
        assert f"{valid_proj}/chapters/{valid_chap}" in str(p_dir).replace("\\", "/")

        # Traversal ID (caught by UUID check)
        with pytest.raises(ValueError, match="Invalid chapter id"):
            get_chapter_dir(valid_proj, "../../evil")

def test_find_file_traversal_blocked(tmp_path):
    # Setup mock roots
    mock_chapters = tmp_path / "chapters"
    mock_chapters.mkdir()

    evil_dir = tmp_path / "evil"
    evil_dir.mkdir()
    (evil_dir / "secret.txt").write_text("pwned")

    with pytest.MonkeyPatch.context() as m:
        m.setattr("app.core.config.PROJECTS_DIR", tmp_path / "projects")
        m.setattr("app.core.config.VOICES_DIR", tmp_path / "voices")
        # Mock temp dir to something else so evil_dir isn't allowed by the test-mode escape hatch
        m.setattr("tempfile.gettempdir", lambda: str(tmp_path / "not_evil"))

        # Try to find file in an unauthorized directory
        res = _find_file(evil_dir, "secret.txt")
        assert res is None

        # Valid directory
        valid_dir = tmp_path / "projects"
        valid_dir.mkdir(parents=True, exist_ok=True)
        (valid_dir / "valid.txt").write_text("ok")
        res = _find_file(valid_dir, "valid.txt")
        assert res is not None
        assert res.name == "valid.txt"
