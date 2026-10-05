"""
Tests for app/db/segment_alignment.align_render_blocks -- Task 002 of the
segment-render-block redesign (#232). Extends align_segments' proven three-pass
matcher to render-block grain: existing rows may contain multiple sentences each.

See ~/.claude/plans/audiobook-factory/segment-render-block-redesign/tasks/
002-resync-alignment-extension.md for the full spec this implements.

Fixtures build fresh_sentences with split_into_sentences(preserve_gap=True) so
concatenating them reproduces the "new" chapter text exactly, matching what the
real caller (Task 005) will pass.
"""
from app.db.nlp import split_into_sentences
from app.db.segments import segment_text_hash
from app.db.segment_alignment import align_render_blocks


def _row(id_, text, audio_status="done", **extra):
    r = {"id": id_, "text_content": text, "audio_status": audio_status}
    r.update(extra)
    return r


def _outcome(result, row_id):
    for o in result.outcomes:
        if o.row_id == row_id:
            return o
    return None


def test_unchanged_row_preserved_with_shifted_offsets():
    """A row with multiple sentences, entirely untouched, survives with id, cast,
    audio, and text_content intact -- only offsets shift because an earlier row's
    text got longer."""
    row_a_text = "Short one. "
    row_b_text = "First sentence here. Second sentence here."
    existing = [_row("a", row_a_text), _row("b", row_b_text)]

    # Row a's text grew (edited); row b is untouched.
    new_a_text = "Short one, but now much longer. "
    fresh = split_into_sentences(new_a_text) + split_into_sentences(row_b_text)

    result = align_render_blocks(existing, fresh)

    b = _outcome(result, "b")
    assert b is not None
    assert b.kind == "unchanged"
    assert b.text_content == row_b_text
    assert b.start_offset == len(new_a_text)
    assert b.end_offset == len(new_a_text) + len(row_b_text)
    assert b.text_hash == segment_text_hash(row_b_text)

    a = _outcome(result, "a")
    assert a is None or a.kind != "unchanged"


def test_whole_chapter_offset_recomputation_not_incremental():
    """Editing near the START of a chapter (length change) must shift every LATER
    unchanged row's offsets, derived fresh from position -- never by patching old
    offsets with += delta arithmetic."""
    row1 = "One. "
    row2 = "Two sentences here. Still two."
    row3 = "Three."
    existing = [_row("r1", row1), _row("r2", row2), _row("r3", row3)]

    edited_row1 = "One, edited to be considerably longer now. "
    fresh = (
        split_into_sentences(edited_row1)
        + split_into_sentences(row2)
        + split_into_sentences(row3)
    )

    result = align_render_blocks(existing, fresh)

    r2 = _outcome(result, "r2")
    r3 = _outcome(result, "r3")
    assert r2.kind == "unchanged"
    assert r3.kind == "unchanged"
    expected_r2_start = len(edited_row1)
    expected_r2_end = expected_r2_start + len(row2)
    assert (r2.start_offset, r2.end_offset) == (expected_r2_start, expected_r2_end)
    expected_r3_start = expected_r2_end
    expected_r3_end = expected_r3_start + len(row3)
    assert (r3.start_offset, r3.end_offset) == (expected_r3_start, expected_r3_end)


def test_partial_change_split_prefix_and_suffix_survive_middle_invalidated():
    """A row with 3 sentences where only the MIDDLE one changed: split into pieces,
    the longer (here: tied, so prefix wins) surviving piece keeps the row id, ALL
    pieces are invalidated (no partial-audio reuse)."""
    s1 = "First sentence. "
    s2 = "Middle sentence. "
    s3 = "Last sentence."
    existing = [_row("row", s1 + s2 + s3)]

    new_s2 = "Completely different middle. "
    fresh = split_into_sentences(s1) + split_into_sentences(new_s2) + split_into_sentences(s3)

    result = align_render_blocks(existing, fresh)

    row_outcome = _outcome(result, "row")
    assert row_outcome.kind == "split"
    assert len(row_outcome.pieces) == 2  # prefix (s1) survives, suffix (s3) survives, middle is new
    keepers = [p for p in row_outcome.pieces if p.keeps_original_id]
    assert len(keepers) == 1
    assert keepers[0].id == "row"
    # ALL pieces invalidated -- no partial reuse (checked at the caller/DB layer via
    # the fact that this function never carries audio_status/audio_file_path forward
    # for split outcomes at all -- SplitPiece has no such fields).
    for p in row_outcome.pieces:
        assert not hasattr(p, "audio_status")


