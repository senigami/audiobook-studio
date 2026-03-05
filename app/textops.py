"""
TEXT PROCESSING PIPELINE - ORDER OF OPERATIONS
-----------------------------------------------
1. INGESTION (split_by_chapter_markers / split_into_parts)
   - [preprocess_text] Strips brackets [], braces {}, and parentheses () early.
   - [clean_text_for_tts] (Part of Sanitization, but happens before split)
     - Strips leading ellipses/punctuation to prevent speech hallucinations.
     - Normalizes acronyms/initials (A.B.C. -> A B C, but A. stays A.).
     - Normalizes fractions (444/7000 -> 444 out of 7000).

2. SANITIZATION (sanitize_for_xtts)
   - Step A: [clean_text_for_tts]
     - Normalize Quotes: Convert smart quotes (“ ”) to empty and normalize (‘ ’) to (').
     - Stripping: Removes double quotes (") while preserving single quotes (').
     - Leading Punc: Strips early dots/ellipses to prevent speech hallucinations.
     - Acronyms: Convert 2+ letters + period (A.B. -> A B) for better TTS prosody.
     - Fractions: Convert numbers like 444/7000 to "444 out of 7000".
     - Pacing: Convert dashes (—) to commas and ellipses (…) to periods.
     - Artifact Cleanup: Fix redundant punctuation patterns like ".' ." or "'. ".
     - Spacing: Ensures space after .!?, and removes space before ,;:.
     - Sentence Integrity: Repair artifacts like ".," or ",." introduced by splitting.
   - Step B: [consolidate_single_word_sentences]
     - Strips leading punctuation from each sentence to prevent hallucinations.
     - Filters out symbol-only lines (e.g. "!!!") that contain no alphanumeric text.
     - Finds single-word sentences (e.g. "Wait!") and merges them into neighbors 
       using commas to prevent XTTS v2 from failing or hallucinating on short strings.
       Favors forward-merging over backward-merging.
   - Step C: [ASCII Filter]
     - Strict removal of all non-ASCII characters to prevent speech engine crashes.
   - Step D: [Whitespace Collapse]
     - Trims and collapses multiple spaces into single spaces.
   - Step E: [Terminal Punctuation]
     - Ensures every voice line ends in a terminal punctuation mark (. ! or ?) 
       while correctly ignoring trailing quotes or parentheses.

3. FINAL SEGMENTATION (pack_text_to_limit)
   - Greedily packs the cleaned sentences into blocks <= 500 characters (SENT_CHAR_LIMIT).
   - This ensures the speech engine receives enough context for natural prosody
     while staying strictly within the reliability threshold of the model.
"""

import re
from pathlib import Path
from typing import List, Tuple
from .config import SAFE_SPLIT_TARGET, SENT_CHAR_LIMIT

# Semicolons serve as the pause character for TTS output.
# They survive all text cleaning (pure ASCII), and xtts_inference.py splits on them
# to insert a silence tensor. This also means consolidate_single_word_sentences
# merges short sentences with ";" which naturally becomes a pause in the audio.

CHAPTER_RE = re.compile(r"^(Chapter\s+(\d+)\s*:\s*.+)$", re.MULTILINE)
SENT_SPLIT_RE = re.compile(r'(.+?(?:[.!?]["\'”’]*|[\n\r]))(\s+|$)', re.DOTALL)

def normalize_newlines(text: str) -> str:
    """
    Standardizes newlines for the production tab and splitting.
    1. 3+ newlines -> ';\\n' (A pause followed by a split)
    2. 2 newlines -> '\\n' (Standard paragraph splitting)
    """
    if not text:
        return ""

    # Standardize to only LF (\n)
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    # First, handle 3 or more newlines as a deliberate pause
    text = re.sub(r'\n{3,}', ';\n', text)

    # Then collapse remaining 2+ newlines to a single newline
    text = re.sub(r'\n{2,}', '\n', text)

    return text.strip()

def preprocess_text(text: str) -> str:
    """Foundational cleaning to remove unspoken characters before splitting or analysis."""
    if not text:
        return ""
    # Strip brackets, braces, parentheses, and angle brackets
    for char in '[]{}()<>':
        text = text.replace(char, "")
    return text

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

def safe_filename(s: str, max_len: int = 80) -> str:
    """Removes illegal filename characters but preserves spaces for readability."""
    s = re.sub(r"[^\w\s\-:]", "", s).strip()
    return s[:max_len]

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
    last_end = 0
    for m in SENT_SPLIT_RE.finditer(text):
        if preserve_gap:
            # Full match includes the trailing space group
            s = m.group(0)
            yield s, m.start(0), m.end(0)
        else:
            s = m.group(1).strip()
            if s:
                yield s, m.start(1), m.end(1)
        last_end = m.end()

    remainder = text[last_end:]
    if remainder.strip() or (preserve_gap and remainder):
        if not preserve_gap:
            remainder = remainder.strip()
        yield remainder, last_end, last_end + len(remainder)

