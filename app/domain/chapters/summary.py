"""The single source of truth for chapter progress/status math (#232 Task 007).

INV-5 (single-source-of-truth): no code path other than ``get_chapter_summary``
computes chapter-wide percent-complete or remaining-characters-for-ETA from
persisted segment state.

INV-6 (character-weight-not-sentence-count): every percent/progress
calculation here is weighted by character count, never by segment/sentence
count. See the owner's explicit requirement in
``tasks/007-chapter-summary-function.md``: "we don't care about sentences,
ever."

Character-count unit is pinned to the STRIPPED text length
(``text_content.strip()``), matching the render pipeline's own weight unit
(``app.domain.chunk_groups.build_script_entry_for_group``'s
``len(" ".join(group["text_parts"]).strip())``) rather than raw
``text_content`` length -- the two silently disagreed prior to this function
(the now-removed ``app.db.segments.chapter_completion_by_size`` used raw
``LENGTH(text_content)`` and disagreed -- #232 Task 008 deleted it once it
had no remaining production callers).

Trusts ``audio_status`` exactly as persisted -- it does NOT re-validate
against the filesystem (W5). ``app.db.segments.get_chapter_segments`` NULLs
`audio_status`/`audio_file_path` for rows whose file is missing on disk as a
read-path side effect; if that healing needs to happen, it happens before
this function is called, never inside it, so every consumer of this function
agrees with every other consumer about a chapter's state.

Shape is deliberately per-chapter-callable-and-summable so a future
``get_book_summary(book_id)`` (issue #253, deferred) can be implemented as
"call this once per chapter and sum/average the relevant fields" -- nothing
here bakes in single-chapter-only assumptions.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SegmentSummary:
    id: str
    char_count: int
    audio_status: str
    start_offset: int
    end_offset: int


@dataclass
class ChapterSummary:
    total_chars: int
    total_words: int
    segment_count: int
    segments: list[SegmentSummary] = field(default_factory=list)
    percent_complete: float = 0.0
    chars_remaining: int = 0


def get_chapter_summary(conn, chapter_id: str) -> ChapterSummary:
    """Return the canonical progress/status summary for one chapter.

    Reads `chapter_segments` ordered by `start_offset` (the authoritative
    ordering per 01-map.md -- `segment_order` is a derived convenience
    column, not read here). A single query; no in-memory caching across
    calls -- this is meant to be cheap enough to call on every relevant
    read.
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, text_content, audio_status, start_offset, end_offset
        FROM chapter_segments
        WHERE chapter_id = ?
        ORDER BY start_offset ASC
        """,
        (chapter_id,),
    )
    rows = cursor.fetchall()

    segments: list[SegmentSummary] = []
    total_chars = 0
    total_words = 0
    done_chars = 0

    for row in rows:
        stripped = (row["text_content"] or "").strip()
        char_count = len(stripped)
        word_count = len(stripped.split())
        audio_status = row["audio_status"]

        segments.append(
            SegmentSummary(
                id=row["id"],
                char_count=char_count,
                audio_status=audio_status,
                start_offset=row["start_offset"],
                end_offset=row["end_offset"],
            )
        )
        total_chars += char_count
        total_words += word_count
        if audio_status == "done":
            done_chars += char_count

    percent_complete = 0.0 if total_chars == 0 else round((done_chars / total_chars) * 100, 2)
    chars_remaining = total_chars - done_chars

    return ChapterSummary(
        total_chars=total_chars,
        total_words=total_words,
        segment_count=len(segments),
        segments=segments,
        percent_complete=percent_complete,
        chars_remaining=chars_remaining,
    )
