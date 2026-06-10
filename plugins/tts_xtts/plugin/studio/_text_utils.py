"""Pure text helpers for the XTTS studio handlers.

Kept dependency-free so they can be imported in tests without triggering the
handler/facade circular-import chain.
"""
from __future__ import annotations


def build_segment_groups(segs_to_gen: list, all_segs: list, limit: int) -> list:
    """Group consecutive same-character segments up to *limit* combined characters.

    Pure function — no I/O, no side effects.  Called by handle_xtts_segments with
    the limit resolved from ``get_text_chunk_limit("xtts")`` at handler invocation time.
    Extracted here so it can be unit-tested independently of the handler/facade chain.
    """
    if not segs_to_gen:
        return []
    gen_groups = []
    current_group = [segs_to_gen[0]]
    for i in range(1, len(segs_to_gen)):
        prev = segs_to_gen[i - 1]
        curr = segs_to_gen[i]
        prev_full_idx = next((idx for idx, s in enumerate(all_segs) if s['id'] == prev['id']), -1)
        curr_full_idx = next((idx for idx, s in enumerate(all_segs) if s['id'] == curr['id']), -1)
        trimmed_group_text = " ".join([s['text_content'] for s in current_group])
        combined_len = len(trimmed_group_text) + 1 + len(curr['text_content'])
        same_char = curr['character_id'] == prev['character_id']
        is_consecutive = curr_full_idx == prev_full_idx + 1
        fits_limit = combined_len <= limit
        if same_char and is_consecutive and fits_limit:
            current_group.append(curr)
        else:
            gen_groups.append(current_group)
            current_group = [curr]
    gen_groups.append(current_group)
    return gen_groups


def join_group_text(group: list) -> str:
    """Join segment text_content entries with a single space separator.

    Matches the size-budget calculation used when building segment groups so
    that the string length seen by TTS is consistent with what the grouper
    expected.
    """
    return " ".join(s['text_content'] for s in group)