def safe_split_long_sentences(text: str, target: int = SAFE_SPLIT_TARGET) -> str:
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

# --- ORDER OF OPERATIONS FOR CREATING SAFE TEXT ---
# 1. Preprocess: Remove unspoken formatting/bracket characters [ ] { } ( ).
# 2. Normalize Quotes: Convert smart quotes (“ ”) to empty and normalize (‘ ’) to (').
# 3. Stripping: Removes double quotes (") while preserving single quotes (').
# 4. Leading Punc: Strips leading ellipses/dots to prevent speech hallucinations.
# 5. Acronyms: Convert 2+ letters + period (A.B. -> A B) for better TTS prosody.
# 6. Fractions: Convert numbers like 444/7000 to "444 out of 7000".
# 7. Pacing: Convert dashes (—) to commas and ellipses (…) to periods.
# 8. Artifact Cleanup: Fix redundant punctuation patterns like ".' ." or "'. ".
# 9. Spacing: Ensures space after .!?, and removes space before ,;:.
# 10. Sentence Integrity: Repair artifacts like ".," or ",." introduced by splitting.
# 11. Consolidation: Split, strip leading punc (e.g. ". Or") and filter symbol-only lines (e.g. "!!!").
#     Merge short sentences (<= 2 words) into neighbors using forward-favored semicolons.

def clean_text_for_tts(text: str) -> str:
    """Normalize punctuation and characters to avoid TTS speech artifacts, preserving newlines."""
    if not text:
        return ""

    # Split into lines to preserve newlines during cleaning
    lines = text.split('\n')
    cleaned_lines = []

    for line in lines:
        if not line.strip():
            cleaned_lines.append("")
            continue

        ln = preprocess_text(line)

        # Handle smart quotes and then strip all quotes (standard and normalized)
        ln = ln.replace("“", '').replace("”", '').replace("‘", "'").replace("’", "'")
        ln = ln.replace('"', '')

        # Normalize acronyms/initials: A.B. if 2 or more. A. alone is a period.
        pattern = r'\b(?:[A-Za-z]\.){2,}'
        ln = re.sub(pattern, lambda m: m.group(0).replace('.', ' '), ln)

        # Normalize fractions (444/7000 -> 444 out of 7000)
        ln = re.sub(r'(\d+)/(\d+)', r'\1 out of \2', ln)

        # Strip leading dots/ellipses/punctuation
        ln = ln.lstrip(" .…!?,")
        # Handle dashes and ellipses. Use commas for ellipses to prevent breaks.
        ln = ln.replace("—", ", ").replace("…", ". ").replace("...", ". ")

        # Common redundant punctuation artifacts
        ln = ln.replace(".' .", ". ").replace(".' ", ". ").replace("'.", ".'")
        ln = ln.replace('".',  '."').replace('?"', '"?').replace('!"', '"!')

        # Normalize spaces after punctuation (if missing)
        ln = re.sub(r'([.!?])(?=[^ \s.!?\'"])', r'\1 ', ln)
        # Collapse multiple spaces
        ln = re.sub(r' +', ' ', ln)
        # Remove spaces before punctuation
        ln = re.sub(r' +([,;:])', r'\1', ln)
        # Remove redundant punctuation
        ln = re.sub(r'([!?])\.+', r'\1', ln)
        # Fix ., -> , and ,. -> . and .; -> ; etc
        ln = ln.replace(".,", ",").replace(",.", ".").replace(".;", ";").replace(". :", ":")
        # Collapse multiple identical punctuations like !! -> ! or ?? -> ? (preserving ...)
        ln = re.sub(r'([!?])\1+', r'\1', ln)

        cleaned_lines.append(ln)

    # Join lines back
    result = '\n'.join(cleaned_lines)
    # Consolidate short sentences ACROSS lines now that they are joined
    result = consolidate_single_word_sentences(result)

    # Finally normalize to collapse any resulting empty lines beyond 1
    result = re.sub(r'\n{2,}', '\n', result)
    return result.strip()

