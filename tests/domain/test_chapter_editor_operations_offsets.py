"""#232 Task 006: reconcile manual split/merge editor actions with the
render-block-grain schema.

Covers ``_split_segment_at_offset`` and ``compact_script_view``
(``app/domain/chapters/operations.py``): both must maintain
``start_offset``/``end_offset``/``text_hash`` for render-block-grain rows,
write a tombstone for any audio they invalidate, bump
``chapters.render_epoch``, and never produce a non-contiguous chapter (INV-1).
A merge that would exceed the target engine's chunk limit must be refused,
never silently produced.

R1: every test here is written to fail against pre-Task-006 code (offsets
never populated/maintained by these two functions, no tombstone writes, no
epoch bump, no chunk-limit check) -- confirmed by revert-check before this
task's implementation landed.
"""
from __future__ import annotations

import pytest

from app.db.core import get_connection
from app.db.projects import create_project
from app.db.chapters import create_chapter
from app.db.segments import segment_text_hash
from app.db.segment_tombstones import has_tombstone
from app.db.segment_contiguity import assert_chapter_contiguity, ContiguityViolation
from app.domain.chapters.operations import (
    _split_segment_at_offset,
    compact_script_view,
    MergeChunkLimitExceeded,
)


def _make_chapter(text: str) -> tuple[str, str]:
    """Create a project + chapter with real content, so create_chapter's own
    sync_chapter_segments call populates genuine start_offset/end_offset/
    text_hash values -- the state Task 005c guarantees for any chapter
    reached through the normal create/edit path."""
    pid = create_project("Editor Ops Offsets Test")
    cid = create_chapter(pid, "Chapter 1", text_content=text)
    return pid, cid


def _rows(chapter_id: str) -> list[dict]:
    with get_connection() as conn:
        return [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order ASC",
                (chapter_id,),
            )
        ]


def _render_epoch(chapter_id: str) -> int:
    with get_connection() as conn:
        row = conn.execute("SELECT render_epoch FROM chapters WHERE id = ?", (chapter_id,)).fetchone()
        return row["render_epoch"]


def _mark_done(chapter_id: str, segment_id: str, filename: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE chapter_segments SET audio_status = 'done', audio_file_path = ? WHERE id = ?",
            (filename, segment_id),
        )
        conn.commit()


# --------------------------------------------------------------------------- #
# Split
# --------------------------------------------------------------------------- #

def test_split_derives_suboffsets_from_parent_offsets():
    # Single sentence -> one row with real, non-null offsets from create_chapter.
    _, cid = _make_chapter("The quick brown fox jumps over the lazy dog.")
    [row] = _rows(cid)
    assert row["start_offset"] == 0
    assert row["end_offset"] == len(row["text_content"])
    parent_start, parent_end = row["start_offset"], row["end_offset"]

    with get_connection() as conn:
        left_id, right_id = _split_segment_at_offset(conn, cid, row["id"], 10)

    rows_by_id = {r["id"]: r for r in _rows(cid)}
    left, right = rows_by_id[left_id], rows_by_id[right_id]

    # Offsets are derived from the PARENT's own offsets, not recomputed from
    # scratch against the whole chapter -- but for the first (and only) row
    # in the chapter these coincide, so also assert the split point itself.
    assert left["start_offset"] == parent_start
    assert left["end_offset"] == parent_start + 10
    assert right["start_offset"] == parent_start + 10
    assert right["end_offset"] == parent_end

    assert left["text_hash"] == segment_text_hash(left["text_content"])
    assert right["text_hash"] == segment_text_hash(right["text_content"])


def test_split_preserves_later_untouched_row_offsets():
    # Two sentences -> two rows. Splitting the FIRST must not disturb the
    # second row's own offsets.
    _, cid = _make_chapter("Short one. The quick brown fox jumps over the lazy dog.")
    rows = _rows(cid)
    assert len(rows) == 2
    first, second = rows
    second_start_before, second_end_before = second["start_offset"], second["end_offset"]

    with get_connection() as conn:
        _split_segment_at_offset(conn, cid, first["id"], 5)

    rows_after = {r["id"]: r for r in _rows(cid)}
    assert rows_after[second["id"]]["start_offset"] == second_start_before
    assert rows_after[second["id"]]["end_offset"] == second_end_before


