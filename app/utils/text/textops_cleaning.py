import re
from .textops_helpers import preprocess_text
from .textops_splitting import split_sentences


def clean_text_for_tts(text: str) -> str:
    """Normalize punctuation and chars to avoid TTS speech artifacts,
    preserving newlines."""
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

        # Handle smart quotes and then strip all quotes
        # (standard and normalized)
        smart = [("“", ''), ("”", ''), ("‘", "'"), ("’", "'")]
        for old, new in smart:
            ln = ln.replace(old, new)
        ln = ln.replace('"', '')

        # Normalize acronyms/initials: A.B. if 2 or more. A. alone is a period.
        pattern = r'\b(?:[A-Za-z]\.){2,}'
        ln = re.sub(pattern, lambda m: m.group(0).replace('.', ' '), ln)

        # Normalize fractions (444/7000 -> 444 out of 7000)
        # Bound digit-group length to prevent polynomial backtracking on
        # non-matching inputs (CodeQL py/polynomial-redos).
        ln = re.sub(r'(\d{1,20})/(\d{1,20})', r'\1 out of \2', ln)

        # Strip leading dots/ellipses/punctuation
        ln = ln.lstrip(" .…!?,")
        # Handle dashes and ellipses. Use commas for ellipses to prevent
        # breaks.
        ln = ln.replace("—", ", ").replace("…", ". ").replace("...", ". ")

        # Common redundant punctuation artifacts
        ln = ln.replace(".' .", ". ").replace(".' ", ". ").replace("'.", ".'")
        ln = (
            ln.replace('".',  '."')
            .replace('?"', '"?')
            .replace('!"', '"!')
        )

        # Normalize spaces after punctuation (if missing)
        ln = re.sub(r'([.!?])(?=[^ \s.!?\'"])', r'\1 ', ln)
        # Collapse multiple spaces
        ln = re.sub(r' +', ' ', ln)
        # Remove spaces before punctuation
        # Use explicit bounded quantifier to prevent polynomial backtracking
        # on long non-matching whitespace runs (CodeQL py/polynomial-redos).
        ln = re.sub(r' {1,500}([,;:])', r'\1', ln)
        # Remove redundant punctuation
        ln = re.sub(r'([!?])\.+', r'\1', ln)
        # Remove comma/semicolon/colon artifacts that end up directly before a
        # terminal punctuation mark, including quote-adjacent cases like ",."
        # or ",'." introduced by dialogue splitting.
        ln = re.sub(r'([,;:])([\'"]?)([.!?])', r'\2\3', ln)
        # Remove stray spaces before quote+terminal punctuation like "word '."
        # Use [ \t] instead of \s (no newlines on a single line) and cap
        # quantifier to prevent polynomial backtracking (CodeQL py/polynomial-redos).
        ln = re.sub(r"[ \t]{1,500}(['\"])([.!?])", r"\1\2", ln)
        # Also handle the inverse ordering produced during cleanup: "word .'"
        ln = re.sub(r"[ \t]{1,500}([.!?])(['\"])", r"\1\2", ln)
        # Fix ., -> , and ,. -> . and .; -> ; etc
        ln = (
            ln.replace(".,", ",")
            .replace(",.", ".")
            .replace(".;", ";")
            .replace(". :", ":")
        )
        # Collapse multiple identical punctuations like !! -> ! or ?? -> ?
        # (preserving ...)
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
    TTS engines often fail on short sentences.
    This merges them (<= 2 words) with neighbors using semicolons.
    Semicolons are often mapped to pauses by engine adapters.

    If text contains newlines, they are preserved as boundaries.
    If a merge happens across a newline, we use ';; ' to indicate
    a paragraph-level break/pause while merging the text units.
    """
    # Split into lines to detect where merges cross paragraph boundaries
    lines = text.split('\n')

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
        while (count_words(current_text) < 4 and
               i < len(all_sentences_with_meta) - 1):
            i += 1
            next_sent = all_sentences_with_meta[i]
            # Use single semicolon for all merges now
            sep = "; "
            current_text = (
                current_text.rstrip(".!?; ") + sep + next_sent['text']
            )
            # Update line_idx to latest consumed sentence to keep paragraph flow
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
                        # Append with space if we didn't add a pause
                        # separator
                        has_pause = (
                            joined.endswith("; ") or joined.endswith(";; ")
                        )
                        sep = "" if has_pause else " "
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


def sanitize_text(text: str) -> str:
    """
    Advanced sanitization for TTS engines.
    It builds on the base cleaning plus specific hallucination prevention.
    """
    # 1. Perform base TTS cleaning
    # (includes bracket stripping and consolidation)
    text = clean_text_for_tts(text)

    # Preserve newlines but normalize other whitespace
    text = text.replace("\r", " ").replace("\t", " ")

    # 2. Remove any remaining non-ASCII characters
    # that might cause hallucinations
    text = re.sub(r'[^\x00-\x7F\n]+', '', text)
    # Collapse multiple horizontal spaces and trim
    text = re.sub(r'[ \t]+', ' ', text).strip()
    # Normalize multiple newlines to maximum of 1
    text = re.sub(r'\n{2,}', '\n', text)

    # If cleanup leaves a line ending in a soft punctuation mark like a comma,
    # promote it to a sentence stop before the terminal punctuation guard runs.
    text = re.sub(r'([,;:])(["\')\]]*)$', r'.\2', text)

    # 3. Ensure terminal punctuation
    # (Some engines can fail on short strings without it)
    if text and not re.search(r'[.!?]["\')\]\s]*$', text):
        text += "."

    return text


def pack_text_to_limit(
    text: str, limit: int = 500, pad: bool = False
) -> str:
    """
    Greedily packs sentences into larger chunks as close to the limit
    as possible. This gives the synthesis engine the maximum context and prevents
    choppiness from short lines. If pad is True, each chunk is padded
    with spaces up to the limit.
    """
    if not text:
        return ""

    # Split into blocks by literal newlines to respect paragraphing
    raw_lines = text.split('\n')

    # Expand any line that exceeds limit into sub-lines via the sentence
    # splitter, then hard-wrap any remaining sentence that still exceeds limit.
    expanded_lines: list[str] = []
    for line in raw_lines:
        content = line.strip()
        if len(content) <= limit:
            expanded_lines.append(content)
            continue
        # Try sentence-level split first.
        sentences = [s for s, _, _ in split_sentences(content)]
        for sent in sentences:
            if len(sent) <= limit:
                expanded_lines.append(sent)
            else:
                # Hard-wrap at whitespace boundaries, never exceeding limit.
                remaining = sent
                while len(remaining) > limit:
                    # Find last whitespace at or before limit.
                    ws = remaining.rfind(" ", 0, limit)
                    if ws <= 0:
                        # No whitespace — force-cut at limit.
                        expanded_lines.append(remaining[:limit])
                        remaining = remaining[limit:]
                    else:
                        expanded_lines.append(remaining[:ws])
                        remaining = remaining[ws + 1:]
                if remaining:
                    expanded_lines.append(remaining)

    packed = []
    current_chunk = ""

    for line_content in expanded_lines:
        separator = "\n" if current_chunk else ""

        if (current_chunk and (len(current_chunk) + len(separator) +
                               len(line_content) <= limit)):
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
