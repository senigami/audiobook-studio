import re
from pathlib import Path
from typing import List, Tuple

CHAPTER_RE = re.compile(r"^(Chapter\s+(\d+)\s*:\s*.+)$", re.MULTILINE)


def normalize_newlines(text: str) -> str:
    """
    Standardizes newlines for the production tab and splitting.
    1. 3+ newlines -> ';\n' (A pause followed by a split)
    2. 2 newlines -> '\n' (Standard paragraph splitting)
    """
    if not text:
        return ""

    # Standardize to only LF (\n)
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    # First, handle 3 or more newlines as a deliberate pause
    text = re.sub(r'\n{3,}', ';\n', text)

    # Then ensure at least double newlines are preserved for paragraphs
    text = re.sub(r'\n{2,}', '\n\n', text)

    return text.strip()


def preprocess_text(text: str) -> str:
    """Foundational cleaning to remove unspoken characters before splitting or analysis."""
    if not text:
        return ""
    # Strip brackets, braces, parentheses, and angle brackets
    for char in '[]{}()<>':
        text = text.replace(char, "")
    return text


def safe_filename(s: str, max_len: int = 80) -> str:
    """Removes illegal filename characters but preserves spaces for readability."""
    s = re.sub(r"[^\w\s\-:]", "", s).strip()
    return s[:max_len]


def format_duration(seconds: int) -> str:
    """Formats seconds into readable string (e.g. 1 hour 2m 3s or 45s)."""
    if seconds < 60:
        return f"{seconds}s"
    minutes, secs = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {secs}s"
    hours, mins = divmod(minutes, 60)
    return f"{hours}h {mins}m {secs}s"
