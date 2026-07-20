"""
Tests for get_resync_preview (RC-1 fix, Task 5) -- the preview must use the SAME
align_segments alignment as the real sync_chapter_segments, so it can't warn about a
destructive resync that the real save will actually preserve (Tamsin's Task 4 code
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
    """The exact scenario Tamsin's Task 4 review reproduced as a live bug: a uniquely-
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
    """Regression for a bug both Fable and Esther's code reviews independently found:
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

    # 4 existing rows (3 fragments + 1 whole) -> 2 fresh sentences: total_new < total_old,
    # but nothing is actually lost -- all 3 fragments and the second sentence are unchanged.
    preview = get_resync_preview(cid, "The quick fox. Second sentence.")

    assert preview["total_segments_before"] == 4
    assert preview["total_segments_after"] == 2
    assert preview["lost_assignments_count"] == 0
    assert preview["is_destructive"] is False
