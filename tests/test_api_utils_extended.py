import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from app.api.utils import (
    read_preview, output_exists, xtts_outputs_for, 
    legacy_list_chapters, is_react_dev_active,
    process_and_split_file, list_audiobooks
)
from app import config
from app.pathing import safe_join

def test_read_preview(tmp_path):
    p = tmp_path / "test.txt"
    p.write_text("A" * 10, encoding="utf-8")
    assert read_preview(p, max_chars=5) == "AAAAA\n\n...[preview truncated]..."
    assert read_preview(p, max_chars=20) == "AAAAAAAAAA"

    non_existent = tmp_path / "none.txt"
    assert read_preview(non_existent) == ""

def test_output_exists(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "XTTS_OUT_DIR", tmp_path / "xtts")
    monkeypatch.setattr(config, "AUDIOBOOK_DIR", tmp_path / "audio")
    config.XTTS_OUT_DIR.mkdir()
    config.AUDIOBOOK_DIR.mkdir()

    (config.XTTS_OUT_DIR / "test.wav").write_text("wav")
    assert output_exists("xtts", "test") is True
    assert output_exists("xtts", "missing") is False

    (config.AUDIOBOOK_DIR / "book.m4b").write_text("m4b")
    assert output_exists("audiobook", "book") is True

    # Traversal-style input should be rejected.
    assert output_exists("xtts", "../../evil") is False

    assert output_exists("invalid", "test") is False

def test_xtts_outputs_for(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "XTTS_OUT_DIR", tmp_path / "xtts")
    config.XTTS_OUT_DIR.mkdir()
    (config.XTTS_OUT_DIR / "c1.mp3").write_text("mp3")

    # Global only
    outputs = xtts_outputs_for("c1")
    assert "/out/xtts/c1.mp3" in outputs
    assert xtts_outputs_for("../../c1") == []

    # Project specific
    proj_audio = tmp_path / "proj/audio"
    proj_audio.mkdir(parents=True)
    monkeypatch.setattr(config, "get_project_audio_dir", lambda pid: proj_audio)
    (proj_audio / "c1.wav").write_text("wav")

    outputs = xtts_outputs_for("c1", project_id="p1")
    assert "/out/xtts/c1.mp3" in outputs
    assert "/out/projects/p1/audio/c1.wav" in outputs


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

def test_process_and_split_file(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(config, "CHAPTER_DIR", tmp_path / "chapters")
    config.UPLOAD_DIR.mkdir()
    config.CHAPTER_DIR.mkdir()

    upload = config.UPLOAD_DIR / "test.txt"
    upload.write_text("Line 1\nLine 2\nLine 3")

    # Split by parts
    paths = process_and_split_file("test.txt", mode="parts", max_chars=10)
    assert len(paths) > 1
    assert all(p.exists() for p in paths)

    # Split by chapter
    upload_chap = config.UPLOAD_DIR / "chap.txt"
    upload_chap.write_text("Chapter 1: Title\nContent\nChapter 2: Other\nContent")
    paths = process_and_split_file("chap.txt", mode="chapter")
    assert len(paths) == 2

def test_list_audiobooks(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "AUDIOBOOK_DIR", tmp_path / "audiobook")
    monkeypatch.setattr(config, "PROJECTS_DIR", tmp_path / "projects")
    config.AUDIOBOOK_DIR.mkdir()
    config.PROJECTS_DIR.mkdir()

    # Legacy m4b
    m4b = config.AUDIOBOOK_DIR / "legacy.m4b"
    m4b.write_text("legacy")
    (config.AUDIOBOOK_DIR / "legacy.jpg").write_text("cover")
    (config.AUDIOBOOK_DIR / "-unsafe.m4b").write_text("unsafe")

    # Project m4b
    proj_dir = config.PROJECTS_DIR / "p1"
    m4b_dir = proj_dir / "m4b"
    m4b_dir.mkdir(parents=True)
    proj_m4b = m4b_dir / "project.m4b"
    proj_m4b.write_text("project")

    with patch("app.api.utils.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout='{"format": {"duration": "100.5", "tags": {"title": "Test Book"}}}')
        books = list_audiobooks()
        assert len(books) == 2
        assert all(book["filename"] != "-unsafe.m4b" for book in books)

        legacy_book = next(b for b in books if b["filename"] == "legacy.m4b")
        assert legacy_book["duration_seconds"] == 100.5
        assert legacy_book["cover_url"] == "/out/audiobook/legacy.jpg"

        proj_book = next(b for b in books if b["filename"] == "project.m4b")
        assert "/projects/p1/m4b/project.m4b" in proj_book["url"]
        assert mock_run.call_count == 2
        first_cmd = mock_run.call_args_list[0].args[0]
        second_cmd = mock_run.call_args_list[1].args[0]
        expected_prefix = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:format_tags=title",
            "-of",
            "json",
        ]
        assert first_cmd[:7] == expected_prefix
        assert second_cmd[:7] == expected_prefix
        assert {first_cmd[-1], second_cmd[-1]} == {
            str(config.AUDIOBOOK_DIR / "legacy.m4b"),
            str(m4b_dir / "project.m4b"),
        }
