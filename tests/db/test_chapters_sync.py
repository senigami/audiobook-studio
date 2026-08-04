import pytest
from pathlib import Path
from unittest.mock import patch
from app.db.chapters import create_chapter, get_chapter, update_chapter
from app.db.projects import create_project

def _existing_project_audio_dir(path: Path):
    return lambda _project_id, dirname: Path(path) if dirname == "audio" else None

def test_update_chapter_text_change_preserves_stale_chapter_audio_until_rebuild(db_conn, tmp_path):
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db import update_segment

    pid = create_project("P6", "/tmp")
    cid = create_chapter(pid, "C6", "One. Two.")

    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        from app.core.config import get_chapter_dir
        c_dir = get_chapter_dir(pid, cid)
        c_dir.mkdir(parents=True, exist_ok=True)
        seg_dir = c_dir / "segments"
        seg_dir.mkdir(exist_ok=True)
        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)
        sid1 = segs[0]["id"]
        sid2 = segs[1]["id"]

        chapter_wav = c_dir / "chapter.wav"
        seg1_wav = seg_dir / f"{sid1}.wav"
        seg2_wav = seg_dir / f"{sid2}.wav"
        chapter_wav.write_text("chapter")
        seg1_wav.write_text("seg1")
        seg2_wav.write_text("seg2")

        update_segment(sid1, audio_status="done", audio_file_path=seg1_wav.name, audio_generated_at=111.0)
        update_segment(sid2, audio_status="done", audio_file_path=seg2_wav.name, audio_generated_at=112.0)
        update_chapter(cid, audio_status="done", audio_file_path="chapter.wav", audio_generated_at=123.0)
        update_chapter(cid, text_content="One. Three.")

        assert chapter_wav.exists()
        assert seg1_wav.exists()
        assert not seg2_wav.exists()

        chapter = get_chapter(cid)
        assert chapter["audio_status"] == "unprocessed"
        assert chapter["audio_file_path"] == "chapter.wav"
        assert chapter["audio_generated_at"] == 123.0
        assert chapter["has_wav"] is True

        segs_after = get_chapter_segments(cid)
        assert len(segs_after) == 2
        assert segs_after[0]["audio_status"] == "done"
        assert segs_after[0]["audio_file_path"] == seg1_wav.name
        assert segs_after[1]["audio_status"] == "unprocessed"
        assert segs_after[1]["audio_file_path"] is None

def test_sync_chapter_segments_preserves_rendered_file_links(db_conn, tmp_path):
    from app.db.segments import sync_chapter_segments, get_chapter_segments

    pid = create_project("P4", "/tmp")
    cid = create_chapter(pid, "C4", "One. Two.")

    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        from app.core.config import get_chapter_dir
        c_dir = get_chapter_dir(pid, cid)
        c_dir.mkdir(parents=True, exist_ok=True)
        seg_dir = c_dir / "segments"
        seg_dir.mkdir(exist_ok=True)
        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)
        sid1 = segs[0]["id"]
        sid2 = segs[1]["id"]

        seg1_wav = seg_dir / f"{sid1}.wav"
        seg2_wav = seg_dir / f"{sid2}.wav"
        seg1_wav.write_text("seg1")
        seg2_wav.write_text("seg2")

        from app.db import update_segment
        from app.db.characters import create_character
        char2 = create_character(pid, "Char2")
        update_segment(sid1, audio_status="done", audio_file_path=seg1_wav.name, audio_generated_at=123.0)
        update_segment(sid2, audio_status="done", audio_file_path=seg2_wav.name, audio_generated_at=124.0, character_id=char2)

        sync_chapter_segments(cid, "One. Two.")
        refreshed = get_chapter_segments(cid)
        assert refreshed[0]["audio_status"] == "done"
        assert refreshed[0]["audio_file_path"] == seg1_wav.name
        assert refreshed[0]["audio_generated_at"] == 123.0
        assert refreshed[1]["audio_status"] == "done"
        assert refreshed[1]["audio_file_path"] == seg2_wav.name
        assert refreshed[1]["audio_generated_at"] == 124.0

