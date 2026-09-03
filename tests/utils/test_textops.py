import pytest
from pathlib import Path
from app.engines.behavior import DEFAULT_SAFE_SPLIT_TARGET, DEFAULT_SENT_CHAR_LIMIT
from app.utils.text import textops_splitting
from app.utils.text.textops import (
    normalize_newlines,
    preprocess_text,
    split_by_chapter_markers,
    split_into_parts,
    safe_filename,
    split_sentences,
    safe_split_long_sentences,
    find_long_sentences,
    write_chapters_to_folder,
    clean_text_for_tts,
    consolidate_single_word_sentences,
    sanitize_text,
    pack_text_to_limit,
    get_text_stats,
    format_duration,
    compute_chapter_metrics
)

def test_normalize_newlines():
    assert normalize_newlines("") == ""
    assert normalize_newlines("a\r\nb") == "a\nb"
    assert normalize_newlines("Line 1\n\n\nLine 2") == "Line 1;\nLine 2"
    assert normalize_newlines("Line 1\n\nLine 2") == "Line 1\n\nLine 2"
    assert normalize_newlines("Line 1\n\n\n\nLine 2") == "Line 1;\nLine 2"

def test_preprocess_text():
    assert preprocess_text("Hello [world] {test} (parentheses) <angle>") == "Hello world test parentheses angle"
    assert preprocess_text("") == ""

def test_split_by_chapter_markers():
    text = "Chapter 1: The Beginning\nContent here.\nChapter 2: The End\nContent there."
    chapters = split_by_chapter_markers(text)
    assert len(chapters) == 2
    assert chapters[0] == (1, "Chapter 1: The Beginning", "Chapter 1: The Beginning\nContent here.")
    assert chapters[1] == (2, "Chapter 2: The End", "Chapter 2: The End\nContent there.")

    assert split_by_chapter_markers("No chapters here") == []

def test_split_into_parts():
    text = "A" * 100
    parts = split_into_parts(text, max_chars=40)
    assert len(parts) == 3
    assert all(len(p[2]) <= 40 for p in parts)

    # Test paragraph break preference
    text = "Para 1\n\nPara 2\n\nPara 3"
    parts = split_into_parts(text, max_chars=20)
    assert len(parts) == 2
    assert parts[0][2] == "Para 1\n\nPara"
    assert parts[1][2] == "2\n\nPara 3"

def test_split_sentences():
    # The regex SENT_SPLIT_RE splits on .!? followed by space/end or newlines.
    # It doesn't have an abbreviation exclusion list, so "Mr." splits if followed by space.
    text = "Go home. He was tired! Was he? Yes."
    sents = list(split_sentences(text))
    assert len(sents) == 4
    assert sents[0][0] == "Go home."

    # Test preserve_gap
    sents_gap = list(split_sentences(text, preserve_gap=True))
    assert len(sents_gap) == 4
    assert sents_gap[0][0].endswith(" ")

def test_safe_split_long_sentences():
    long_sent = "This is a very long sentence that should be split because it exceeds the target limit of characters; so we should see it broken into smaller pieces."
    result = safe_split_long_sentences(long_sent, target=40)
    assert len(result) > 0
    # Test path where no separators exist
    no_sep = "A" * 100
    res_no_sep = safe_split_long_sentences(no_sep, target=40)
    assert len(res_no_sep) > 40

def test_text_utility_default_limits_remain_stable():
    """Pin the literal constant values (regression guard against an
    accidental change). The textops_splitting.SENT_CHAR_LIMIT/SAFE_SPLIT_TARGET
    names are plain `as`-import aliases of these same constants, so comparing
    them here would be tautological (guaranteed by Python's import mechanism,
    not by any real logic) -- deliberately not asserted."""
    assert DEFAULT_SENT_CHAR_LIMIT == 500
    assert DEFAULT_SAFE_SPLIT_TARGET == 250

def test_write_chapters_to_folder(tmp_path):
    chapters = [(1, "Chap 1", "Body 1"), (2, "Chap 2", "Body 2")]
    written = write_chapters_to_folder(chapters, tmp_path, prefix="test")
    assert len(written) == 2
    assert written[0].exists()
    assert "Chap 1" in written[0].name

    # Test with include_heading=False
    written_clean = write_chapters_to_folder(chapters, tmp_path / "clean", prefix="part", include_heading=False)
    assert "part_001.txt" in written_clean[0].name

def test_find_long_sentences():
    text = "Short. " + "Long " * 100 + "."
    hits = find_long_sentences(text, limit=50)
    assert len(hits) == 1
    assert hits[0][1] > 50 # length

