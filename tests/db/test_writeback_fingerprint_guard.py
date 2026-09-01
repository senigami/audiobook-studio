"""Tests for the write-back fingerprint guard (#232 Task 003).

Exercises `write_back_segment_audio_guarded` against a real schema built by
`app.db.core.init_db()` + the version-1 migration, so the guard's SQL runs
against the actual `chapter_segments`/`segment_audio_tombstones` shape
(INV-2, INV-3).
"""
import time
import uuid

import pytest

from app.db.core import get_connection, init_db
from app.db.migrations.registry import MIGRATIONS
from app.db.migrations.runner import run_migrations
from app.db.segments import (
    segment_text_hash,
    update_segments_bulk,
    write_back_segment_audio_guarded,
)


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test_writeback_guard.db"
    monkeypatch.setenv("DB_PATH", str(path))
    init_db()
    with get_connection() as conn:
        run_migrations(conn, MIGRATIONS)
    return path


def _seed_segment(conn, *, text="Hello world.", character_id=None, speaker_profile_name=None):
    project_id = str(uuid.uuid4())
    chapter_id = str(uuid.uuid4())
    segment_id = str(uuid.uuid4())
    conn.execute("INSERT INTO projects (id, name) VALUES (?, ?)", (project_id, "P"))
    conn.execute(
        "INSERT INTO chapters (id, project_id, title) VALUES (?, ?, ?)",
        (chapter_id, project_id, "C"),
    )
    conn.execute(
        """
        INSERT INTO chapter_segments
            (id, chapter_id, segment_order, text_content, text_hash,
             character_id, speaker_profile_name, audio_status)
        VALUES (?, ?, 0, ?, ?, ?, ?, 'unprocessed')
        """,
        (segment_id, chapter_id, text, segment_text_hash(text), character_id, speaker_profile_name),
    )
    conn.commit()
    return chapter_id, segment_id


def _fetch_segment(conn, segment_id):
    row = conn.execute(
        "SELECT audio_status, audio_file_path, audio_generated_at, text_hash, "
        "character_id, speaker_profile_name FROM chapter_segments WHERE id = ?",
        (segment_id,),
    ).fetchone()
    return dict(row)


def test_legacy_blind_bulk_update_incorrectly_applies_stale_render(db_path):
    """R1 documentation: today's pre-guard write-back path
    (`update_segments_bulk`, the unconditional `WHERE id IN (...)` this task
    replaces at the SEGMENT_SAVED call site) has no fingerprint check at all,
    so it wrongly applies a render for a segment whose text changed
    underneath it. This is the bug `write_back_segment_audio_guarded` fixes;
    kept as a permanent regression pin on the legacy helper's known blind
    behavior (still used as-is for the no-fingerprint marker-driven fallback
    path)."""
    with get_connection() as conn:
        chapter_id, segment_id = _seed_segment(conn, text="Original text.")
        conn.execute(
            "UPDATE chapter_segments SET text_content = ?, text_hash = ? WHERE id = ?",
            ("Edited text.", segment_text_hash("Edited text."), segment_id),
        )
        conn.commit()

    # The old call site did exactly this -- no fingerprint, no guard.
    update_segments_bulk(
        [segment_id], audio_status="done", audio_file_path="stale.wav", audio_generated_at=time.time()
    )

    with get_connection() as conn:
        row = _fetch_segment(conn, segment_id)
    assert row["audio_status"] == "done"
    assert row["audio_file_path"] == "stale.wav"


def test_stale_text_hash_is_discarded_not_applied(db_path):
    """R1: today's blind write-back applies a render whose text changed
    underneath it (a resync happened mid-render). The guard must discard it."""
    with get_connection() as conn:
        chapter_id, segment_id = _seed_segment(conn, text="Original text.")

        # Fingerprint captured AT SUBMISSION TIME (before the mutation).
        stale_fingerprint = {
            segment_id: {
                "text_hash": segment_text_hash("Original text."),
                "character_id": None,
                "speaker_profile_name": None,
            }
        }

        # Simulate a resync mutating the row's text/hash while the render
        # for the OLD text is still in flight.
        conn.execute(
            "UPDATE chapter_segments SET text_content = ?, text_hash = ? WHERE id = ?",
            ("Edited text.", segment_text_hash("Edited text."), segment_id),
        )
        conn.commit()

    result = write_back_segment_audio_guarded(stale_fingerprint, "/tmp/seg.wav", chapter_id)

    assert result == {"applied": [], "stale": [segment_id]}

    with get_connection() as conn:
        row = _fetch_segment(conn, segment_id)
    assert row["audio_status"] == "unprocessed"
    assert row["audio_file_path"] is None

    with get_connection() as conn:
        tombstones = conn.execute(
            "SELECT filename, chapter_id FROM segment_audio_tombstones"
        ).fetchall()
    assert [dict(t) for t in tombstones] == [{"filename": "seg.wav", "chapter_id": chapter_id}]


