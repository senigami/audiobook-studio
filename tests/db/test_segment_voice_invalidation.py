"""
Tests for B1: voice/speaker change must invalidate audio and delete the on-disk file.

Covers both code paths:
  - update_segment (direct single-segment path)
  - save_script_assignments (bulk SQL path used by the Script View)

R1 requirement: these tests must FAIL on the pre-fix code (i.e. with the
save_script_assignments file-deletion gap present).
"""
from __future__ import annotations
import os
import time

import pytest

from app.db.core import get_connection
from app.db.projects import create_project
from app.db.chapters import create_chapter
from app.db.segments import update_segment, get_chapter_segments
from app.domain.chapters.operations import save_script_assignments
from app.storage.manager import get_storage_manager


def _create_project_chapter_segment(text: str = "Hello world.") -> tuple[str, str, str]:
    """Helper: create a project, chapter (with one segment), return (pid, cid, sid)."""
    pid = create_project("Test Project")
    cid = create_chapter(pid, "Chapter 1", text_content=text)
    segs = get_chapter_segments(cid)
    assert segs, "sync_chapter_segments must produce at least one segment"
    sid = segs[0]["id"]
    return pid, cid, sid


def _write_fake_audio(pid: str, cid: str, sid: str) -> str:
    """
    Write a dummy WAV file at the expected segment audio path.
    Returns the filename (basename, as stored in audio_file_path).
    """
    storage = get_storage_manager()
    ctx = storage.get_project_context(pid)
    chapter_dir = ctx.get_chapter_dir(cid)
    seg_dir = chapter_dir / "segments"
    seg_dir.mkdir(parents=True, exist_ok=True)

    audio_filename = f"{sid}.wav"
    audio_path = seg_dir / audio_filename
    audio_path.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")  # minimal fake WAV header

    return audio_filename


def _set_segment_done(sid: str, audio_filename: str) -> None:
    """Directly update the DB row to simulate a completed render."""
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE chapter_segments
            SET audio_status = 'done',
                audio_file_path = ?,
                audio_generated_at = ?
            WHERE id = ?
            """,
            (audio_filename, time.time(), sid),
        )
        conn.commit()


def _segment_row(sid: str) -> dict:
    """Fetch the current chapter_segments row for the given id."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT audio_status, audio_file_path, audio_generated_at FROM chapter_segments WHERE id = ?",
            (sid,),
        ).fetchone()
    assert row is not None, f"Segment {sid!r} not found"
    return dict(row)


def _audio_file_path(pid: str, cid: str, filename: str) -> str:
    """Return the absolute path for a segment audio filename."""
    storage = get_storage_manager()
    ctx = storage.get_project_context(pid)
    chapter_dir = ctx.get_chapter_dir(cid)
    return str(chapter_dir / "segments" / filename)


# ---------------------------------------------------------------------------
# Test 1 — save_script_assignments path (Script View / bulk SQL)
# ---------------------------------------------------------------------------

def test_save_script_assignments_speaker_change_deletes_audio_file(clean_storage):
    """
    Changing speaker_profile_name via save_script_assignments must delete the
    on-disk audio file AND reset the DB audio fields.

    This exercises the bulk SQL path that does NOT call update_segment.
    """
    pid, cid, sid = _create_project_chapter_segment("Narrator speaks here.")

    # Simulate a completed render: write a real file and mark the row done.
    audio_filename = _write_fake_audio(pid, cid, sid)
    _set_segment_done(sid, audio_filename)

    old_path = _audio_file_path(pid, cid, audio_filename)
    assert os.path.exists(old_path), "Pre-condition: audio file must exist before the test"

    row_before = _segment_row(sid)
    assert row_before["audio_status"] == "done"
    assert row_before["audio_file_path"] == audio_filename

    # Change speaker via the same path the UI uses (Script View assignment).
    save_script_assignments(
        cid,
        assignments=[
            {
                "character_id": None,
                "speaker_profile_name": "Dracula - Dramatic",
                "span_ids": [sid],
            }
        ],
    )

    # DB assertions
    row_after = _segment_row(sid)
    assert row_after["audio_status"] == "unprocessed", (
        f"Expected 'unprocessed' after speaker change, got {row_after['audio_status']!r}"
    )
    assert row_after["audio_file_path"] is None, (
        f"Expected audio_file_path=None after speaker change, got {row_after['audio_file_path']!r}"
    )
    assert row_after["audio_generated_at"] is None, (
        "Expected audio_generated_at=None after speaker change"
    )

    # Filesystem assertion — this is the key B1 regression check.
    assert not os.path.exists(old_path), (
        f"Stale audio file still exists on disk after speaker change: {old_path}"
    )


