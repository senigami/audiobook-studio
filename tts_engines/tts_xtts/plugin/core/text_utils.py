import re
from typing import List, Tuple, Optional


def preprocess_text(text: str) -> str:
    """Foundational cleaning to remove unspoken characters."""
    if not text:
        return ""
    for char in '[]{}()<>':
        text = text.replace(char, "")
    return text


def split_sentences(text: str, preserve_gap: bool = False):
    """Splits text into (sentence, start_idx, end_idx)."""
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


def consolidate_single_word_sentences(text: str) -> str:
    """Merges very short sentences with neighbors to prevent engine choppiness."""
    lines = text.split('\n')
    all_sentences_with_meta = []
    for line_idx, line in enumerate(lines):
        sents = [s.strip() for s, _, _ in split_sentences(line)]
        for s in sents:
            cleaned = s.lstrip(" .…!?,")
            if re.search(r'\w', cleaned):
                all_sentences_with_meta.append({"text": cleaned, "line_idx": line_idx})

    if len(all_sentences_with_meta) <= 1:
        return text

    consolidated = []
    i = 0
    while i < len(all_sentences_with_meta):
        curr = all_sentences_with_meta[i]
        def count_words(t):
            return len([w for w in t.split() if re.search(r'\w', w)])

        current_text = curr['text']
        current_line_idx = curr['line_idx']

        while (count_words(current_text) < 4 and i < len(all_sentences_with_meta) - 1):
            i += 1
            next_sent = all_sentences_with_meta[i]
            current_text = current_text.rstrip(".!?; ") + "; " + next_sent['text']
            current_line_idx = next_sent['line_idx']

        consolidated.append({"text": current_text, "line_idx": current_line_idx})
        i += 1

    final_output = []
    current_line = 0
    buffer = []
    for item in consolidated:
        if item['line_idx'] > current_line:
            if buffer:
                joined = buffer[0]
                for text in buffer[1:]:
                    sep = "" if joined.endswith("; ") else " "
                    joined += sep + text
                final_output.append(joined)
            final_output.extend([""] * (item['line_idx'] - current_line - 1))
            buffer = [item['text']]
            current_line = item['line_idx']
        else:
            buffer.append(item['text'])

    if buffer:
        joined = buffer[0]
        for text in buffer[1:]:
            sep = "" if joined.endswith("; ") else " "
            joined += sep + text
        final_output.append(joined)

    return "\n".join(final_output)


def clean_text_for_tts(text: str) -> str:
    """Normalize punctuation and chars to avoid TTS speech artifacts."""
    if not text:
        return ""
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        if not line.strip():
            cleaned_lines.append("")
            continue
        ln = preprocess_text(line)
        smart = [("“", ''), ("”", ''), ("‘", "'"), ("’", "'")]
        for old, new in smart:
            ln = ln.replace(old, new)
        ln = ln.replace('"', '')
        ln = re.sub(r'\b(?:[A-Za-z]\.){2,}', lambda m: m.group(0).replace('.', ' '), ln)
        ln = re.sub(r'(\d+)/(\d+)', r'\1 out of \2', ln)
        ln = ln.lstrip(" .…!?,")
        ln = ln.replace("—", ", ").replace("…", ". ").replace("...", ". ")
        ln = re.sub(r'([.!?])(?=[^ \s.!?\'"])', r'\1 ', ln)
        ln = re.sub(r' +', ' ', ln)
        ln = re.sub(r' +([,;:])', r'\1', ln)
        ln = re.sub(r'([!?])\.+', r'\1', ln)
        ln = re.sub(r'([,;:])([\'"]?)([.!?])', r'\2\3', ln)
        ln = re.sub(r'([!?])\1+', r'\1', ln)
        cleaned_lines.append(ln)

    result = consolidate_single_word_sentences('\n'.join(cleaned_lines))
    return re.sub(r'\n{2,}', '\n', result).strip()


def sanitize_text(text: str) -> str:
    """Advanced sanitization for portable plugin use."""
    text = clean_text_for_tts(text)
    text = text.replace("\r", " ").replace("\t", " ")
    text = re.sub(r'[^\x00-\x7F\n]+', '', text)
    text = re.sub(r'[ \t]+', ' ', text).strip()
    text = re.sub(r'\n{2,}', '\n', text)
    text = re.sub(r'([,;:])(["\')\]]*)$', r'.\2', text)
    if text and not re.search(r'[.!?]["\')\]\s]*$', text):
        text += "."
    return text


def safe_split_long_sentences(text: str, target: int = 200) -> str:
    """Splits long sentences at logical boundaries."""
    def split_one(s: str) -> List[str]:
        if len(s) <= target:
            return [s]
        seps = ["; ", " - ", ", ", ": ", " and ", " but ", " so ", " because "]
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
    return re.sub(r'\n{2,}', '\n', "\n".join(processed_lines)).strip()


def pack_text_to_limit(text: str, limit: int = 500, pad: bool = False) -> str:
    """Greedily packs sentences into larger chunks."""
    if not text:
        return ""
    raw_lines = text.split('\n')
    packed = []
    current_chunk = ""
    for line in raw_lines:
        line_content = line.strip()
        separator = "\n" if current_chunk else ""
        if (current_chunk and (len(current_chunk) + len(separator) + len(line_content) <= limit)):
            current_chunk += separator + line_content
        elif not current_chunk and len(line_content) <= limit:
            current_chunk = line_content
        else:
            if current_chunk:
                if pad:
                    current_chunk = current_chunk.ljust(limit)
                packed.append(current_chunk)
            current_chunk = line_content
    if current_chunk:
        if pad:
            current_chunk = current_chunk.ljust(limit)
        packed.append(current_chunk)
    return '\n'.join(packed)
