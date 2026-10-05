from app.utils.text.textops import split_into_parts, split_by_chapter_markers, write_chapters_to_folder
from pathlib import Path

def test_split_into_parts():
    text = "Word1 Word2 Word3 Word4"
    # Split by 10 characters
    parts = split_into_parts(text, max_chars=10)
    assert len(parts) >= 2
    # parts[i] is (part_num, heading, body)
    reconstructed = "".join(p[2] for p in parts)
    assert reconstructed.replace(" ", "") == "Word1Word2Word3Word4"

def test_split_by_chapter_markers():
    # CHAPTER_RE expects "Chapter 1: Heading"
    text = "Chapter 1 : Introduction\nContent 1\nChapter 2 : Second bit\nContent 2"
    chapters = split_by_chapter_markers(text)
    assert len(chapters) == 2
    assert chapters[0][1] == "Chapter 1 : Introduction"

def test_write_chapters_to_folder(tmp_path):
    # Expects (num, heading, body)
    chapters = [(1, "Ch1", "Text 1"), (2, "Ch2", "Text 2")]
    written = write_chapters_to_folder(chapters, tmp_path)
    assert len(written) == 2
    # Filename will be chapter_0001_Ch1.txt
    assert (tmp_path / "chapter_0001_Ch1.txt").exists()
    assert (tmp_path / "chapter_0002_Ch2.txt").exists()
