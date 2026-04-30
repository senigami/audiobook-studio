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

    with patch("app.config.PROJECTS_DIR", tmp_path), \
         patch("app.config.get_project_audio_dir", return_value=tmp_path), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(tmp_path)):
        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)
        sid1 = segs[0]["id"]
        sid2 = segs[1]["id"]

        chapter_wav = tmp_path / f"{cid}.wav"
        seg1_wav = tmp_path / f"seg_{sid1}.wav"
        seg2_wav = tmp_path / f"seg_{sid2}.wav"
        chapter_wav.write_text("chapter")
        seg1_wav.write_text("seg1")
        seg2_wav.write_text("seg2")

        update_segment(sid1, audio_status="done", audio_file_path=seg1_wav.name, audio_generated_at=111.0)
        update_segment(sid2, audio_status="done", audio_file_path=seg2_wav.name, audio_generated_at=112.0)
        update_chapter(cid, audio_status="done", audio_file_path=f"{cid}.wav", audio_generated_at=123.0)
        update_chapter(cid, text_content="One. Three.")

        assert chapter_wav.exists()
        assert seg1_wav.exists()
        assert not seg2_wav.exists()

        chapter = get_chapter(cid)
        assert chapter["audio_status"] == "unprocessed"
        assert chapter["audio_file_path"] == f"{cid}.wav"
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

    with patch("app.config.PROJECTS_DIR", tmp_path), \
         patch("app.config.get_project_audio_dir", return_value=tmp_path), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(tmp_path)):
        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)
        sid1 = segs[0]["id"]
        sid2 = segs[1]["id"]

        seg1_wav = tmp_path / f"seg_{sid1}.wav"
        seg2_wav = tmp_path / f"seg_{sid2}.wav"
        seg1_wav.write_text("seg1")
        seg2_wav.write_text("seg2")

        from app.db import update_segment
        update_segment(sid1, audio_status="done", audio_file_path=seg1_wav.name, audio_generated_at=123.0)
        update_segment(sid2, audio_status="done", audio_file_path=seg2_wav.name, audio_generated_at=124.0)

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

    with patch("app.config.PROJECTS_DIR", tmp_path), \
         patch("app.config.get_project_audio_dir", return_value=tmp_path), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(tmp_path)):
        sync_chapter_segments(cid, "Repeat. Middle. Repeat.")
        segs = get_chapter_segments(cid)
        first_id, middle_id, last_id = [s["id"] for s in segs]

        first_file = tmp_path / f"seg_{first_id}.wav"
        middle_file = tmp_path / f"seg_{middle_id}.wav"
        last_file = tmp_path / f"seg_{last_id}.wav"
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

    with patch("app.config.PROJECTS_DIR", tmp_path), \
         patch("app.config.get_project_audio_dir", return_value=tmp_path), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(tmp_path)):
        sync_chapter_segments(cid, "Alpha. Bravo. Charlie. Delta.")
        segs = get_chapter_segments(cid)
        sid1, sid2, sid3, sid4 = [s["id"] for s in segs]

        file1 = tmp_path / f"seg_{sid1}.wav"
        file2 = tmp_path / f"seg_{sid2}.wav"
        file3 = tmp_path / f"seg_{sid3}.wav"
        file4 = tmp_path / f"seg_{sid4}.wav"
        file1.write_text("one")
        file2.write_text("two")
        file3.write_text("three")
        file4.write_text("four")

        update_segment(sid1, audio_status="done", audio_file_path=file1.name, audio_generated_at=1.0)
        update_segment(sid2, audio_status="done", audio_file_path=file2.name, audio_generated_at=2.0)
        update_segment(sid3, audio_status="done", audio_file_path=file3.name, audio_generated_at=3.0)
        update_segment(sid4, audio_status="done", audio_file_path=file4.name, audio_generated_at=4.0)

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

def test_sync_chapter_segments_invalidates_preserved_rows_that_shared_a_chunk_with_a_changed_segment(db_conn, tmp_path):
    from app.db.segments import sync_chapter_segments, get_chapter_segments
    from app.db import update_segment

    pid = create_project("P7", "/tmp")
    cid = create_chapter(pid, "C7", "Alpha. Bravo. Charlie.")

    with patch("app.config.PROJECTS_DIR", tmp_path), \
         patch("app.config.get_project_audio_dir", return_value=tmp_path), \
         patch("app.config.find_existing_project_subdir", side_effect=_existing_project_audio_dir(tmp_path)):
        sync_chapter_segments(cid, "Alpha. Bravo. Charlie.")
        segs = get_chapter_segments(cid)
        sid1, sid2, sid3 = [s["id"] for s in segs]

        shared_chunk = tmp_path / f"chunk_{sid1}.wav"
        final_file = tmp_path / f"seg_{sid3}.wav"
        shared_chunk.write_text("alpha bravo")
        final_file.write_text("charlie")

        update_segment(sid1, audio_status="done", audio_file_path=shared_chunk.name, audio_generated_at=1.0)
        update_segment(sid2, audio_status="done", audio_file_path=shared_chunk.name, audio_generated_at=1.0)
        update_segment(sid3, audio_status="done", audio_file_path=final_file.name, audio_generated_at=2.0)

        sync_chapter_segments(cid, "Alpha changed. Bravo. Charlie.")
        refreshed = get_chapter_segments(cid)

        assert refreshed[0]["audio_status"] == "unprocessed"
        assert refreshed[0]["audio_file_path"] is None
        assert refreshed[1]["audio_status"] == "unprocessed"
        assert refreshed[1]["audio_file_path"] is None
        assert refreshed[2]["audio_status"] == "done"
        assert refreshed[2]["audio_file_path"] == final_file.name

        assert not shared_chunk.exists()
        assert final_file.exists()