# ---------------------------------------------------------------------------
# Test 2 — update_segment path (direct single-segment API)
# ---------------------------------------------------------------------------

def test_update_segment_character_id_change_deletes_audio_file(clean_storage):
    """
    Changing character_id via update_segment (no audio_status in the payload)
    must delete the on-disk audio file AND reset the DB audio fields.
    """
    pid, cid, sid = _create_project_chapter_segment("Dracula speaks ominously.")

    audio_filename = _write_fake_audio(pid, cid, sid)
    _set_segment_done(sid, audio_filename)

    old_path = _audio_file_path(pid, cid, audio_filename)
    assert os.path.exists(old_path), "Pre-condition: audio file must exist before the test"

    row_before = _segment_row(sid)
    assert row_before["audio_status"] == "done"

    # Change character_id without including audio_status in the update.
    import uuid
    new_char_id = str(uuid.uuid4())
    changed = update_segment(sid, broadcast=False, character_id=new_char_id)
    assert changed, "update_segment should report that the row changed"

    row_after = _segment_row(sid)
    assert row_after["audio_status"] == "unprocessed", (
        f"Expected 'unprocessed' after character_id change, got {row_after['audio_status']!r}"
    )
    assert row_after["audio_file_path"] is None, (
        f"Expected audio_file_path=None after character_id change, got {row_after['audio_file_path']!r}"
    )
    assert row_after["audio_generated_at"] is None, (
        "Expected audio_generated_at=None after character_id change"
    )

    assert not os.path.exists(old_path), (
        f"Stale audio file still exists on disk after character_id change: {old_path}"
    )


# ---------------------------------------------------------------------------
# Test 3 — no-op assignment must NOT delete audio
# ---------------------------------------------------------------------------

def test_save_script_assignments_noop_preserves_audio_file(clean_storage):
    """
    Re-assigning the same character + profile to a segment must NOT delete the
    audio file or reset the DB row.  (Matches the SQL CASE guard.)
    """
    pid, cid, sid = _create_project_chapter_segment("Same voice, no change.")

    audio_filename = _write_fake_audio(pid, cid, sid)
    _set_segment_done(sid, audio_filename)

    # Assign a voice first time so the row has character_id / speaker_profile_name set.
    save_script_assignments(
        cid,
        assignments=[
            {
                "character_id": None,
                "speaker_profile_name": "Narrator - Calm",
                "span_ids": [sid],
            }
        ],
    )
    # Now mark done again (the first assignment reset to unprocessed as expected —
    # that is fine because no audio existed for that voice yet, but we need to
    # simulate a done state with the profile already set).
    audio_filename2 = _write_fake_audio(pid, cid, sid)
    _set_segment_done(sid, audio_filename2)
    old_path2 = _audio_file_path(pid, cid, audio_filename2)
    assert os.path.exists(old_path2)

    # Re-apply the SAME assignment (no-op).
    save_script_assignments(
        cid,
        assignments=[
            {
                "character_id": None,
                "speaker_profile_name": "Narrator - Calm",
                "span_ids": [sid],
            }
        ],
    )

    row_after = _segment_row(sid)
    assert row_after["audio_status"] == "done", (
        "No-op assignment must not reset audio_status"
    )
    assert os.path.exists(old_path2), (
        "No-op assignment must not delete the audio file"
    )