def consolidate_single_word_sentences(text: str) -> str:
    """
    TTS engines (especially XTTS) often fail on short sentences.
    This merges them (<= 2 words) with neighbors using semicolons.
    Semicolons are mapped to pauses in xtts_inference.py.

    If text contains newlines, they are preserved as boundaries. 
    If a merge happens across a newline, we use ';; ' to indicate 
    a paragraph-level break/pause while merging the text units.
    """
    # Split into lines to detect where merges cross paragraph boundaries
    lines = text.split('\n')
    processed_lines = []

    # We want to maintain sentence splitting relative to the whole text 
    # but respect where newlines occurred.

    all_sentences_with_meta = []
    for line_idx, line in enumerate(lines):
        sents = [s.strip() for s, _, _ in split_sentences(line)]
        for s in sents:
            cleaned = s.lstrip(" .…!?,")
            if re.search(r'\w', cleaned):
                all_sentences_with_meta.append({
                    "text": cleaned,
                    "line_idx": line_idx
                })

    if len(all_sentences_with_meta) <= 1:
        return text

    consolidated = []
    i = 0
    while i < len(all_sentences_with_meta):
        curr = all_sentences_with_meta[i]

        # Calculate current word count
        def count_words(t):
            return len([w for w in t.split() if re.search(r'\w', w)])

        current_text = curr['text']
        current_line_idx = curr['line_idx']

        # Greedy merge forward until we hit the safety threshold (4 words)
        while count_words(current_text) < 4 and i < len(all_sentences_with_meta) - 1:
            i += 1
            next_sent = all_sentences_with_meta[i]
            # Use single semicolon for all merges now
            sep = "; "
            current_text = current_text.rstrip(".!?; ") + sep + next_sent['text']
            # Update line_idx to the latest consumed sentence to keep paragraph flow
            current_line_idx = next_sent['line_idx']

        consolidated.append({
            "text": current_text,
            "line_idx": current_line_idx
        })
        i += 1

    # Reconstruct lines based on line_idx changes
    final_output = []
    current_line = 0
    buffer = []

    for item in consolidated:
        if item['line_idx'] > current_line:
            # Commit the current buffer as a single block
            if buffer:
                joined = ""
                for idx, text in enumerate(buffer):
                    if idx == 0:
                        joined = text
                    else:
                        # Append with space only if we didn't just add a pause separator
                        sep = "" if joined.endswith("; ") or joined.endswith(";; ") else " "
                        joined += sep + text
                final_output.append(joined)

            # Pad with empty lines if there were gaps
            final_output.extend([""] * (item['line_idx'] - current_line - 1))
            buffer = [item['text']]
            current_line = item['line_idx']
        else:
            buffer.append(item['text'])

    if buffer:
        joined = ""
        for idx, text in enumerate(buffer):
            if idx == 0:
                joined = text
            else:
                sep = "" if joined.endswith("; ") or joined.endswith(";; ") else " "
                joined += sep + text
        final_output.append(joined)

    return "\n".join(final_output)

def sanitize_for_xtts(text: str) -> str:
    """
    Advanced sanitization specifically tuned for Coqui XTTS v2.
    It builds on the base cleaning plus specific hallucination prevention.
    """
    # 1. Perform base TTS cleaning (includes bracket stripping and consolidation)
    text = clean_text_for_tts(text)

    # Preserve newlines but normalize other whitespace
    text = text.replace("\r", " ").replace("\t", " ")

    # 2. Remove any remaining non-ASCII characters that might cause hallucinations
    text = re.sub(r'[^\x00-\x7F\n]+', '', text)
    # Collapse multiple horizontal spaces and trim
    text = re.sub(r'[ \t]+', ' ', text).strip()
    # Normalize multiple newlines to maximum of 1
    text = re.sub(r'\n{2,}', '\n', text)

    # 3. Ensure terminal punctuation (XTTS v2 can fail on short strings without it)
    if text and not re.search(r'[.!?]["\')\]\s]*$', text):
        text += "."

    return text

def pack_text_to_limit(text: str, limit: int = SENT_CHAR_LIMIT, pad: bool = False) -> str:
    """
    Greedily packs sentences into larger chunks as close to the limit as possible.
    This gives XTTS the maximum context and prevents choppiness from short lines.
    If pad is True, each chunk is padded with spaces up to the limit.
    """
    if not text:
        return ""

    # Split into blocks by literal newlines to respect paragraphing
    raw_lines = text.split('\n')
    packed = []
    current_chunk = ""

    for line in raw_lines:
        line_content = line.strip()
        # If it's an empty line (paragraph break), we treat it as part of the previous or next chunk
        # But we must ensure it doesn't break the chunking greedy logic too much.
        separator = "\n" if current_chunk else ""

        if current_chunk and len(current_chunk) + len(separator) + len(line_content) <= limit:
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