def test_matching_fingerprint_is_applied(db_path):
    """The positive case: fingerprint still matches, write-back succeeds normally."""
    with get_connection() as conn:
        chapter_id, segment_id = _seed_segment(conn, text="Stable text.")
        fingerprint = {
            segment_id: {
                "text_hash": segment_text_hash("Stable text."),
                "character_id": None,
                "speaker_profile_name": None,
            }
        }

    result = write_back_segment_audio_guarded(fingerprint, "/tmp/stable.wav", chapter_id)

    assert result == {"applied": [segment_id], "stale": []}

    with get_connection() as conn:
        row = _fetch_segment(conn, segment_id)
    assert row["audio_status"] == "done"
    assert row["audio_file_path"] == "stable.wav"
    assert row["audio_generated_at"] is not None

    with get_connection() as conn:
        tombstones = conn.execute("SELECT * FROM segment_audio_tombstones").fetchall()
    assert tombstones == []


def test_mid_render_voice_reassignment_is_caught_as_stale(db_path):
    """A mid-render voice-profile reassignment (segment's own column changes,
    no text change) must be caught by the guard -- otherwise the write-back
    would apply results rendered in the wrong voice."""
    with get_connection() as conn:
        chapter_id, segment_id = _seed_segment(
            conn, text="Some line.", speaker_profile_name="narrator_a"
        )
        fingerprint = {
            segment_id: {
                "text_hash": segment_text_hash("Some line."),
                "character_id": None,
                "speaker_profile_name": "narrator_a",
            }
        }
        # Reassign the SEGMENT's own voice column mid-render (not the
        # character's default -- that case is an accepted, documented gap).
        conn.execute(
            "UPDATE chapter_segments SET speaker_profile_name = ? WHERE id = ?",
            ("narrator_b", segment_id),
        )
        conn.commit()

    result = write_back_segment_audio_guarded(fingerprint, "/tmp/voice.wav", chapter_id)

    assert result == {"applied": [], "stale": [segment_id]}
    with get_connection() as conn:
        row = _fetch_segment(conn, segment_id)
    assert row["audio_status"] == "unprocessed"


def test_successful_writeback_clears_preexisting_tombstone(db_path):
    """A filename that was previously tombstoned (e.g. from a prior
    invalidation) and is now legitimately re-rendered under the same id must
    have its tombstone cleared in the same transaction as the apply."""
    with get_connection() as conn:
        chapter_id, segment_id = _seed_segment(conn, text="Re-rendered.")
        conn.execute(
            "INSERT INTO segment_audio_tombstones (filename, chapter_id, created_at) VALUES (?, ?, ?)",
            (f"{segment_id}.wav", chapter_id, time.time()),
        )
        conn.commit()
        fingerprint = {
            segment_id: {
                "text_hash": segment_text_hash("Re-rendered."),
                "character_id": None,
                "speaker_profile_name": None,
            }
        }

    result = write_back_segment_audio_guarded(
        fingerprint, f"/tmp/{segment_id}.wav", chapter_id
    )

    assert result == {"applied": [segment_id], "stale": []}
    with get_connection() as conn:
        tombstones = conn.execute("SELECT * FROM segment_audio_tombstones").fetchall()
    assert tombstones == []


def test_partial_batch_applies_per_row_not_all_or_nothing(db_path):
    """A batch write-back for a multi-segment group where one member's
    fingerprint is stale and another's still matches must apply the matching
    one and discard only the stale one."""
    with get_connection() as conn:
        chapter_id, fresh_id = _seed_segment(conn, text="Fresh.")
        _, stale_id = _seed_segment(conn, text="Stale original.")
        conn.execute(
            "UPDATE chapter_segments SET text_content = ?, text_hash = ? WHERE id = ?",
            ("Stale changed.", segment_text_hash("Stale changed."), stale_id),
        )
        conn.commit()
        fingerprints = {
            fresh_id: {
                "text_hash": segment_text_hash("Fresh."),
                "character_id": None,
                "speaker_profile_name": None,
            },
            stale_id: {
                "text_hash": segment_text_hash("Stale original."),
                "character_id": None,
                "speaker_profile_name": None,
            },
        }

    result = write_back_segment_audio_guarded(fingerprints, "/tmp/group.wav", chapter_id)

    assert set(result["applied"]) == {fresh_id}
    assert set(result["stale"]) == {stale_id}
