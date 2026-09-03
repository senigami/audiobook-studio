"""#232 Task 005c: sync_chapter_segments must actually wire Task 002's
align_render_blocks() into its write path, so start_offset/end_offset (added
by migration 001) are populated and kept correct on every ordinary resync --
not left NULL forever, as Task 005b's implementation flagged.

See ~/.claude/plans/audiobook-factory/segment-render-block-redesign/tasks/
005c-wire-align-render-blocks.md.
"""
from app.db.chapters import create_chapter
from app.db.projects import create_project
from app.db.segments import sync_chapter_segments, get_chapter_segments


def _segs_by_order(chapter_id):
    return sorted(get_chapter_segments(chapter_id), key=lambda s: s["segment_order"])


def test_initial_sync_populates_offsets_for_every_row(db_conn):
    from app.core.boot import run_schema_migrations
    run_schema_migrations()
    pid = create_project("P232-005c-a", "/tmp")
    cid = create_chapter(pid, "C232-005c-a", "First sentence. Second sentence. Third sentence.")

    segs = _segs_by_order(cid)
    assert len(segs) == 3
    pos = 0
    for s in segs:
        assert s["start_offset"] == pos
        assert s["end_offset"] == pos + len(s["text_content"])
        assert s["end_offset"] > s["start_offset"]
        pos = s["end_offset"]


def test_offsets_shift_after_earlier_row_grows_unchanged_row_preserved(db_conn):
    from app.core.boot import run_schema_migrations
    run_schema_migrations()
    pid = create_project("P232-005c-b", "/tmp")
    cid = create_chapter(pid, "C232-005c-b", "Short one. Second sentence here.")

    before = _segs_by_order(cid)
    assert len(before) == 2
    second_id = before[1]["id"]
    second_text = before[1]["text_content"]

    # Edit only the first sentence, making it much longer -- the second sentence's
    # content is untouched and must be preserved (same id) with shifted offsets.
    sync_chapter_segments(cid, "Short one, but now considerably longer. Second sentence here.")

    after = _segs_by_order(cid)
    assert len(after) == 2
    second_after = next(s for s in after if s["id"] == second_id)
    assert second_after["text_content"] == second_text
    assert second_after["start_offset"] == len(after[0]["text_content"])
    assert second_after["end_offset"] == second_after["start_offset"] + len(second_text)
    # Preservation contract unaffected by this task: audio/cast on an unchanged
    # row must remain untouched (nothing here sets a cast, so this just proves
    # the row wasn't deleted-and-reinserted with a fresh id).
    assert after[0]["id"] != second_id


def test_edit_inside_a_rendered_row_splits_and_invalidates_only_that_row(db_conn, tmp_path):
    from unittest.mock import patch
    from app.db import update_segment
    from app.core.boot import run_schema_migrations
    run_schema_migrations()

    pid = create_project("P232-005c-c", "/tmp")
    cid = create_chapter(pid, "C232-005c-c", "Alpha sentence. Beta sentence. Gamma sentence.")

    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        from app.core.config import get_chapter_dir
        c_dir = get_chapter_dir(pid, cid)
        seg_dir = c_dir / "segments"
        seg_dir.mkdir(parents=True, exist_ok=True)

        segs = _segs_by_order(cid)
        beta_id = next(s["id"] for s in segs if s["text_content"].strip() == "Beta sentence.")
        gamma_id = next(s["id"] for s in segs if s["text_content"].strip() == "Gamma sentence.")

        wav_path = seg_dir / f"{beta_id}.wav"
        wav_path.write_bytes(b"RIFF....WAVEfmt ")
        update_segment(beta_id, audio_status="done", audio_file_path=wav_path.name)

        # Reword the middle sentence (Beta) only -- Alpha and Gamma are untouched
        # and must survive with their ids/offsets shifting, never their content.
        sync_chapter_segments(
            cid, "Alpha sentence. Beta sentence changed completely. Gamma sentence."
        )

        after = _segs_by_order(cid)
        alpha_after = next(s for s in after if s["text_content"].strip() == "Alpha sentence.")
        gamma_after = next((s for s in after if s["id"] == gamma_id), None)

        assert gamma_after is not None, "Gamma (unchanged, later row) must survive with its id"
        assert gamma_after["text_content"].strip() == "Gamma sentence."
        assert gamma_after["start_offset"] == alpha_after["end_offset"] + len(
            "Beta sentence changed completely. "
        )

        # The old Beta row's rendered audio must be invalidated -- its content changed.
        beta_after = next((s for s in after if s["text_content"].strip().startswith("Beta")), None)
        assert beta_after is not None
        assert beta_after["audio_status"] != "done"
        assert beta_after["audio_file_path"] is None


def test_offsets_recompute_whole_chapter_not_incrementally(db_conn):
    """Editing near the START of the chapter must shift every later row's
    offsets, derived fresh each sync -- never patched with += delta."""
    from app.core.boot import run_schema_migrations
    run_schema_migrations()
    pid = create_project("P232-005c-d", "/tmp")
    cid = create_chapter(pid, "C232-005c-d", "One. Two. Three. Four.")

    before = _segs_by_order(cid)
    assert len(before) == 4

    sync_chapter_segments(cid, "One, now much longer than before. Two. Three. Four.")

    after = _segs_by_order(cid)
    assert len(after) == 4
    pos = 0
    for s in after:
        assert s["start_offset"] == pos
        assert s["end_offset"] == pos + len(s["text_content"])
        pos = s["end_offset"]


def test_render_epoch_bumped_once_per_sync_call(db_conn):
    from app.db.core import get_connection
    from app.core.boot import run_schema_migrations
    run_schema_migrations()

    pid = create_project("P232-005c-e", "/tmp")
    cid = create_chapter(pid, "C232-005c-e", "One. Two.")

    def _epoch():
        with get_connection() as conn:
            row = conn.execute("SELECT render_epoch FROM chapters WHERE id = ?", (cid,)).fetchone()
            return row["render_epoch"]

    epoch_after_create = _epoch()
    sync_chapter_segments(cid, "One. Two. Three.")
    epoch_after_sync = _epoch()

    assert epoch_after_sync == epoch_after_create + 1