def test_risk1_shape_a_boundary_disappears_no_merge_all_rows_survive():
    """RISK-1 Shape A: only the paragraph break between two rows is deleted, no
    sentence-ending punctuation touched. Every sentence's content is unchanged, so
    both rows survive untouched with no tie-break needed."""
    row_a_text = "First sentence."
    row_b_text = "Second sentence."
    existing = [_row("a", row_a_text), _row("b", row_b_text)]

    # Original chapter text had a paragraph break (e.g. "\n\n") between the rows;
    # the edit deletes it, but each sentence's own text is untouched.
    fresh = split_into_sentences(row_a_text + " " + row_b_text)

    result = align_render_blocks(existing, fresh)

    a = _outcome(result, "a")
    b = _outcome(result, "b")
    assert a.kind == "unchanged"
    assert b.kind == "unchanged"
    assert a.text_content == row_a_text
    assert b.text_content == row_b_text


def test_risk1_shape_b_merge_across_boundary_longer_contributor_wins():
    """RISK-1 Shape B: the sentence-ending punctuation AND the paragraph break are
    both deleted, merging the last sentence of row A with the first sentence of row
    B into one new fresh sentence. Neither row is individually rendered here, so the
    longer contributor wins the id/content; the shorter one is deleted."""
    row_a_text = "A short tail"  # no terminal punctuation -- one "sentence" fragment
    row_b_text = "a much longer surviving head of text that continues on."
    existing = [_row("a", row_a_text, audio_status="unprocessed"),
                _row("b", row_b_text, audio_status="unprocessed")]

    merged = row_a_text + " " + row_b_text  # merged into ONE fresh sentence
    fresh = split_into_sentences(merged)
    assert len(fresh) == 1  # sanity: the fixture actually merges into one sentence

    result = align_render_blocks(existing, fresh)

    a = _outcome(result, "a")
    b = _outcome(result, "b")
    # The longer contributor (b) wins the id; a is deleted (absorbed, not hollow).
    assert b.kind in ("unchanged", "split")
    if b.kind == "split":
        keeper = [p for p in b.pieces if p.keeps_original_id]
        assert len(keeper) == 1
    assert a.kind == "deleted"


def test_inv8_rendered_segment_protection_overrides_length_heuristic():
    """INV-8: when exactly one contributor to a cross-row merge is rendered, it wins
    the tie-break EVEN THOUGH it is the shorter contributor -- proving the rule isn't
    merely agreeing with the length heuristic by coincidence."""
    row_a_text = "short"  # shorter, but RENDERED
    row_b_text = "a much longer unrendered contributor of text that continues"
    existing = [
        _row("a", row_a_text, audio_status="done"),
        _row("b", row_b_text, audio_status="unprocessed"),
    ]

    merged = row_a_text + " " + row_b_text
    fresh = split_into_sentences(merged)
    assert len(fresh) == 1

    result = align_render_blocks(existing, fresh)

    a = _outcome(result, "a")
    b = _outcome(result, "b")
    # Rendered "a" wins despite being shorter.
    assert b.kind == "deleted"
    assert a.kind in ("unchanged", "split")
    if a.kind == "split":
        keeper = [p for p in a.pieces if p.keeps_original_id]
        assert len(keeper) == 1


def test_wholly_unmatched_row_deleted_when_no_content_reappears():
    """A row whose content vanishes entirely (not moved elsewhere) is deleted."""
    existing = [_row("gone", "This entire sentence is removed.")]
    fresh = split_into_sentences("Completely unrelated replacement text.")

    result = align_render_blocks(existing, fresh)

    gone = _outcome(result, "gone")
    assert gone.kind == "deleted"


def test_moved_block_rehomed_with_unique_match():
    """A row's exact text reappears elsewhere in the chapter (cut-and-paste) -- its
    id and audio are preserved, not deleted+recreated. A single-sentence row's
    unique content is recognized either by the core matcher's own unique-content
    search (surfacing as "unchanged", since id/content/audio all survive exactly
    the same way) or by this layer's dedicated re-home path -- both are correct,
    non-destructive outcomes, so this test accepts either rather than mandating
    which internal path fired."""
    moved_text = "This whole paragraph got moved to a new spot."
    other_text = "An unrelated sentence stays where it is."
    existing = [_row("moved", moved_text), _row("stays", other_text)]

    # New order: "stays" first, then "moved" reappears verbatim later, plus some
    # brand-new unrelated content filling the gap it left behind.
    fresh = (
        split_into_sentences(other_text)
        + split_into_sentences("Brand new content fills the old spot.")
        + split_into_sentences(moved_text)
    )

    result = align_render_blocks(existing, fresh)

    moved = _outcome(result, "moved")
    stays = _outcome(result, "stays")
    assert moved.kind in ("re-homed", "unchanged")
    assert moved.text_content.strip() == moved_text
    assert stays.kind == "unchanged"


