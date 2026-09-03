"""#232 Task 005b: new rows from unmatched fresh sentences must be grouped at
insertion time (row-creation-time grouping), never inserted one row per
sentence -- otherwise the render path assigns two DISTINCT rows the SAME
``audio_file_path``, which crashes on Task 005's ``ux_seg_audio_file`` unique
index the first time a user edits text and re-renders (frontier-tier finding
C1). See ~/.claude/plans/audiobook-factory/segment-render-block-redesign/
tasks/005b-render-block-grain-dispatch.md.
"""
import sqlite3

import pytest

from app.db.chapters import create_chapter
from app.db.projects import create_project
from app.db.segments import sync_chapter_segments, get_chapter_segments, write_back_segment_audio_guarded


def test_new_unmatched_sentences_are_grouped_not_one_row_per_sentence(db_conn):
    """Short NEW content (an edit adding sentences to an already-synced
    chapter) spanning 2+ sentences under the same (default, None) character/
    profile collapses into exactly ONE new row when the combined length is
    under the engine's chunk limit.

    Scoped to an edit of already-existing content, not a chapter's first-ever
    import: a virgin import's sentences are all uncast (character_id/
    speaker_profile_name both None) and must stay one-row-per-sentence so the
    editor's per-sentence casting workflow still has something to cast --
    grouping only fires once there is at least one prior row (see
    app/db/segments.py's ``should_group_new_rows`` for the full rationale).
    """
    pid = create_project("P232-005b-a", "/tmp")
    cid = create_chapter(pid, "C232-005b-a", "Intro sentence.")

    sync_chapter_segments(cid, "Intro sentence.")
    sync_chapter_segments(cid, "Intro sentence. Hello there. Short second one.")

    segs = get_chapter_segments(cid)
    assert len(segs) == 2, f"expected the intro row plus one grouped new row, got {len(segs)}: {segs}"
    assert segs[1]["text_content"] == "Hello there. Short second one."


def test_new_unmatched_sentences_split_when_over_chunk_limit(db_conn):
    """Once the combined new content exceeds the (default 500-char) chunk
    limit, row-creation-time grouping must still split into multiple rows --
    grouping must never silently drop the chunk-limit bound."""
    pid = create_project("P232-005b-b", "/tmp")
    cid = create_chapter(pid, "C232-005b-b", "")

    long_a = ("Alpha sentence padded out long enough to matter. " * 6).strip()
    long_b = ("Beta sentence also padded out long enough to matter. " * 6).strip()
    assert len(long_a) + len(long_b) > 500

    sync_chapter_segments(cid, f"{long_a} {long_b}")

    segs = get_chapter_segments(cid)
    assert len(segs) >= 2, f"expected the chunk limit to force a split, got {len(segs)}: {segs}"


def test_edit_then_render_does_not_crash_on_ux_seg_audio_file(db_conn, tmp_path, monkeypatch):
    """The exact frontier-tier crash repro: an edit that adds new content
    spanning 2+ sentences under the same cast, resynced, then rendered via
    the real script-building seam (generation_shared.py's
    ``_build_script_for_chapter``) -- assert every resulting script entry
    gets a DISTINCT ``save_path``/filename, and that applying the guarded
    write-back for each entry never raises ``sqlite3.IntegrityError`` against
    the ``ux_seg_audio_file`` unique index.
    """
    from unittest.mock import patch
    from app.api.routers.generation_shared import _build_script_for_chapter
    from app.core.boot import run_schema_migrations

    # tests/db/conftest.py's local `db_conn` fixture points DB_PATH at a
    # fresh, un-migrated database (it only calls init_db(), unlike the root
    # conftest's autouse fixture) -- apply the #232 migrations explicitly so
    # write_back_segment_audio_guarded's text_hash column and the
    # ux_seg_audio_file unique index this test exists to exercise are live.
    run_schema_migrations()

    pid = create_project("P232-005b-c", "/tmp")
    cid = create_chapter(pid, "C232-005b-c", "First sentence.")

    with patch("app.core.config.PROJECTS_DIR", tmp_path):
        from app.core.config import get_chapter_dir

        # The edit: append new content that would, pre-fix, land as two
        # separate new sentence-grain rows sharing the same
        # character/profile/engine -- Task 002's Shape A end state.
        sync_chapter_segments(cid, "First sentence. New one. New two.")

        c_dir = get_chapter_dir(pid, cid)
        (c_dir / "segments").mkdir(parents=True, exist_ok=True)

        script = _build_script_for_chapter(cid, pid, default_profile=None, safe_mode=False)

        save_paths = [entry["save_path"] for entry in script]
        assert len(save_paths) == len(set(save_paths)), (
            f"two script entries share a save_path -- would crash the write-back "
            f"on ux_seg_audio_file: {save_paths}"
        )

        # Apply the guarded write-back for every entry, exactly as a real
        # completed render would -- this is the statement that raised
        # sqlite3.IntegrityError pre-fix.
        for entry in script:
            filename = entry["save_path"].rsplit("/", 1)[-1]
            result = write_back_segment_audio_guarded(entry["fingerprints"], filename, cid)
            assert result["stale"] == [], f"unexpected stale write-back: {result}"

        segs_after = get_chapter_segments(cid)
        done_paths = [s["audio_file_path"] for s in segs_after if s["audio_status"] == "done"]
        assert len(done_paths) == len(set(done_paths)), (
            f"two rows ended up sharing one audio_file_path post-write-back: {done_paths}"
        )
