"""Backend word-boundary snapping for sub-sentence span assignment.

Covers ``_apply_range_assignment`` / ``_snap_offset_to_word_boundary`` in
``app/domain/chapters/operations.py``: a drag-selected range whose raw offsets
land mid-word must split at the nearest enclosing WHOLE-word boundary, never
inside a word. This is the authoritative enforcement point (INV-SNAP-1): the
backend snaps independently of the frontend.

TWIN: the identical algorithm lives in the frontend at
``frontend/src/pages/ChapterEditor/components/ScriptView.tsx``
(``snapOffsetToWordBoundary``, task 001). If either side's snapping behavior
changes, the other must be updated in lockstep -- see INV divergence-risk note
in ``design-docs/plans/active/span_word_boundary_snapping/01-map.md``.
"""
from __future__ import annotations

import uuid

from app.db.core import get_connection
from app.db.projects import create_project
from app.db.chapters import create_chapter
from app.db.segments import get_chapter_segments
from app.domain.chapters.operations import (
    _snap_offset_to_word_boundary,
    save_script_assignments,
)


def _make_chapter_with_segments(texts: list[str]) -> tuple[str, str, list[str]]:
    """Create a project + chapter, then replace its segments with controlled
    rows whose text_content is exactly ``texts`` (deterministic offsets)."""
    pid = create_project("Range Assign Test")
    cid = create_chapter(pid, "Chapter 1", text_content=" ".join(texts))
    seg_ids: list[str] = []
    with get_connection() as conn:
        conn.execute("DELETE FROM chapter_segments WHERE chapter_id = ?", (cid,))
        run = uuid.uuid4().hex[:8]
        for order, text in enumerate(texts):
            sid = f"seg_{run}_{order}"
            seg_ids.append(sid)
            conn.execute(
                """
                INSERT INTO chapter_segments
                    (id, chapter_id, segment_order, text_content, audio_status)
                VALUES (?, ?, ?, ?, 'unprocessed')
                """,
                (sid, cid, order, text),
            )
        conn.commit()
    return pid, cid, seg_ids


def _ordered_texts(chapter_id: str) -> list[str]:
    return [s["text_content"] for s in get_chapter_segments(chapter_id)]


# --------------------------------------------------------------------------- #
# Unit-level: the snapping helper itself (boundary cases from 01-map.md risks)
# --------------------------------------------------------------------------- #

def test_snap_offset_zero_unchanged():
    assert _snap_offset_to_word_boundary("hello world", 0, "start") == 0


def test_snap_offset_at_len_unchanged():
    t = "hello world"
    assert _snap_offset_to_word_boundary(t, len(t), "end") == len(t)


def test_snap_offset_on_whitespace_boundary_unchanged():
    # "hello world" -> offset 5 sits before the space, offset 6 after it.
    assert _snap_offset_to_word_boundary("hello world", 5, "end") == 5
    assert _snap_offset_to_word_boundary("hello world", 6, "start") == 6


def test_snap_start_inside_word_moves_backward():
    # "hello world", offset 8 is inside "world" (w=6,o=7,r=8) -> start snaps to 6.
    assert _snap_offset_to_word_boundary("hello world", 8, "start") == 6


def test_snap_end_inside_word_moves_forward():
    # "hello world", offset 2 is inside "hello" -> end snaps to 5.
    assert _snap_offset_to_word_boundary("hello world", 2, "end") == 5


def test_snap_end_inside_trailing_punctuation_keeps_comma_with_word():
    # "said Marcus, quietly" -> word "Marcus," is chars 5..11 (comma at 11).
    t = "said Marcus, quietly"
    # offset 8 is inside "Marcus," -> end snaps forward past the comma to 12.
    assert _snap_offset_to_word_boundary(t, 8, "end") == 12
    assert t[5:12] == "Marcus,"


# --------------------------------------------------------------------------- #
# Behavior-level: observable final text after save_script_assignments (R1 bar)
# --------------------------------------------------------------------------- #