def test_sync_chapter_segments_does_not_cross_match_reordered_duplicates(db_conn, tmp_path):
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db import update_segment

    pid = create_project("P5", "/tmp")
    cid = create_chapter(pid, "C5", "Repeat. Middle. Repeat.")

    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        from app.core.config import get_chapter_dir
        c_dir = get_chapter_dir(pid, cid)
        c_dir.mkdir(parents=True, exist_ok=True)
        seg_dir = c_dir / "segments"
        seg_dir.mkdir(exist_ok=True)
        sync_chapter_segments(cid, "Repeat. Middle. Repeat.")
        segs = get_chapter_segments(cid)
        first_id, middle_id, last_id = [s["id"] for s in segs]

        first_file = seg_dir / f"{first_id}.wav"
        middle_file = seg_dir / f"{middle_id}.wav"
        last_file = seg_dir / f"{last_id}.wav"
        first_file.write_text("first")
        middle_file.write_text("middle")
        last_file.write_text("last")

        update_segment(first_id, audio_status="done", audio_file_path=first_file.name, audio_generated_at=1.0)
        update_segment(middle_id, audio_status="done", audio_file_path=middle_file.name, audio_generated_at=2.0)
        update_segment(last_id, audio_status="done", audio_file_path=last_file.name, audio_generated_at=3.0)

        sync_chapter_segments(cid, "Repeat. Repeat. Middle.")
        refreshed = get_chapter_segments(cid)

        assert refreshed[0]["text_content"].strip() == "Repeat."
        assert refreshed[0]["audio_status"] == "done"
        assert refreshed[0]["audio_file_path"] == first_file.name
        assert refreshed[1]["text_content"].strip() == "Repeat."
        assert refreshed[1]["audio_status"] == "unprocessed"
        assert refreshed[1]["audio_file_path"] is None
        assert refreshed[2]["text_content"].strip() == "Middle."
        assert refreshed[2]["audio_status"] == "unprocessed"
        assert refreshed[2]["audio_file_path"] is None

def test_sync_chapter_segments_preserves_unchanged_trailing_segments_after_local_edit(db_conn, tmp_path):
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db import update_segment

    pid = create_project("P6", "/tmp")
    cid = create_chapter(pid, "C6", "Alpha. Bravo. Charlie. Delta.")

    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        from app.core.config import get_chapter_dir
        c_dir = get_chapter_dir(pid, cid)
        c_dir.mkdir(parents=True, exist_ok=True)
        seg_dir = c_dir / "segments"
        seg_dir.mkdir(exist_ok=True)
        sync_chapter_segments(cid, "Alpha. Bravo. Charlie. Delta.")
        segs = get_chapter_segments(cid)
        sid1, sid2, sid3, sid4 = [s["id"] for s in segs]

        file1 = seg_dir / f"{sid1}.wav"
        file2 = seg_dir / f"{sid2}.wav"
        file3 = seg_dir / f"{sid3}.wav"
        file4 = seg_dir / f"{sid4}.wav"
        file1.write_text("one")
        file2.write_text("two")
        file3.write_text("three")
        file4.write_text("four")

        from app.db.characters import create_character
        c1 = create_character(pid, "C1")
        c2 = create_character(pid, "C2")
        c3 = create_character(pid, "C3")
        c4 = create_character(pid, "C4")
        update_segment(sid1, audio_status="done", audio_file_path=file1.name, audio_generated_at=1.0, character_id=c1)
        update_segment(sid2, audio_status="done", audio_file_path=file2.name, audio_generated_at=2.0, character_id=c2)
        update_segment(sid3, audio_status="done", audio_file_path=file3.name, audio_generated_at=3.0, character_id=c3)
        update_segment(sid4, audio_status="done", audio_file_path=file4.name, audio_generated_at=4.0, character_id=c4)

        sync_chapter_segments(cid, "Alpha. New Bravo. Charlie. Delta.")
        refreshed = get_chapter_segments(cid)

        assert refreshed[0]["text_content"].strip() == "Alpha."
        assert refreshed[0]["audio_status"] == "done"
        assert refreshed[0]["audio_file_path"] == file1.name

        assert refreshed[1]["text_content"].strip() == "New Bravo."
        assert refreshed[1]["audio_status"] == "unprocessed"
        assert refreshed[1]["audio_file_path"] is None

        assert refreshed[2]["text_content"].strip() == "Charlie."
        assert refreshed[2]["audio_status"] == "done"
        assert refreshed[2]["audio_file_path"] == file3.name

        assert refreshed[3]["text_content"].strip() == "Delta."
        assert refreshed[3]["audio_status"] == "done"
        assert refreshed[3]["audio_file_path"] == file4.name

        assert file1.exists()
        assert not file2.exists()
        assert file3.exists()
        assert file4.exists()

