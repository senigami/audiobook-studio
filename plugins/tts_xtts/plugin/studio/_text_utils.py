"""Pure text helpers for the XTTS studio handlers.

Kept dependency-free so they can be imported in tests without triggering the
handler/facade circular-import chain.
"""
from __future__ import annotations


def join_group_text(group: list) -> str:
    """Join segment text_content entries with a single space separator.

    Matches the size-budget calculation used when building segment groups so
    that the string length seen by TTS is consistent with what the grouper
    expected.
    """
    return " ".join(s['text_content'] for s in group)
