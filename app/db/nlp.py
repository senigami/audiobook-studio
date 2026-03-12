"""
Thin NLP helpers used by the DB layer.
Delegates sentence-splitting to the main textops module.
"""
from typing import List


def split_into_sentences(text: str) -> List[str]:
    """Return a list of sentence strings from *text*."""
    from ..textops import split_sentences
    return [s for s, _, _ in split_sentences(text, preserve_gap=True)]