def test_clean_text_for_tts():
    # Smart quotes, acronyms, dots, fractions
    raw = "“Hello”... A.B.C. is 1/2 done. —Dashed—"
    cleaned = clean_text_for_tts(raw)
    assert "Hello" in cleaned
    assert "A B C" in cleaned
    assert "1 out of 2" in cleaned
    assert "Dashed" in cleaned

def test_clean_text_for_tts_repairs_quote_adjacent_double_punctuation():
    assert clean_text_for_tts("Hello,'.") == "Hello.'"
    assert clean_text_for_tts("Hello',.") == "Hello'."
    assert clean_text_for_tts("'Hello,.', she said.") == "'Hello.', she said."
    assert clean_text_for_tts("word '.") == "word.'"

def test_consolidate_single_word_sentences():
    text = "Wait. Stop. We must go now. Run! Go."
    result = consolidate_single_word_sentences(text)
    assert "Wait; Stop" in result

    # Test multi-line consolidation
    multi = "Wait.\nGo now."
    res_multi = consolidate_single_word_sentences(multi)
    assert "Wait; Go now" in res_multi or "Wait. \nGo now." in res_multi

def test_sanitize_text():
    raw = "Hello World! 😊" # Non-ASCII
    sanitized = sanitize_text(raw)
    assert "😊" not in sanitized
    # Hallucination check only adds "." if no .!? at end. "Hello World!" ends with "!"
    assert sanitized == "Hello World!"

    # Ensure terminals
    assert sanitize_text("No punctuation") == "No punctuation."
    assert sanitize_text("“There,”") == "There."

def test_pack_text_to_limit():
    text = "Sentence one.\nSentence two.\nSentence three."
    packed = pack_text_to_limit(text, limit=15)
    lines = packed.split('\n')
    assert len(lines) == 3

    # Test with padding
    packed_pad = pack_text_to_limit(text, limit=20, pad=True)
    assert all(len(line) == 20 for line in packed_pad.split('\n'))

def test_get_text_stats():
    # "Hello world. Testing 123!"
    # H e l l o _ w o r l d . _ T e s t i n g _ 1 2 3 !
    # 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25
    stats = get_text_stats("Hello world. Testing 123!")
    assert stats["char_count"] == 25
    assert stats["sent_count"] == 2
    assert "s" in stats["formatted_duration"]

def test_empty_stats():
    stats = get_text_stats("")
    assert stats["char_count"] == 0

def test_format_duration():
    assert format_duration(30) == "30s"
    assert format_duration(90) == "1m 30s"
    assert format_duration(3661) == "1h 1m 1s"

def test_compute_chapter_metrics():
    # 167 chars at the 16.7 baseline chars/sec (app.engines.behavior.
    # DEFAULT_BASELINE_ENGINE_CPS) gives a clean, concrete expected duration
    # instead of re-deriving the formula from the implementation.
    text = "a" * 167 + " word"
    metrics = compute_chapter_metrics(text)
    assert metrics["char_count"] == 172
    assert metrics["word_count"] == 2
    assert metrics["predicted_audio_length"] == 10.0


# ---------------------------------------------------------------------------
# consolidate_single_word_sentences edge cases
# (relocated from tts_engines/tts_xtts/tests/test_textops.py — predates the
# Studio 2.0 plugin split and tests Studio-side app.utils.text.textops, not
# anything XTTS-specific, so it belongs in this suite.)
# ---------------------------------------------------------------------------

def test_greedy_merge_forward():
    text = "Wait. No. Stop. Go."
    # 1+1+1+1 = 4 words. All should merge into one line.
    expected = "Wait; No; Stop; Go."
    assert consolidate_single_word_sentences(text) == expected

def test_paragraph_preservation_with_merge():
    # Even if they merge, we want to know it's one block now
    text = "Effie.\nFine, fine.\nShe threw her hands up."
    result = consolidate_single_word_sentences(text)
    # The new logic updates line_idx as it merges, so "Effie" and "Fine, fine"
    # are absorbed into the line of the latest sentence that made it "safe".
    assert "Effie; Fine, fine; She threw her hands up." in result

def test_short_merge_limit():
    text = "Hello. This is a very long sentence that is safe."
    # "Hello" (1) merges with "This..." (10) -> 11 words.
    expected = "Hello; This is a very long sentence that is safe."
    assert consolidate_single_word_sentences(text) == expected

def test_no_merge_needed():
    text = "This is four words. This is also four."
    # Both are safe (>= 4 words)
    # Note: consolidate_single_word_sentences strips trailing punc from left side ONLY IF it merges.
    # Here no merge happens.
    result = consolidate_single_word_sentences(text)
    assert "This is four words.\nThis is also four." in result or "This is four words. This is also four." in result