def test_moved_block_ambiguous_tie_falls_back_to_deletion():
    """Two wholly-unmatched rows share byte-identical text, and only one copy of
    that text exists in the new region, with neither row rendered -- genuinely
    ambiguous, so both fall back to delete+new rather than guessing. The filler row
    exists purely to push both duplicate anchors past position-anchored Pass 1's
    reach (len(fresh) == 2), so this test actually exercises the tie-break instead
    of an accidental positional match."""
    dup_text = "This exact duplicated line appears twice originally."
    existing = [
        _row("anchor", "An anchor sentence that stays put."),
        _row("filler", "This filler row is deleted outright."),
        _row("dup1", dup_text, audio_status="unprocessed"),
        _row("dup2", dup_text, audio_status="unprocessed"),
    ]
    # Only ONE occurrence of dup_text survives in the new text.
    fresh = split_into_sentences("An anchor sentence that stays put.") + split_into_sentences(dup_text)

    result = align_render_blocks(existing, fresh)

    dup1 = _outcome(result, "dup1")
    dup2 = _outcome(result, "dup2")
    # Neither rendered -> genuinely ambiguous -> both deleted, none guessed at.
    assert dup1.kind == "deleted"
    assert dup2.kind == "deleted"


def test_moved_block_tie_prefers_rendered_candidate():
    """Same duplicate-content tie as above, but one of the two candidates IS
    rendered -- INV-8 says prefer re-homing that one instead of falling back."""
    dup_text = "This exact duplicated line appears twice originally."
    existing = [
        _row("anchor", "An anchor sentence that stays put."),
        _row("filler", "This filler row is deleted outright."),
        _row("dup1", dup_text, audio_status="done"),
        _row("dup2", dup_text, audio_status="unprocessed"),
    ]
    fresh = split_into_sentences("An anchor sentence that stays put.") + split_into_sentences(dup_text)

    result = align_render_blocks(existing, fresh)

    dup1 = _outcome(result, "dup1")
    dup2 = _outcome(result, "dup2")
    assert dup1.kind == "re-homed"
    assert dup2.kind == "deleted"


def test_inv9_text_hash_freshly_computed_on_split():
    """Every piece with new/changed text_content carries a freshly computed
    text_hash -- proving a stale hash left on a split piece would wrongly let
    Task 003's write-back guard accept a stale render."""
    s1 = "Kept prefix. "
    s2 = "Changed middle."
    existing = [_row("row", s1 + s2, text_hash="stale-hash-from-before-the-edit")]

    new_s2 = "Brand new middle content."
    fresh = split_into_sentences(s1) + split_into_sentences(new_s2)

    result = align_render_blocks(existing, fresh)

    row_outcome = _outcome(result, "row")
    assert row_outcome.kind == "split"
    for piece in row_outcome.pieces:
        assert piece.text_hash == segment_text_hash(piece.text_content)
        assert piece.text_hash != "stale-hash-from-before-the-edit"


def test_render_epoch_bump_flag_set_once_per_call():
    """This pure function cannot touch the DB (module docstring: no DB access, no
    side effects) so it signals the epoch-bump obligation to its caller instead of
    performing it -- Task 005's integration wires this to an actual UPDATE, once per
    resync call regardless of how many rows changed."""
    existing = [_row("a", "Unchanged text.")]
    fresh = split_into_sentences("Unchanged text.")

    result = align_render_blocks(existing, fresh)

    assert result.render_epoch_bumped is True


def test_reword_with_no_boundary_or_count_change_touches_only_that_row():
    """A plain reword (1:1 sentence count, no boundary/merge involved) is handled by
    ordinary per-row split logic, affecting only the one row whose text changed."""
    existing = [_row("a", "Original wording here."), _row("b", "Untouched sentence.")]
    fresh = split_into_sentences("Reworded content entirely.") + split_into_sentences("Untouched sentence.")

    result = align_render_blocks(existing, fresh)

    a = _outcome(result, "a")
    b = _outcome(result, "b")
    assert b.kind == "unchanged"
    assert a.kind in ("deleted", "split")
