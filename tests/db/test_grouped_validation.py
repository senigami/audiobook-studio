import pytest
from pathlib import Path
from unittest.mock import patch
from app.db.chapters import create_chapter, update_chapter
from app.db.projects import create_project
from app.db.segments import sync_chapter_segments, get_chapter_segments, update_segment
from app.core.config import get_chapter_dir

def test_grouped_segments_validation_regression(db_conn, tmp_path):
    # Setup project and chapter
    pid = create_project("P_GROUP", "/tmp")
    cid = create_chapter(pid, "C_GROUP", "One. Two.")

    with patch("app.core.config.PROJECTS_DIR", tmp_path), \
         patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts"):
        chapter_dir = get_chapter_dir(pid, cid)

        chapter_dir.mkdir(parents=True, exist_ok=True)
        seg_dir = chapter_dir / "segments"
        seg_dir.mkdir(exist_ok=True)

        sync_chapter_segments(cid, "One. Two.")
        segs = get_chapter_segments(cid)
        sid1, sid2 = segs[0]["id"], segs[1]["id"]

        # Scenario: sid1 and sid2 are in the same group.
        # They share sid1.wav.
        shared_wav = seg_dir / f"{sid1}.wav"
        shared_wav.write_text("one two")

        update_segment(sid1, audio_status="done", audio_file_path=shared_wav.name)
        update_segment(sid2, audio_status="done", audio_file_path=shared_wav.name)

        # Verify both are done
        refreshed = get_chapter_segments(cid)
        assert refreshed[0]["audio_status"] == "done"
        assert refreshed[1]["audio_status"] == "done"

        # NOW: Change sid2 so it's no longer in the same group as sid1.
        # We can change its character or speaker profile.
        from app.db.characters import create_character
        char_id = create_character(pid, "Other")
        update_segment(sid2, character_id=char_id)

        # Ensure the file exists to specifically test group-aware validation
        if not shared_wav.exists():
            shared_wav.write_text("recreated")

        # Now get_chapter_segments should invalidate sid2 because it's no longer in sid1's group,
        # and sid1.wav is no longer its canonical name.
        refreshed_after = get_chapter_segments(cid)

        assert refreshed_after[0]["audio_status"] == "done", "sid1 should stay done"
        assert refreshed_after[0]["audio_file_path"] == shared_wav.name

        assert refreshed_after[1]["audio_status"] == "unprocessed", "sid2 should be invalidated"
        assert refreshed_after[1]["audio_file_path"] is None

def test_segments_in_root_are_invalidated(db_conn, tmp_path):
    # Setup project and chapter
    pid = create_project("P_ROOT", "/tmp")
    cid = create_chapter(pid, "C_ROOT", "One.")

    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        chapter_dir = get_chapter_dir(pid, cid)
        chapter_dir.mkdir(parents=True, exist_ok=True)

        sync_chapter_segments(cid, "One.")
        segs = get_chapter_segments(cid)
        sid = segs[0]["id"]

        # Put file in root instead of segments/
        root_wav = chapter_dir / f"{sid}.wav"
        root_wav.write_text("root")

        update_segment(sid, audio_status="done", audio_file_path=root_wav.name)

        # Verify it is invalidated because it's not in segments/
        refreshed = get_chapter_segments(cid)
        assert refreshed[0]["audio_status"] == "unprocessed"
        assert refreshed[0]["audio_file_path"] is None

def test_update_segment_preserves_audio_when_marked_done_with_metadata_change(db_conn, tmp_path):
    # Setup
    pid = create_project("P_SUICIDE", "/tmp")
    cid = create_chapter(pid, "C_SUICIDE", "One.")

    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        chapter_dir = get_chapter_dir(pid, cid)
        chapter_dir.mkdir(parents=True, exist_ok=True)
        seg_dir = chapter_dir / "segments"
        seg_dir.mkdir(exist_ok=True)

        sync_chapter_segments(cid, "One.")
        segs = get_chapter_segments(cid)
        sid = segs[0]["id"]

        wav_file = seg_dir / f"{sid}.wav"
        wav_file.write_text("audio content")

        # Initial mark as done
        update_segment(sid, audio_status="done", audio_file_path=wav_file.name)
        assert wav_file.exists()

        # Mark as done AGAIN while also changing character_id.
        # This used to trigger 'suicide cleanup' because stale_audio_path was set to wav_file.name
        # and cleanup_chapter_audio_files would delete it.
        from app.db.characters import create_character
        char_id = create_character(pid, "NewChar")

        update_segment(sid, audio_status="done", audio_file_path=wav_file.name, character_id=char_id)

        assert wav_file.exists(), "Audio file should NOT have been deleted by suicide cleanup"

        refreshed = get_chapter_segments(cid)
        # It should stay done because it's still the canonical name for its (new) group
        # (since it's a single segment group, canonical is always sid.wav)
        assert refreshed[0]["audio_status"] == "done"
