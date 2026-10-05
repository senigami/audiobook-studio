"""Text-preparation mechanisms for engine plugins.

Stdlib-only: no ``app.*`` imports, matching ``audio.py`` and ``proc.py``.
Everything here is a pure function over text, so there is no host policy to
inject: the plugin calls it directly and the Studio host calls the same
implementation through ``app/utils/text/lexicon.py``.
"""

from __future__ import annotations

import re


def apply_lexicon(text: str, entries: list[dict]) -> str:
    """Apply whole-word, case-insensitive lexicon substitutions to *text*.

    Args:
        text: The input string to transform.
        entries: List of ``{"word": str, "replacement": str}`` dicts.
                 Unknown keys are silently ignored.
                 Empty list gives back *text* unchanged (identity).

    Returns:
        Transformed string.  When *entries* is empty the original string
        object is returned without any allocation (byte-identical guarantee).

    Scope is project (book) level only: no series or global scope. Format is
    plain-text substitution only: no IPA, no SSML.
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
        # applied to it: replacements are plain text, not regex patterns).
        pattern = r"(?i)\b" + re.escape(word) + r"\b"
        result = re.sub(pattern, replacement, result)

    return result