def test_split_writes_tombstone_for_invalidated_parent_audio():
    _, cid = _make_chapter("The quick brown fox jumps over the lazy dog.")
    [row] = _rows(cid)
    _mark_done(cid, row["id"], "parent_audio.wav")

    with get_connection() as conn:
        _split_segment_at_offset(conn, cid, row["id"], 10)

    assert has_tombstone(cid, "parent_audio.wav")


def test_split_bumps_render_epoch():
    _, cid = _make_chapter("The quick brown fox jumps over the lazy dog.")
    [row] = _rows(cid)
    epoch_before = _render_epoch(cid)

    with get_connection() as conn:
        _split_segment_at_offset(conn, cid, row["id"], 10)

    assert _render_epoch(cid) == epoch_before + 1


def test_split_result_is_contiguous():
    _, cid = _make_chapter("Short one. The quick brown fox jumps over the lazy dog.")
    rows = _rows(cid)

    with get_connection() as conn:
        _split_segment_at_offset(conn, cid, rows[1]["id"], 10)
        # Must not raise -- the operation itself asserts INV-1 before commit.
        assert_chapter_contiguity(conn, cid)


# --------------------------------------------------------------------------- #
# Merge (compact_script_view)
# --------------------------------------------------------------------------- #

def test_merge_derives_combined_offsets():
    # Two sentences, same (absent) cast on both -> compact_script_view merges
    # them into one row.
    _, cid = _make_chapter("Hello there friend. Short one.")
    rows = _rows(cid)
    assert len(rows) == 2
    first, second = rows

    compact_script_view(cid)

    [merged] = _rows(cid)
    assert merged["start_offset"] == first["start_offset"]
    assert merged["end_offset"] == second["end_offset"]
    assert merged["text_hash"] == segment_text_hash(merged["text_content"])


def test_merge_writes_tombstones_for_both_invalidated_audio_files():
    # Task file names only the right segment's audio, but the merge's own
    # UPDATE statement also nulls the LEFT segment's audio_file_path -- both
    # must be tombstoned, not just the deleted row's.
    _, cid = _make_chapter("Hello there friend. Short one.")
    first, second = _rows(cid)
    _mark_done(cid, first["id"], "left.wav")
    _mark_done(cid, second["id"], "right.wav")

    compact_script_view(cid)

    assert has_tombstone(cid, "left.wav")
    assert has_tombstone(cid, "right.wav")


def test_merge_bumps_render_epoch():
    _, cid = _make_chapter("Hello there friend. Short one.")
    epoch_before = _render_epoch(cid)

    compact_script_view(cid)

    assert _render_epoch(cid) == epoch_before + 1


def test_merge_result_is_contiguous():
    _, cid = _make_chapter("Hello there friend. Short one.")
    compact_script_view(cid)
    with get_connection() as conn:
        assert_chapter_contiguity(conn, cid)  # must not raise


def test_merge_refuses_when_combined_text_exceeds_chunk_limit(monkeypatch):
    _, cid = _make_chapter("Hello there friend. Short one.")
    rows_before = _rows(cid)

    monkeypatch.setattr(
        "app.domain.chapters.operations.get_text_chunk_limit", lambda engine: 5
    )

    with pytest.raises(MergeChunkLimitExceeded):
        compact_script_view(cid)

    # Refused -- never partially applied.
    assert _rows(cid) == rows_before


# --------------------------------------------------------------------------- #
# INV-1 assertion's own correctness (R1 revert-check for the assertion itself)
# --------------------------------------------------------------------------- #

def test_contiguity_assertion_catches_deliberately_introduced_overlap():
    _, cid = _make_chapter("Short one. The quick brown fox jumps over the lazy dog.")
    rows = _rows(cid)
    assert len(rows) == 2

    # Deliberately corrupt: make the second row overlap the first instead of
    # abutting it -- simulates a bug where a caller forgot to update an
    # offset.
    with get_connection() as conn:
        conn.execute(
            "UPDATE chapter_segments SET start_offset = ? WHERE id = ?",
            (rows[1]["start_offset"] - 1, rows[1]["id"]),
        )
        conn.commit()
        with pytest.raises(ContiguityViolation):
            assert_chapter_contiguity(conn, cid)


def test_contiguity_assertion_passes_on_genuinely_contiguous_rows():
    _, cid = _make_chapter("Short one. The quick brown fox jumps over the lazy dog.")
    with get_connection() as conn:
        assert_chapter_contiguity(conn, cid)  # must not raise
