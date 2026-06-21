"""Pronunciation lexicon substitution for TTS pre-processing.

Provides apply_lexicon() — a pure function that replaces whole-word,
case-insensitive occurrences of each lexicon word with its replacement
before text is sent to the TTS engine.

Scope: project (book) level only — no series/global scope.
Format: plain-text substitution only — no IPA or SSML.

Zero-impact invariant: when entries is empty, the function returns the
original text object unchanged (identity).  No allocation, no regex
compile, no DB call.
"""

from __future__ import annotations

import re


def apply_lexicon(text: str, entries: list[dict]) -> str:
    """Apply whole-word, case-insensitive lexicon substitutions to *text*.

    Args:
        text: The input string to transform.
        entries: List of ``{"word": str, "replacement": str}`` dicts.
                 Unknown keys are silently ignored.
                 Empty list → returns *text* unchanged (identity).

    Returns:
        Transformed string.  When *entries* is empty the original string
        object is returned without any allocation (byte-identical guarantee).
    """
    if not entries:
        return text
    if not text:
        return text

    result = text
    for entry in entries:
        word = entry.get("word")
        replacement = entry.get("replacement")
        if not word or replacement is None:
            continue
        # \b word-boundary anchors ensure whole-word matching only.
        # re.IGNORECASE covers all casing variants of the source word.
        # The replacement string is treated as a literal (re.escape is NOT
        # applied to it — replacements are plain text, not regex patterns).
        pattern = r"(?i)\b" + re.escape(word) + r"\b"
        result = re.sub(pattern, replacement, result)

    return result
