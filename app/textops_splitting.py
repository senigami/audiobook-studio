import re
from pathlib import Path
from typing import List, Tuple

from .config import SAFE_SPLIT_TARGET, SENT_CHAR_LIMIT
from .textops_helpers import CHAPTER_RE, preprocess_text, safe_filename


def split_by_chapter_markers(full_text: str) -> List[Tuple[int, str, str]]:
    full_text = preprocess_text(full_text)
    matches = list(CHAPTER_RE.finditer(full_text))
    if not matches:
        return []
    spans = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        heading = m.group(1).strip()
        chap_num = int(m.group(2))
        body = full_text[start:end].strip()
        spans.append((chap_num, heading, body))
    return spans


def split_into_parts(text: str, max_chars: int = 30000, start_index: int = 1) -> List[Tuple[int, str, str]]:
    text = preprocess_text(text)
    if not text:
        return []

    parts = []
    part_num = start_index

    remaining_text = text.strip()

    while remaining_text:
        if len(remaining_text) <= max_chars:
            parts.append((part_num, f"Part {part_num}", remaining_text))
            break

        split_point = -1
        chunk = remaining_text[:max_chars]
        p_break = chunk.rfind("\n\n")
        if p_break > max_chars * 0.7:
            split_point = p_break + 2
        else:
            nl_break = chunk.rfind("\n")
            if nl_break > max_chars * 0.8:
                split_point = nl_break + 1
            else:
                search_start = int(max_chars * 0.8)
                sent_match = None
                for m in re.finditer(r'[.!?](\s+|$)', chunk[search_start:]):
                    sent_match = m

                if sent_match:
                    split_point = search_start + sent_match.end()
                else:
                    space_break = chunk.rfind(" ")
                    if space_break > 0:
                        split_point = space_break + 1
                    else:
                        split_point = max_chars

        parts.append((part_num, f"Part {part_num}", remaining_text[:split_point].strip()))
        remaining_text = remaining_text[split_point:].strip()
        part_num += 1

    return parts


def write_chapters_to_folder(chapters, out_dir: Path, prefix: str = "chapter", include_heading: bool = True) -> List[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for chap_num, heading, body in chapters:
        if include_heading:
            # Traditional chapter naming: [prefix]_[num]_[heading].txt
            fname = out_dir / f"{prefix}_{chap_num:04}_{safe_filename(heading)}.txt"
        else:
            # Clean part naming: [OriginalFilename]_[num].txt
            # Using 3 digits as requested (001)
            fname = out_dir / f"{prefix}_{chap_num:03}.txt"

        fname.write_text(body + "\n", encoding="utf-8")
        written.append(fname)
    return written


def split_sentences(text: str, preserve_gap: bool = False):
    """
    Splits text into (sentence, start_idx, end_idx).
    If preserve_gap is True, the sentence will include its trailing whitespace/newlines.
    """
    if not text:
        return []

    start = 0
    i = 0
    text_len = len(text)
    closing_quotes = {'"', "'", "”", "’"}

    while i < text_len:
        split_end = None

        if text[i] in ".!?":
            j = i + 1
            while j < text_len and text[j] in closing_quotes:
                j += 1
            if j == text_len or text[j].isspace():
                split_end = j
        elif text[i] == "\n":
            j = i + 1
            while j < text_len and text[j] == "\n":
                j += 1
            split_end = j

        if split_end is None:
            i += 1
            continue

        gap_end = split_end
        while gap_end < text_len and text[gap_end].isspace():
            gap_end += 1

        if preserve_gap:
            sentence = text[start:gap_end]
            if sentence:
                yield sentence, start, gap_end
        else:
            raw_sentence = text[start:split_end]
            sentence = raw_sentence.strip(" \t\r")
            if sentence:
                leading_trim = len(raw_sentence) - len(raw_sentence.lstrip(" \t\r"))
                sentence_start = start + leading_trim
                yield sentence, sentence_start, sentence_start + len(sentence)

        start = gap_end
        i = gap_end

    remainder = text[start:]
    if remainder.strip() or (preserve_gap and remainder):
        if preserve_gap:
            yield remainder, start, start + len(remainder)
        else:
            trimmed = remainder.strip()
            if trimmed:
                leading_trim = len(remainder) - len(remainder.lstrip())
                sentence_start = start + leading_trim
                yield trimmed, sentence_start, sentence_start + len(trimmed)


def safe_split_long_sentences(text: str, target: int = SAFE_SPLIT_TARGET) -> str:
    def split_one(s: str) -> List[str]:
        if len(s) <= target:
            return [s]
        seps = [
            "; ", " - ", ", ", ": ", " and ", " but ", " so ", " because "
        ]
        for sep in seps:
            if sep in s:
                parts = s.split(sep)
                out, buf = [], ""
                for i, p in enumerate(parts):
                    chunk = (p if i == 0 else (sep.strip() + " " + p)).strip()
                    if not buf:
                        buf = chunk
                    elif len(buf) + 1 + len(chunk) <= target:
                        connector = "" if chunk[0] in ",;:" else " "
                        buf = (buf + connector + chunk).strip()
                    else:
                        out.append(buf.rstrip(" .") + ".")
                        buf = chunk.lstrip(",; ")
                if buf:
                    out.append(buf.rstrip(" .") + ".")
                if max(len(x) for x in out) < len(s):
                    return out

        out = []
        i = 0
        while i < len(s):
            j = min(len(s), i + target)
            if j < len(s):
                ws = s.rfind(" ", i, j)
                if ws > i + 60:
                    j = ws
            out.append(s[i:j].strip().rstrip(" .") + ".")
            i = j
        return out

    lines = text.split('\n')
    processed_lines = []
    for line in lines:
        if not line.strip():
            processed_lines.append("")
            continue

        pieces = []
        for s, _, _ in split_sentences(line):
            pieces.extend(split_one(s) if len(s) > target else [s])
        processed_lines.append(" ".join(pieces))

    result = "\n".join(processed_lines)
    # Final newline normalization
    result = re.sub(r'\n{2,}', '\n', result)
    return result.strip()


def find_long_sentences(text: str, limit: int = SENT_CHAR_LIMIT):
    text = preprocess_text(text)
    hits = []
    idx = 0
    for s, start, end in split_sentences(text):
        idx += 1
        if len(s) > limit:
            hits.append((idx, len(s), start, end, s))
    return hits
