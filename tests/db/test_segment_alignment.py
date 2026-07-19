"""
Tests for app/db/segment_alignment.align_segments -- the shared reconciliation
function replacing sync_chapter_segments' positional whole-sentence-equality rule
(RC-1 fix). See design-docs/plans/active/span_resync_preservation_fix/ for the design.
"""
from app.db.segment_alignment import align_segments


def _row(id_, text, **extra):
    r = {"id": id_, "text_content": text}
    r.update(extra)
    return r


def test_whole_sentence_exact_match_unchanged():
    """Today's happy path: unchanged sentences at the same index are preserved."""
    existing = [_row("a", "Hello world."), _row("b", "Goodbye world.")]
    fresh = ["Hello world.", "Goodbye world."]

    result = align_segments(existing, fresh)

    assert len(result.preserved) == 2
    assert result.preserved[0].existing_ids == ["a"]
    assert result.preserved[1].existing_ids == ["b"]
    assert result.new_sentence_indices == []
    assert result.unmatched_existing_ids == set()


def test_two_fragment_split_preserved_when_unrelated_sentence_edited():
    """A manually-split sentence's fragments survive an edit to a DIFFERENT sentence."""
    existing = [
        _row("frag1", "Hello "),
        _row("frag2", "world."),
        _row("c", "Original second sentence."),
    ]
    # Second sentence edited; the split first sentence is untouched.
    fresh = ["Hello world.", "Edited second sentence."]

    result = align_segments(existing, fresh)

    preserved_for_0 = [p for p in result.preserved if p.fresh_index == 0]
    assert len(preserved_for_0) == 1
    assert preserved_for_0[0].existing_ids == ["frag1", "frag2"]
    # The edited sentence is new/changed.
    assert result.new_sentence_indices == [1]
    assert result.unmatched_existing_ids == {"c"}


def test_three_fragment_split_preserved():
    """A three-way split (left/middle/right from _apply_range_assignment's two-call
    pattern) is preserved as one run."""
    existing = [_row("l", "The "), _row("m", "quick "), _row("r", "fox.")]
    fresh = ["The quick fox."]

    result = align_segments(existing, fresh)

    assert len(result.preserved) == 1
    assert result.preserved[0].existing_ids == ["l", "m", "r"]
    assert result.new_sentence_indices == []


def test_unbounded_fragment_run_four_plus():
    """Assignments accumulate across separate edits with no re-merge -- a run can be
    longer than the 3 fragments a single split call produces. Must not be capped at 3."""
    existing = [
        _row("p1", "One "),
        _row("p2", "two "),
        _row("p3", "three "),
        _row("p4", "four "),
        _row("p5", "five."),
    ]
    fresh = ["One two three four five."]

    result = align_segments(existing, fresh)

    assert len(result.preserved) == 1
    assert result.preserved[0].existing_ids == ["p1", "p2", "p3", "p4", "p5"]


def test_reordered_duplicates_do_not_cross_match_but_unique_sentence_is_preserved():
    """The corrected semantics of test_chapters_sync.py's
    test_sync_chapter_segments_does_not_cross_match_reordered_duplicates (Invariant I2,
    round 2): reordered duplicate content ("Repeat.") must never cross-match -- only
    position-anchored matching applies to it -- but uniquely-identified content
    ("Middle.") must be recognized and preserved at its new position."""
    existing = [
        _row("first", "Repeat."),
        _row("middle", "Middle."),
        _row("last", "Repeat."),
    ]
    # Reordered: Repeat, Repeat, Middle.
    fresh = ["Repeat.", "Repeat.", "Middle."]

    result = align_segments(existing, fresh)

    by_index = {p.fresh_index: p.existing_ids for p in result.preserved}
    # fresh[0] "Repeat." matches existing[0] "Repeat." by position (pass 1).
    assert by_index.get(0) == ["first"]
    # fresh[1] "Repeat." does NOT cross-match to existing[2] "Repeat." -- duplicate
    # content is position-only, and existing[1] at that position is "Middle.", so no
    # match; fresh[1] is new/unprocessed.
    assert 1 not in by_index
    assert 1 in result.new_sentence_indices
    # fresh[2] "Middle." is unique -- recognized and preserved at its new position.
    assert by_index.get(2) == ["middle"]
    # existing[2] ("last", the second original Repeat) is unmatched -> deleted.
    assert "last" in result.unmatched_existing_ids


def test_whitespace_falsifier_strip_after_concat():
    """Invariant I3: split_into_sentences (preserve_gap=True) still strips at least
    ' \\t\\r' off each whole sentence's edges; fragments are raw substrings of an
    already-once-stripped sentence. Concatenating existing fragments and stripping the
    OUTER edges (not comparing raw un-stripped slices) must match the fresh sentence."""
    # Simulates a sentence "Hello world." that was split into two fragment rows whose
    # raw text, when concatenated, has no extra whitespace at the join -- but the
    # fresh sentence value itself may carry a leading/trailing artifact stripped by
    # the splitter. Both sides go through _norm() (.strip()) before comparison.
    existing = [_row("l", "Hello "), _row("r", "world.")]
    fresh = ["  Hello world.  "]  # as if the splitter's stripping left outer whitespace

    result = align_segments(existing, fresh)

    assert len(result.preserved) == 1
    assert result.preserved[0].existing_ids == ["l", "r"]


def test_genuinely_edited_sentence_reports_discard_for_that_sentence_only():
    """Editing the sentence a split touches correctly invalidates just that sentence's
    fragments -- not the whole chapter (Invariant I1)."""
    existing = [
        _row("frag1", "Hello "),
        _row("frag2", "world."),
        _row("c", "Untouched sentence."),
    ]
    # First sentence substantively changed; second untouched.
    fresh = ["Completely different text.", "Untouched sentence."]

    result = align_segments(existing, fresh)

    assert result.new_sentence_indices == [0]
    by_index = {p.fresh_index: p.existing_ids for p in result.preserved}
    assert by_index.get(1) == ["c"]
    assert result.unmatched_existing_ids == {"frag1", "frag2"}
