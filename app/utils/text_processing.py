import re
from typing import List, Generator, Tuple

# Sentence splitting regex
_SENT_SPLIT_RE = re.compile(r"(.+?)(?:(?<=[.!?])\s+|$)", re.DOTALL)

def split_sentences_with_spans(text: str) -> Generator[Tuple[str, int, int], None, None]:
    for m in _SENT_SPLIT_RE.finditer(text):
        sent = m.group(1)
        if not sent.strip():
            continue
        yield sent, m.start(1), m.end(1)

def approx_line_col(text: str, start_idx: int) -> Tuple[int, int]:
    line = text.count("\n", 0, start_idx) + 1
    last_nl = text.rfind("\n", 0, start_idx)
    col = start_idx + 1 if last_nl == -1 else start_idx - last_nl
    return line, col

def make_context(text: str, start: int, end: int, window: int = 120) -> str:
    left = max(0, start - window)
    right = min(len(text), end + window)
    ctx = text[left:right]
    prefix = "..." if left > 0 else ""
    suffix = "..." if right < len(text) else ""
    return (prefix + ctx + suffix).strip()

def safe_split_long_sentences(text: str, target: int = 200) -> str:
    """
    Heuristic: if a sentence exceeds target chars, split it at best available delimiters.
    We prefer: ". " already ok; otherwise split on ";", " - ", ",", ":" then whitespace.
    This is intentionally conservative (tries to preserve meaning).
    """
    def split_one(s: str) -> List[str]:
        s = s.strip()
        if len(s) <= target:
            return [s]
        # Prefer splitting points
        seps = ["; ", " - ", ", ", ": ", " and ", " but ", " so ", " because "]
        for sep in seps:
            if sep in s:
                parts = s.split(sep)
                rebuilt = []
                buf = ""
                for i, p in enumerate(parts):
                    chunk = (p if i == 0 else (sep.strip() + " " + p)).strip()
                    if not buf:
                        buf = chunk
                    elif len(buf) + 1 + len(chunk) <= target:
                        buf = (buf + " " + chunk).strip()
                    else:
                        rebuilt.append(buf.strip())
                        buf = chunk
                if buf:
                    rebuilt.append(buf.strip())
                # If we actually reduced size, accept; else keep trying other separators
                if max(len(x) for x in rebuilt) < len(s):
                    # add periods to enforce sentence boundaries
                    return [x.rstrip(" .") + "." for x in rebuilt]
        # Last resort: hard wrap at nearest whitespace
        out = []
        start = 0
        while start < len(s):
            end = min(len(s), start + target)
            if end < len(s):
                ws = s.rfind(" ", start, end)
                if ws > start + 60:
                    end = ws
            out.append(s[start:end].strip().rstrip(" .") + ".")
            start = end
        return out

    pieces = []
    for sent, _, _ in split_sentences_with_spans(text):
        s = sent.strip()
        if len(s) > target:
            pieces.extend(split_one(s))
        else:
            pieces.append(s)
    # preserve paragraph breaks loosely
    return "\n".join(pieces)

def sanitize_for_xtts(text: str) -> str:
    """
    Advanced sanitization to prevent XTTS hallucinations (e.g., 'nahnday').
    Handles smart quotes, ellipses, and non-ASCII chars.
    """
    # Convert smart quotes to straight quotes
    text = text.replace('“', '"').replace('”', '"').replace('‘', "'").replace('’', "'")
    # Replace ellipses with a comma for better natural pauses
    text = text.replace('...', ', ')
    # Remove any non-standard characters/emojis
    text = re.sub(r'[^\x00-\x7F]+', '', text)
    # Collapse multiple spaces and trim
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def pack_text_to_limit(text: str, limit: int = 250) -> str:
    """
    Greedily packs sentences into larger chunks as close to the limit as possible.
    """
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    if not lines:
        return ""

    packed = []
    current_chunk = ""

    for line in lines:
        if len(current_chunk) + len(line) + 1 < (limit - 5):
            if current_chunk:
                current_chunk += " " + line
            else:
                current_chunk = line
        else:
            if current_chunk:
                packed.append(current_chunk)
            current_chunk = line

    if current_chunk:
        packed.append(current_chunk)

    return '\n'.join(packed)
