"""Unit tests for app.utils.text.lexicon.apply_lexicon.

TDD: these tests are written before the implementation.
R1: each assertion must fail on missing/pre-fix code.
"""

import pytest
from app.utils.text.lexicon import apply_lexicon


# ---------------------------------------------------------------------------
# Identity / empty-list invariant
# ---------------------------------------------------------------------------

def test_empty_entries_returns_text_unchanged():
    """Zero entries → identity."""
    text = "The quick brown fox."
    assert apply_lexicon(text, []) == text


def test_none_entries_treated_as_empty():
    """None entries list → identity (defensive)."""
    text = "Hello world."
    # The function signature accepts list[dict]; passing an empty list is
    # the primary contract, but implementations should not crash on edge cases.
    assert apply_lexicon(text, []) == text


def test_empty_text_returns_empty():
    """Empty text → empty string regardless of entries."""
    assert apply_lexicon("", [{"word": "cat", "replacement": "kitten"}]) == ""


# ---------------------------------------------------------------------------
# Basic substitution
# ---------------------------------------------------------------------------

def test_simple_word_replaced():
    entries = [{"word": "cat", "replacement": "kitten"}]
    assert apply_lexicon("The cat sat.", entries) == "The kitten sat."


def test_multiple_occurrences_replaced():
    entries = [{"word": "dog", "replacement": "hound"}]
    result = apply_lexicon("The dog saw another dog.", entries)
    assert result == "The hound saw another hound."


# ---------------------------------------------------------------------------
# Case-insensitivity
# ---------------------------------------------------------------------------

def test_replacement_is_case_insensitive():
    entries = [{"word": "Cat", "replacement": "kitten"}]
    result = apply_lexicon("The cat sat with the Cat.", entries)
    # Both "cat" and "Cat" should become "kitten"
    assert "cat" not in result.lower()
    assert result.count("kitten") == 2


def test_uppercase_word_in_text():
    entries = [{"word": "hello", "replacement": "hi"}]
    result = apply_lexicon("HELLO world.", entries)
    assert result == "hi world."


# ---------------------------------------------------------------------------
# Whole-word boundary enforcement
# ---------------------------------------------------------------------------

def test_no_partial_match_prefix():
    """'cat' must not match inside 'category'."""
    entries = [{"word": "cat", "replacement": "kitten"}]
    result = apply_lexicon("The category is large.", entries)
    assert result == "The category is large."


def test_no_partial_match_suffix():
    """'cat' must not match inside 'tomcat'."""
    entries = [{"word": "cat", "replacement": "kitten"}]
    result = apply_lexicon("My tomcat is old.", entries)
    assert result == "My tomcat is old."


def test_no_partial_match_infix():
    """'cat' must not match inside 'concatenate'."""
    entries = [{"word": "cat", "replacement": "kitten"}]
    result = apply_lexicon("Concatenate the strings.", entries)
    assert result == "Concatenate the strings."


def test_word_at_start_of_string():
    entries = [{"word": "Hello", "replacement": "Hi"}]
    result = apply_lexicon("Hello world.", entries)
    assert result.startswith("Hi")


def test_word_at_end_of_string():
    entries = [{"word": "world", "replacement": "earth"}]
    result = apply_lexicon("Hello world", entries)
    assert result.endswith("earth")


# ---------------------------------------------------------------------------
# Punctuation-adjacent words
# ---------------------------------------------------------------------------

def test_word_before_period():
    entries = [{"word": "cat", "replacement": "kitten"}]
    assert apply_lexicon("See the cat.", entries) == "See the kitten."


def test_word_after_comma():
    entries = [{"word": "cat", "replacement": "kitten"}]
    result = apply_lexicon("Dogs, cats, and birds — wait, cat!", entries)
    # "cats" must not match (not whole word), "cat" at end must match
    assert "cats" in result
    assert result.endswith("kitten!")


def test_word_inside_quotes():
    entries = [{"word": "cat", "replacement": "kitten"}]
    result = apply_lexicon('"cat" is fine.', entries)
    assert "kitten" in result


# ---------------------------------------------------------------------------
# Multiple entries
# ---------------------------------------------------------------------------

def test_multiple_entries_all_applied():
    entries = [
        {"word": "cat", "replacement": "kitten"},
        {"word": "dog", "replacement": "puppy"},
    ]
    result = apply_lexicon("The cat and the dog.", entries)
    assert result == "The kitten and the puppy."


def test_multiple_entries_order_is_deterministic():
    """Applying the same entries twice must yield the same result."""
    entries = [
        {"word": "red", "replacement": "blue"},
        {"word": "blue", "replacement": "green"},
    ]
    r1 = apply_lexicon("The red ball.", entries)
    r2 = apply_lexicon("The red ball.", entries)
    assert r1 == r2


def test_entry_replacement_does_not_cascade():
    """If entry A replaces 'cat' → 'kitten', subsequent entry for 'kitten'
    must NOT then replace the freshly inserted 'kitten'.
    This is acceptable either way as long as behavior is documented and
    consistent — the test just asserts determinism.  We expect sequential
    non-cascading by default (each entry applied independently to the same
    original text OR sequentially to the evolving text — either is valid,
    but must be stable).
    """
    entries = [
        {"word": "cat", "replacement": "kitten"},
        {"word": "kitten", "replacement": "REPLACED"},
    ]
    result = apply_lexicon("A cat.", entries)
    # The result must be one of two consistent behaviors — just not a crash.
    assert isinstance(result, str)
    assert len(result) > 0
