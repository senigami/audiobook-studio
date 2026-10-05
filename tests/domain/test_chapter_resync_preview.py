"""
Tests for get_resync_preview (RC-1 fix, Task 5) -- the preview must use the SAME
align_segments alignment as the real sync_chapter_segments, so it can't warn about a
destructive resync that the real save will actually preserve (the Task 4 code
review: this was reproducibly false before this task, and segment_alignment.py's own
docstring flagged the drift as live until this task landed).
"""
from app.db.projects import create_project
from app.db.chapters import create_chapter
from app.db.segments import sync_chapter_segments, get_chapter_segments
from app.db.characters import create_character
from app.db import update_segment
from app.domain.chapters.operations import get_resync_preview


def test_preview_does_not_report_destructive_for_a_reorder_the_real_sync_actually_preserves():
    """The exact scenario the Task 4 review reproduced as a live bug: a uniquely-
    identified sentence (not a duplicate) moved by a reorder is preserved by the real
    sync (content search, Invariant I2) but was reported as lost by the old
    position-only preview."""
    pid = create_project("PP1")
    cid = create_chapter(pid, "CP1", text_content="Repeat. Middle. Repeat.")

    sync_chapter_segments(cid, "Repeat. Middle. Repeat.")
    segs = get_chapter_segments(cid)
    middle_id = segs[1]["id"]

    hero = create_character(pid, "Hero")
    update_segment(middle_id, character_id=hero)

    preview = get_resync_preview(cid, "Repeat. Repeat. Middle.")

    assert preview["lost_assignments_count"] == 0
    assert preview["affected_character_names"] == []
    assert preview["is_destructive"] is False

    # Confirm the preview's prediction actually matches what a real sync does.
    sync_chapter_segments(cid, "Repeat. Repeat. Middle.")
    segs_after = get_chapter_segments(cid)
    middle_row = next(s for s in segs_after if s["id"] == middle_id)
    assert middle_row["character_id"] == hero


def test_preview_reports_genuine_loss_when_a_split_sentence_is_actually_edited():
    """A sentence that IS actually edited loses its assignment for real -- the preview
    must still report that case as destructive."""
    pid = create_project("PP2")
    cid = create_chapter(pid, "CP2", text_content="First sentence. Second sentence.")

    sync_chapter_segments(cid, "First sentence. Second sentence.")
    segs = get_chapter_segments(cid)
    second_id = segs[1]["id"]

    villain = create_character(pid, "Villain")
    update_segment(second_id, character_id=villain)

    preview = get_resync_preview(cid, "First sentence. Completely different text.")

    assert preview["lost_assignments_count"] == 1
    assert preview["affected_character_names"] == ["Villain"]
    assert preview["is_destructive"] is True


def test_preview_is_a_pure_read_no_db_writes():
    """get_resync_preview must never write to the DB -- confirmed by checking the
    segment rows are byte-identical before and after calling it."""
    pid = create_project("PP3")
    cid = create_chapter(pid, "CP3", text_content="One. Two. Three.")

    sync_chapter_segments(cid, "One. Two. Three.")
    before = get_chapter_segments(cid)

    get_resync_preview(cid, "One. Two. Three. Four.")

    after = get_chapter_segments(cid)
    assert before == after


def test_preview_is_not_destructive_for_a_split_that_shrinks_row_count_with_zero_loss():
    """Regression for a bug both independent code reviews found:
    a manually-split sentence's row count naturally shrinks back to 1 fresh sentence when
    consolidated, but that shrinkage alone must not mark the resync destructive when zero
    assignments were actually lost -- the old `total_new < total_old` heuristic produced a
    contradictory UI (a destructive warning directly above "all assignments preserved")."""
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db.core import get_connection
    from app.db.characters import create_character

    pid = create_project("PP4")
    cid = create_chapter(pid, "CP4", text_content="The quick fox. Second sentence.")

    sync_chapter_segments(cid, "The quick fox. Second sentence.")
    segs = get_chapter_segments(cid)
    whole_id = segs[0]["id"]
    second_id = segs[1]["id"]

    fox_char = create_character(pid, "Fox")
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM chapter_segments WHERE id = ?", (whole_id,))
        cursor.execute(
            """
            INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content, character_id, audio_status)
            VALUES ('l_frag', ?, 0, 'The ', NULL, 'unprocessed')
            """,
            (cid,),
        )
        cursor.execute(
            """
            INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content, character_id, audio_status)
            VALUES ('m_frag', ?, 1, 'quick ', ?, 'unprocessed')
            """,
            (cid, fox_char),
        )
        cursor.execute(
            """
            INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content, character_id, audio_status)
            VALUES ('r_frag', ?, 2, 'fox. ', NULL, 'unprocessed')
            """,
            (cid,),
        )
        cursor.execute("UPDATE chapter_segments SET segment_order = 3 WHERE id = ?", (second_id,))
        conn.commit()

    preview = get_resync_preview(cid, "The quick fox. Second sentence.")

    assert preview["total_segments_before"] == 4
    assert preview["lost_assignments_count"] == 0
    assert preview["is_destructive"] is False

    # total_segments_after is checked against what the sync ACTUALLY produces, never a
    # hand-written number: this assertion previously expected 2 (the sentence-grain
    # preview's own answer) while the sync has always kept all four rows, so the test
    # was pinning the drift instead of catching it.
    sync_chapter_segments(cid, "The quick fox. Second sentence.")
    rows_after_real_sync = len(get_chapter_segments(cid))
    assert preview["total_segments_after"] == rows_after_real_sync
    assert "m_frag" in {s["id"] for s in get_chapter_segments(cid)}


def test_preview_matches_the_real_sync_on_a_multi_sentence_render_block():
    """#232 render-block grain: a chapter_segments row can hold several sentences.

    The preview must predict what the real sync does. The expectation here is taken
    from the sync itself (not recomputed from the preview's own arithmetic), so this
    cannot pass by agreeing with its own implementation.
    """
    pid = create_project("PP-RB")
    cid = create_chapter(pid, "CP-RB", text_content="Alpha one. Beta two.")

    # First sync is virgin -> one row per sentence.
    sync_chapter_segments(cid, "Alpha one. Beta two.")
    # Second sync ADDS content, so the new sentences group into ONE render block
    # holding more than one sentence (Task 005b: grouping happens at row creation).
    full_text = "Alpha one. Beta two. Gamma three. Delta four."
    sync_chapter_segments(cid, full_text)

    segs = get_chapter_segments(cid)
    multi = [s for s in segs if len(s["text_content"].strip().split(". ")) > 1]
    assert multi, f"expected a multi-sentence render block, got {[s['text_content'] for s in segs]}"

    block = multi[0]
    hero = create_character(pid, "Blockhero")
    update_segment(block["id"], character_id=hero)

    # Preview a resync of the IDENTICAL text: nothing changes, so nothing can be lost.
    preview = get_resync_preview(cid, full_text)

    # Independent expectation: perform the real sync and observe the truth.
    sync_chapter_segments(cid, full_text)
    after = get_chapter_segments(cid)
    surviving = {s["id"] for s in after}
    really_lost = 0 if block["id"] in surviving else 1
    still_assigned = next(
        (s for s in after if s["id"] == block["id"] and s["character_id"] == hero), None
    )

    assert really_lost == 0, "precondition: the real sync preserves the row on identical text"
    assert still_assigned is not None, "precondition: the real sync keeps the assignment"

    # The preview must have said the same thing.
    assert preview["lost_assignments_count"] == really_lost
    assert preview["affected_character_names"] == []
    assert preview["is_destructive"] is False