def test_sync_chapter_segments_invalidates_preserved_rows_that_shared_audio_with_a_changed_segment(db_conn, tmp_path):
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db import update_segment

    pid = create_project("P7", "/tmp")
    cid = create_chapter(pid, "C7", "Alpha. Bravo. Charlie.")

    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        from app.core.config import get_chapter_dir
        c_dir = get_chapter_dir(pid, cid)
        c_dir.mkdir(parents=True, exist_ok=True)
        seg_dir = c_dir / "segments"
        seg_dir.mkdir(exist_ok=True)
        sync_chapter_segments(cid, "Alpha. Bravo. Charlie.")
        segs = get_chapter_segments(cid)
        sid1, sid2, sid3 = [s["id"] for s in segs]

        # Use a canonical name for one, and make them share it
        shared_file = seg_dir / f"{sid1}.wav"
        final_file = seg_dir / f"{sid3}.wav"
        shared_file.write_text("alpha bravo")
        final_file.write_text("charlie")

        # Charlie stays separate to keep its canonical file valid
        from app.db.characters import create_character
        char3 = create_character(pid, "Char3")
        update_segment(sid1, audio_status="done", audio_file_path=shared_file.name, audio_generated_at=1.0)
        update_segment(sid2, audio_status="done", audio_file_path=shared_file.name, audio_generated_at=1.0)
        update_segment(sid3, audio_status="done", audio_file_path=final_file.name, audio_generated_at=2.0, character_id=char3)

        # Sync with change to sid1. This should trigger sid1's old file deletion.
        # Since sid2 shared that file, sid2 will also become unprocessed.
        sync_chapter_segments(cid, "Alpha changed. Bravo. Charlie.")
        refreshed = get_chapter_segments(cid)

        assert refreshed[0]["audio_status"] == "unprocessed"
        assert refreshed[0]["audio_file_path"] is None
        assert refreshed[1]["audio_status"] == "unprocessed"
        assert refreshed[1]["audio_file_path"] is None
        assert refreshed[2]["audio_status"] == "done"
        assert refreshed[2]["audio_file_path"] == final_file.name

        assert not shared_file.exists()
        assert final_file.exists()


def test_rc1_fragment_split_survives_unrelated_edit_distinct_characters(db_conn, tmp_path):
    """RC-1 regression, committed (R1): the flagship scenario Task 4 exists to fix -- a
    manually-split sentence, assigned to a DISTINCT character per fragment (so this test
    is not confounded by the chunk-group canonical-audio mechanism, which only merges
    rows sharing the same character_id/profile -- see the Task 4 code review).
    An edit to an UNRELATED sentence elsewhere must leave the split fragments' ids,
    character assignments, and audio completely untouched."""
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db import update_segment
    from app.db.characters import create_character

    pid = create_project("P7", "/tmp")
    cid = create_chapter(pid, "C7", "The quick fox. Second sentence.")

    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        from app.core.config import get_chapter_dir
        c_dir = get_chapter_dir(pid, cid)
        c_dir.mkdir(parents=True, exist_ok=True)
        seg_dir = c_dir / "segments"
        seg_dir.mkdir(exist_ok=True)

        sync_chapter_segments(cid, "The quick fox. Second sentence.")
        segs = get_chapter_segments(cid)
        whole_id = segs[0]["id"]
        second_id = segs[1]["id"]

        # Manually split "The quick fox." into three fragment rows with DISTINCT
        # characters per fragment -- simulates _apply_range_assignment's effect without
        # going through the full API, matching this file's existing direct-DB style.
        char_narrator = create_character(pid, "Narrator")
        char_fox = create_character(pid, "Fox")

        from app.db.core import get_connection
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM chapter_segments WHERE id = ?", (whole_id,))
            cursor.execute(
                """
                INSERT INTO chapter_segments
                    (id, chapter_id, segment_order, text_content, character_id, audio_status)
                VALUES (?, ?, 0, 'The ', ?, 'unprocessed')
                """,
                ("l_frag", cid, char_narrator),
            )
            cursor.execute(
                """
                INSERT INTO chapter_segments
                    (id, chapter_id, segment_order, text_content, character_id, audio_status)
                VALUES (?, ?, 1, 'quick ', ?, 'unprocessed')
                """,
                ("m_frag", cid, char_fox),
            )
            cursor.execute(
                """
                INSERT INTO chapter_segments
                    (id, chapter_id, segment_order, text_content, character_id, audio_status)
                VALUES (?, ?, 2, 'fox. ', ?, 'unprocessed')
                """,
                ("r_frag", cid, char_narrator),
            )
            cursor.execute(
                "UPDATE chapter_segments SET segment_order = 3 WHERE id = ?", (second_id,)
            )
            conn.commit()

        for seg_id, name in [("l_frag", "l"), ("m_frag", "m"), ("r_frag", "r")]:
            f = seg_dir / f"{seg_id}.wav"
            f.write_text(name)
            update_segment(seg_id, audio_status="done", audio_file_path=f.name, audio_generated_at=1.0)

        # Unrelated edit: only the SECOND sentence changes. The split sentence is untouched.
        sync_chapter_segments(cid, "The quick fox. Edited second sentence.")
        refreshed = {s["id"]: s for s in get_chapter_segments(cid)}

        for seg_id, expected_char in [("l_frag", char_narrator), ("m_frag", char_fox), ("r_frag", char_narrator)]:
            assert seg_id in refreshed, f"{seg_id} was destroyed by the unrelated edit"
            assert refreshed[seg_id]["character_id"] == expected_char
            assert refreshed[seg_id]["audio_status"] == "done"
            assert refreshed[seg_id]["audio_file_path"] == f"{seg_id}.wav"


