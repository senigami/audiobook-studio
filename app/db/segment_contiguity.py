"""Shared INV-1 (order-truth) contiguity/non-overlap assertion (#232).

Originally written inline inside the destructive collapse migration (Task
005, ``render_block_collapse.py``). Task 006 needed the identical check for
the manual split/merge editor actions, so per that task's own instruction
("extract it into a shared helper ... or refactor if Task 006 executes
first"), it now lives here and both callers use it. The migration keeps its
own ``CollapseMigrationError`` type for backward compatibility with its
existing tests -- it catches ``ContiguityViolation`` and re-raises as that
type; a new caller can just let ``ContiguityViolation`` propagate.
"""
from __future__ import annotations

import sqlite3


class ContiguityViolation(RuntimeError):
    """A chapter's ``chapter_segments`` rows are not a contiguous,
    non-overlapping partition of the chapter's canonical text (INV-1)."""


def assert_chapter_contiguity(conn: sqlite3.Connection, chapter_id: str) -> None:
    """Raise ``ContiguityViolation`` if ``chapter_id``'s segment rows, ordered
    by ``start_offset``, don't chain with no gaps and no overlaps across the
    full length of the chapter's canonical text. A no-op if the chapter has
    no segment rows at all."""
    rows = conn.execute(
        """
        SELECT id, start_offset, end_offset FROM chapter_segments
        WHERE chapter_id = ? ORDER BY start_offset ASC
        """,
        (chapter_id,),
    ).fetchall()
    if not rows:
        return
    chapter_row = conn.execute(
        "SELECT text_content FROM chapters WHERE id = ?", (chapter_id,)
    ).fetchone()
    canonical_text = (chapter_row["text_content"] if chapter_row else None) or ""

    if rows[0]["start_offset"] != 0:
        raise ContiguityViolation(
            f"chapter {chapter_id}: INV-1 violated -- first segment start_offset "
            f"{rows[0]['start_offset']} != 0"
        )
    prev_end = 0
    for row in rows:
        if row["start_offset"] != prev_end:
            raise ContiguityViolation(
                f"chapter {chapter_id}: INV-1 violated -- gap/overlap between "
                f"offset {prev_end} and segment {row['id']}'s start_offset {row['start_offset']}"
            )
        prev_end = row["end_offset"]
    if prev_end != len(canonical_text):
        raise ContiguityViolation(
            f"chapter {chapter_id}: INV-1 violated -- last segment end_offset "
            f"{prev_end} != chapter text length {len(canonical_text)}"
        )