def test_mid_word_start_offset_snaps_split_to_word_start():
    # Single segment "hello brave world". Raw start_offset 8 lands inside
    # "brave" (offset 6..11). It must snap back to 6 so the assigned span
    # begins at "brave", not "ave".
    _, cid, [sid] = _make_chapter_with_segments(["hello brave world"])
    save_script_assignments(
        cid,
        assignments=[],
        range_assignments=[{
            "start_span_id": sid, "start_offset": 8,
            "end_span_id": sid, "end_offset": 17,  # end == len -> untouched
            "character_id": "char-1",
        }],
    )
    texts = _ordered_texts(cid)
    # Left remnant is the whole word prefix "hello "; assigned span is "brave world".
    assert "brave world" in texts
    assert not any(t.startswith("ave") for t in texts)


def test_mid_word_end_offset_snaps_split_to_word_end():
    # Raw end_offset 8 lands inside "brave" -> must snap forward to 11 so the
    # assigned span ends at the whole word "hello brave".
    _, cid, [sid] = _make_chapter_with_segments(["hello brave world"])
    save_script_assignments(
        cid,
        assignments=[],
        range_assignments=[{
            "start_span_id": sid, "start_offset": 0,
            "end_span_id": sid, "end_offset": 8,
            "character_id": "char-1",
        }],
    )
    texts = _ordered_texts(cid)
    assert "hello brave" in texts
    # No fragment cut mid-word.
    assert not any(t == "hello bra" for t in texts)


def test_whitespace_boundary_offsets_unaffected():
    # R1 baseline: offsets already on whitespace boundaries produce the same
    # split as raw behavior. "hello brave world": start 6, end 11 -> "brave".
    _, cid, [sid] = _make_chapter_with_segments(["hello brave world"])
    save_script_assignments(
        cid,
        assignments=[],
        range_assignments=[{
            "start_span_id": sid, "start_offset": 6,
            "end_span_id": sid, "end_offset": 11,
            "character_id": "char-1",
        }],
    )
    assert "brave" in _ordered_texts(cid)


def test_losslessness_preserved_after_snapped_split():
    original = "hello brave world"
    _, cid, [sid] = _make_chapter_with_segments([original])
    save_script_assignments(
        cid,
        assignments=[],
        range_assignments=[{
            "start_span_id": sid, "start_offset": 8,
            "end_span_id": sid, "end_offset": 15,
            "character_id": "char-1",
        }],
    )
    assert "".join(_ordered_texts(cid)) == original


def test_cross_span_mid_word_both_ends_snap():
    # Two segments. start mid-word in seg 0, end mid-word in seg 1. Both must
    # snap to whole-word boundaries.
    #   seg0 = "the quick fox"  start_offset 5 -> inside "quick" (4..9) -> snap 4
    #   seg1 = "jumps over now"  end_offset 3 -> inside "jumps" (0..5) -> snap 5
    _, cid, seg_ids = _make_chapter_with_segments(["the quick fox", "jumps over now"])
    s0, s1 = seg_ids
    save_script_assignments(
        cid,
        assignments=[],
        range_assignments=[{
            "start_span_id": s0, "start_offset": 5,
            "end_span_id": s1, "end_offset": 3,
            "character_id": "char-1",
        }],
    )
    texts = _ordered_texts(cid)
    # seg0 splits at 4: "the " + "quick fox"; seg1 splits at 5: "jumps" + " over now".
    assert "quick fox" in texts
    assert "jumps" in texts
    assert "".join(texts) == "the quick foxjumps over now"


def test_cross_span_trailing_punctuation_snaps_with_word():
    # end offset landing between "Marcus" and its comma snaps to include comma.
    #   seg0 = "then he spoke"
    #   seg1 = "said Marcus, quietly"  end_offset 11 (before comma) -> snap 12
    _, cid, seg_ids = _make_chapter_with_segments(["then he spoke", "said Marcus, quietly"])
    s0, s1 = seg_ids
    save_script_assignments(
        cid,
        assignments=[],
        range_assignments=[{
            "start_span_id": s0, "start_offset": 0,
            "end_span_id": s1, "end_offset": 11,
            "character_id": "char-1",
        }],
    )
    texts = _ordered_texts(cid)
    # The assigned region's end word keeps its comma: "said Marcus," is intact.
    assert any("Marcus," in t for t in texts)
    assert "".join(texts) == "then he spokesaid Marcus, quietly"