def test_revision_id_stable_across_a_preserve_only_resave(db_conn, tmp_path):
    """A resave with no edits at all must not churn _build_base_revision_id's hash for
    reasons unrelated to the actual text (Task 4's P6 rationale, the Task 1
    review) -- preserving row ids/order/content, not minting new ids, is what keeps this
    stable."""
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db.chapters import get_chapter
    from app.domain.chapters.helpers import _build_base_revision_id

    pid = create_project("P8", "/tmp")
    cid = create_chapter(pid, "C8", "One. Two. Three.")

    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        from app.core.config import get_chapter_dir
        c_dir = get_chapter_dir(pid, cid)
        c_dir.mkdir(parents=True, exist_ok=True)
        (c_dir / "segments").mkdir(exist_ok=True)

        sync_chapter_segments(cid, "One. Two. Three.")
        chapter = get_chapter(cid)
        segs_before = get_chapter_segments(cid)
        revision_before = _build_base_revision_id(chapter, segs_before)

        # A genuine no-op resave: identical text, nothing edited.
        sync_chapter_segments(cid, "One. Two. Three.")
        chapter_after = get_chapter(cid)
        segs_after = get_chapter_segments(cid)
        revision_after = _build_base_revision_id(chapter_after, segs_after)

        assert revision_before == revision_after
        # Ids must be literally unchanged, not just equal in count -- this is what
        # actually keeps the hash stable.
        assert [s["id"] for s in segs_before] == [s["id"] for s in segs_after]


def test_same_character_duplicate_rows_are_preserved_at_the_db_row_level_despite_chunk_group_confound(db_conn, tmp_path):
    """Proves align_segments' preservation is real at the DB-row level (id, character_id)
    for the same-character-duplicate case, independent of get_chapter_segments' chunk-
    group canonical-audio-file check -- which invalidates the *audio* for a non-leader
    group member regardless of whether the row itself was correctly preserved (the
    Task 4 finding: the existing reordered-duplicates test is confounded for its Middle/
    duplicate-Repeat audio assertions, since that outcome would be identical even if
    preservation were totally broken). This test checks the raw chapter_segments table
    directly, bypassing get_chapter_segments' read-time invalidation, to prove the ROW
    itself -- id and character assignment -- genuinely survives."""
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db.characters import create_character
    from app.db import update_segment

    pid = create_project("P9", "/tmp")
    cid = create_chapter(pid, "C9", "Repeat. Middle. Repeat.")

    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        from app.core.config import get_chapter_dir
        c_dir = get_chapter_dir(pid, cid)
        c_dir.mkdir(parents=True, exist_ok=True)
        (c_dir / "segments").mkdir(exist_ok=True)

        sync_chapter_segments(cid, "Repeat. Middle. Repeat.")
        segs = get_chapter_segments(cid)
        middle_id = segs[1]["id"]

        char_hero = create_character(pid, "Hero")
        update_segment(middle_id, character_id=char_hero)

        sync_chapter_segments(cid, "Repeat. Repeat. Middle.")

        from app.db.core import get_connection
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, character_id FROM chapter_segments WHERE id = ?", (middle_id,)
            )
            row = cursor.fetchone()

        assert row is not None, "Middle's row was destroyed, not just audio-invalidated"
        assert row["character_id"] == char_hero, (
            "Middle's character assignment was lost -- the actual thing RC-1 exists to save"
        )
