"""
Tests for get_resync_preview (RC-1 fix, Task 5) -- the preview must use the SAME
align_segments alignment as the real sync_chapter_segments, so it can't warn about a
destructive resync that the real save will actually preserve (Petra's Task 4 code
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
    """The exact scenario Petra's Task 4 review reproduced as a live bug: a uniquely-
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
