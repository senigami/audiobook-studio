"""Tests for B8 (safe_split_long_sentences paragraph preservation)
and B9 (pack_text_to_limit oversized-chunk prevention)."""

import pytest
from app.utils.text.textops import safe_split_long_sentences, pack_text_to_limit


# ---------------------------------------------------------------------------
# B8 — paragraph breaks preserved
# ---------------------------------------------------------------------------

def test_b8_blank_line_boundary_preserved():
    text = "para1 sentence one. sentence two.\n\npara2 here."
    result = safe_split_long_sentences(text)
    assert "\n\n" in result, "Blank-line boundary must survive safe_split_long_sentences"
    para1, para2 = result.split("\n\n", 1)
    assert "para1" in para1
    assert "para2" in para2


def test_b8_long_sentence_within_paragraph_still_split():
    # Build a paragraph whose single sentence is well over the default target
    long_sent = "word " * 200 + "end."   # ~1005 chars
    text = long_sent.strip() + "\n\npara2 here."
    result = safe_split_long_sentences(text)
    assert "\n\n" in result, "Blank-line boundary must survive even with long sentences"
    para1, para2 = result.split("\n\n", 1)
    # The long para should have been split into multiple sub-sentences.
    # split_one joins pieces with " " and appends "." to each piece, so
    # the output will contain more than one period.
    assert para1.count(".") > 1, (
        "Long sentence should have been split into multiple pieces within its paragraph"
    )
    assert "para2" in para2


def test_b8_single_newline_within_paragraph_unchanged():
    text = "line one.\nline two.\n\nnew para."
    result = safe_split_long_sentences(text)
    assert "\n\n" in result
    # Single newline between lines must still produce a single-newline separation
    # (not collapse into a space and not become a double newline)
    para1 = result.split("\n\n")[0]
    assert "\n" in para1


def test_b8_multiple_blank_lines_preserved():
    text = "first.\n\n\nthird."
    result = safe_split_long_sentences(text)
    assert "\n\n" in result, "Multiple blank lines should produce at least a double-newline in output"


# ---------------------------------------------------------------------------
# B9 — pack_text_to_limit never emits oversized chunks
# ---------------------------------------------------------------------------

LIMIT = 500


def _all_within_limit(text: str, limit: int = LIMIT) -> bool:
    chunks = pack_text_to_limit(text, limit=limit)
    if not chunks:
        return True
    for chunk in chunks.split('\n'):
        if len(chunk) > limit:
            return False
    return True


def test_b9_single_long_line():
    # 1200-char line
    text = "word " * 240   # 1200 chars
    assert _all_within_limit(text), "Single 1200-char line must be split to ≤500 chars"


def test_b9_no_whitespace_token():
    # 600-char token with no whitespace — must hard-cut at limit
    token = "x" * 600
    result = pack_text_to_limit(token, limit=LIMIT)
    for chunk in result.split('\n'):
        assert len(chunk) <= LIMIT, f"Chunk length {len(chunk)} exceeds limit {LIMIT}"


def test_b9_mixed_normal_text():
    import random
    random.seed(42)
    words = ["word"] * 300
    text = " ".join(words)   # ~1500 chars
    assert _all_within_limit(text)


def test_b9_chunk_count_reasonable():
    # 1200-char line split at 500 should yield ≥3 chunks
    text = "w" * 1200
    result = pack_text_to_limit(text, limit=LIMIT)
    chunks = result.split('\n')
    assert len(chunks) >= 3


def test_b9_empty_input():
    assert pack_text_to_limit("", limit=LIMIT) == ""


def test_b9_normal_short_text_unchanged():
    text = "Hello world. This is fine."
    result = pack_text_to_limit(text, limit=LIMIT)
    # Should fit in one chunk
    assert result == text or len(result) <= LIMIT
