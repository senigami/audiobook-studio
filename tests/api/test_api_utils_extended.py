import pytest
import uuid
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.api.utils import (
    read_preview, exists,
    is_react_dev_active, list_audiobooks
)
from app.core import config
from app.utils.pathing import safe_join

def test_read_preview(tmp_path):
    p = tmp_path / "test.txt"
    p.write_text("A" * 10, encoding="utf-8")
    assert read_preview(p, max_chars=5) == "AAAAA\n\n...[preview truncated]..."
    assert read_preview(p, max_chars=20) == "AAAAAAAAAA"

    non_existent = tmp_path / "none.txt"
    assert read_preview(non_existent) == ""

def test_exists(tmp_path):
    # V2 Nested Chapter Audio
    project_id = str(uuid.uuid4())
    chapter_id = str(uuid.uuid4())
    proj_dir = tmp_path / "projects" / project_id
    chap_dir = proj_dir / "chapters" / chapter_id
    chap_dir.mkdir(parents=True)

    (chap_dir / "chapter.wav").write_text("wav")

    with patch("app.core.config.PROJECTS_DIR", tmp_path / "projects"):
        assert exists("mixed", "chapter.wav", project_id=project_id, chapter_id=chapter_id) is True
        assert exists("mixed", "missing.wav", project_id=project_id, chapter_id=chapter_id) is False

        # Audiobook m4b (remains project-level for now)
        proj_m4b = proj_dir / "m4b"
        proj_m4b.mkdir(parents=True)
        (proj_m4b / "book.m4b").write_text("m4b")
        assert exists("audiobook", "book", project_id=project_id) is True

    # Traversal-style input should be rejected (stem check)
    assert exists("xtts", "../../evil", project_id="p1") is False

    assert exists("invalid", "test", project_id="p1") is False




def test_safe_join_allows_nested_relative_paths(tmp_path):
    root = tmp_path / "root"
    nested = root / "a" / "b.txt"
    nested.parent.mkdir(parents=True)
    nested.write_text("ok")

    assert safe_join(root, "a/b.txt") == nested.resolve()

    with pytest.raises(ValueError):
        safe_join(root, "../../escape.txt")

def test_is_react_dev_active():
    with patch("socket.socket") as mock_sock:
        mock_instance = mock_sock.return_value
        mock_instance.connect_ex.return_value = 0
        assert is_react_dev_active() is True

        mock_instance.connect_ex.return_value = 1
        assert is_react_dev_active() is False



def test_list_audiobooks(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PROJECTS_DIR", tmp_path / "projects")
    config.PROJECTS_DIR.mkdir()

    # Project m4b
    proj_dir = config.PROJECTS_DIR / "p1"
    m4b_dir = proj_dir / "m4b"
    m4b_dir.mkdir(parents=True)
    proj_m4b = m4b_dir / "project.m4b"
    proj_m4b.write_text("project")

    with patch("app.api.utils.probe_audiobook_metadata") as mock_probe:
        mock_probe.return_value = {"format": {"duration": "100.5", "tags": {"title": "Test Book"}}}
        books = list_audiobooks()
        assert len(books) == 1

        proj_book = books[0]
        assert proj_book["filename"] == "project.m4b"
        assert "/projects/p1/m4b/project.m4b" in proj_book["url"]
        assert proj_book["duration_seconds"] == 100.5
        assert proj_book["title"] == "Test Book"
