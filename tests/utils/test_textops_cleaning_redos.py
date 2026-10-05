"""
Tests for the 4 CodeQL py/polynomial-redos fixes in textops_cleaning.py.

Two categories per fixed pattern:
  1. Behavioral equivalence — output matches pre-fix baselines on representative fixtures.
  2. Adversarial timing — known-bad inputs complete well within 2 seconds.
"""
import time

import pytest

from app.utils.text.textops_cleaning import (
    clean_text_for_tts,
    consolidate_single_word_sentences,
    sanitize_text,
)
from tests.utils.timeout import timeout_after

# ---------------------------------------------------------------------------
# Pre-captured baselines (captured before the regex edits were applied)
# ---------------------------------------------------------------------------

# clean_text_for_tts fixtures
_F1_INPUT  = 'Hello world. He said, "Test me." A.B.C. is 1/2 done. —Dashed—'
_F1_OUTPUT = 'Hello world; He said, Test me. A B C is 1 out of 2 done, Dashed,'

_F2_INPUT  = 'Hello  world.   Test  this.'
_F2_OUTPUT = 'Hello world; Test this.'

_F3_INPUT  = '“Hello”… A.B.C. is 1/2 done.'
_F3_OUTPUT = 'Hello; A B C is 1 out of 2 done.'

_F4_INPUT  = "word '."
_F4_OUTPUT = "word.'"

_F5_INPUT  = "word .'"
_F5_OUTPUT = "word.'"

# sanitize_text fixture
_F6_INPUT  = 'Hello World! \U0001f60a'
_F6_OUTPUT = 'Hello World!'

# consolidate_single_word_sentences fixture
_F7_INPUT  = 'Wait. Stop. We must go now.'
_F7_OUTPUT = 'Wait; Stop; We must go now.'


# ---------------------------------------------------------------------------
# 1.  Behavioral equivalence
# ---------------------------------------------------------------------------

class TestBehavioralEquivalence:
    def test_fraction_pattern(self):
        r"""Line ~35: (\d{1,20})/(\d{1,20}) — fraction normalisation."""
        assert clean_text_for_tts(_F1_INPUT) == _F1_OUTPUT

    def test_fraction_direct(self):
        assert "1 out of 2" in clean_text_for_tts("The ratio is 1/2.")
        assert "444 out of 7000" in clean_text_for_tts("444/7000 items.")

    def test_spaces_before_punctuation(self):
        """Line ~56: ' {1,500}([,;:])' — remove spaces before punctuation."""
        assert clean_text_for_tts(_F2_INPUT) == _F2_OUTPUT

    def test_spaces_before_punctuation_direct(self):
        assert clean_text_for_tts("Hello , world.") == "Hello, world."
        assert clean_text_for_tts("Wait ; stop.") == "Wait; stop."

    def test_stray_space_before_quote_terminal(self):
        """Line ~64: [ \\t]{1,500}(['\"])([.!?]) — stray space before quote+terminal."""
        assert clean_text_for_tts(_F4_INPUT) == _F4_OUTPUT

    def test_stray_space_terminal_before_quote(self):
        """Line ~66: [ \\t]{1,500}([.!?])(['\"])  — stray terminal before quote."""
        assert clean_text_for_tts(_F5_INPUT) == _F5_OUTPUT

    def test_unicode_punctuation_fixture(self):
        assert clean_text_for_tts(_F3_INPUT) == _F3_OUTPUT

    def test_repeated_whitespace_runs(self):
        assert clean_text_for_tts(_F2_INPUT) == _F2_OUTPUT

    def test_sanitize_non_ascii(self):
        assert sanitize_text(_F6_INPUT) == _F6_OUTPUT

    def test_consolidate_short_sentences(self):
        assert consolidate_single_word_sentences(_F7_INPUT) == _F7_OUTPUT

    def test_normal_prose_roundtrip(self):
        """Prose with no special chars should not be mangled."""
        prose = "The quick brown fox jumps over the lazy dog."
        out = clean_text_for_tts(prose)
        assert "quick brown fox" in out
        assert out.endswith("dog.")


# ---------------------------------------------------------------------------
# 2.  Adversarial timing (each must finish in < 2 seconds)
# ---------------------------------------------------------------------------

_ADVERSARIAL_TIMEOUT = 2.0  # seconds — generous margin for any CI box


class TestAdversarialTiming:
    def test_fraction_pattern_no_slash(self):
        r"""
        Attack: long digit string with no '/'.
        Old unbounded (\d+)/(\d+) would backtrack O(n^2).
        New (\d{1,20})/(\d{1,20}) caps backtracking depth.
        """
        attack = "1" * 50_000
        with timeout_after(_ADVERSARIAL_TIMEOUT):
            result = clean_text_for_tts(attack)
        # Digits with no slash are left as-is (no fraction replacement)
        assert "out of" not in result

    def test_fraction_pattern_partial_match(self):
        """Attack: repeated digit/digit/ … that never closes."""
        attack = ("9" * 25 + "/") * 2000
        with timeout_after(_ADVERSARIAL_TIMEOUT):
            clean_text_for_tts(attack)

    def test_spaces_before_punctuation_no_colon(self):
        """
        Attack: huge run of spaces with no comma/semicolon/colon.
        Old ' +([,;:])' must try all sub-lengths; new ' {1,500}' is capped.
        """
        attack = " " * 50_000 + "x"
        with timeout_after(_ADVERSARIAL_TIMEOUT):
            clean_text_for_tts(attack)

    def test_stray_space_before_quote_no_quote(self):
        """
        Attack: huge whitespace run with no quote character following.
        Old \\s+(['\"])([.!?]) would try all lengths; new [ \\t]{1,500} caps it.
        """
        attack = "word" + " " * 50_000 + "x"
        with timeout_after(_ADVERSARIAL_TIMEOUT):
            clean_text_for_tts(attack)

    def test_stray_terminal_before_quote_no_quote(self):
        """
        Attack for line ~66 pattern.
        """
        attack = "word" + " " * 50_000 + "x"
        with timeout_after(_ADVERSARIAL_TIMEOUT):
            clean_text_for_tts(attack)

    def test_mixed_adversarial_prose(self):
        """All four patterns can be triggered in one large string."""
        attack = (
            "1" * 50_000          # fraction pattern: no slash
            + " " * 10_000 + "x"  # spaces-before-punct: no punct
            + " " * 10_000 + "y"  # stray-space patterns
        )
        with timeout_after(_ADVERSARIAL_TIMEOUT):
            clean_text_for_tts(attack)
