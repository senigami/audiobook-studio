import pytest
from app.utils.text.textops import split_sentences
from app.db.segments import sync_chapter_segments, get_chapter_segments
from app.db.chapters import create_chapter, get_chapter
from app.db import create_project

def test_split_sentences_preserves_newlines():
    text = "Paragraph 1 sentence 1.\n\nParagraph 2 sentence 1."
    segments = list(split_sentences(text, preserve_gap=True))

    found_newline = any("\n" in s for s, _, _ in segments)
    assert found_newline, f"No newline found in segments: {[s for s,_,_ in segments]}"
    assert len(segments) == 2

def test_split_sentences_no_punctuation():
    text = "Line 1\nLine 2"
    segments = list(split_sentences(text, preserve_gap=True))
    assert len(segments) == 2
    assert segments[0][0] == "Line 1\n"
    assert segments[1][0] == "Line 2"

def test_sync_segments_preserves_paragraphs():
    pid = create_project("Para Project")
    text = "Line 1.\n\nLine 2."
    cid = create_chapter(pid, "Para Chapter", text)

    segments = get_chapter_segments(cid)
    assert len(segments) >= 2

    # Check if the first segment has a newline (or if there's a segment that is just a newline, though we prefer it attached)
    first_seg = segments[0]
    assert "\n" in first_seg["text_content"], "First segment should contain a newline to denote paragraph break"
