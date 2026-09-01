"""Tests for app.db.segment_gc — startup GC pass for orphaned segment audio files.

TDD: these tests are written BEFORE the implementation. They define the
contract for reconcile_orphan_segment_files() and
reconcile_orphan_segment_files_for_project().

#232 Task 004 (tombstone-gated GC, INV-3): GC no longer deletes an
unreferenced file on inference alone. A file becomes a deletion candidate
only once tombstoned; it is actually deleted only once that tombstone is
older than the grace period AND no live row references it at delete time.
This is a deliberate behavior change from the pre-Task-004 code (which
deleted every unreferenced file unconditionally) — the tests below assert
the NEW contract, not the old one.

R2 compliant: mocks only _chapter_has_active_generation (boundary) and
watchdog (boundary). Never mocks the GC function itself or db internals.
R4 compliant: no sleeps or setTimeout waits — grace-period aging is
simulated via a backdated `created_at`, never a real sleep.
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from app.db.core import get_connection
from app.db.projects import create_project
from app.db.chapters import create_chapter
from app.db.migrations.registry import MIGRATIONS
from app.db.migrations.runner import run_migrations
from app.core import config


@pytest.fixture(autouse=True)
def _ensure_schema():
    """conftest's ``clean_storage`` (function-scoped, autouse) re-runs
    ``init_db()`` before every test, which recreates the schema from scratch
    without the versioned migration registry — so segment_audio_tombstones
    and chapter_locks would not exist. Re-apply the migration after it, each
    test (idempotent, guarded by schema_migrations). Pytest runs a conftest
    autouse fixture before a same-scope autouse fixture defined in the test
    module, so this runs after clean_storage."""
    with get_connection() as conn:
        run_migrations(conn, MIGRATIONS)


def _insert_segment(chapter_id: str, seg_id: str, audio_file_path: str | None) -> None:
    """Insert a chapter_segments row directly via get_connection()."""
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO chapter_segments
              (id, chapter_id, segment_order, text_content, audio_status, audio_file_path)
            VALUES (?, ?, 0, 'text', ?, ?)
            """,
            (seg_id, chapter_id, "done" if audio_file_path else "unprocessed", audio_file_path),
        )
        conn.commit()


def _insert_tombstone(chapter_id: str, filename: str, *, age_seconds: float = 0.0) -> None:
    """Write a segment_audio_tombstones row, optionally backdated to
    simulate a tombstone that is already past the grace period, without
    a real sleep (R4)."""
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO segment_audio_tombstones (filename, chapter_id, created_at)
            VALUES (?, ?, ?)
            """,
            (filename, chapter_id, time.time() - age_seconds),
        )
        conn.commit()


def _resolve_seg_dir(project_id: str, chapter_id: str) -> Path:
    chapter_dir = config.get_chapter_dir(project_id, chapter_id)
    seg_dir = config.secure_join_flat(chapter_dir, "segments")
    assert seg_dir is not None
    seg_dir.mkdir(parents=True, exist_ok=True)
    return seg_dir


# ---------------------------------------------------------------------------
# Test 1 (R1 revert-check target): untombstoned orphans are NEVER deleted
# ---------------------------------------------------------------------------

def test_untombstoned_orphan_not_deleted():
    """INV-3: an unreferenced file with no tombstone is reported, never
    deleted. R1 revert-check target — fails against the pre-Task-004 code,
    which deleted every unreferenced file unconditionally."""
    from app.db.segment_gc import reconcile_orphan_segment_files

    pid = create_project("GC Test Project")
    cid = create_chapter(pid, "GC Chapter")

    # DB: only groupA.wav is referenced
    _insert_segment(cid, "seg-a", "groupA.wav")

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "groupA.wav").write_bytes(b"RIFF")
    (seg_dir / "groupB.wav").write_bytes(b"RIFF")
    (seg_dir / "groupC.wav").write_bytes(b"RIFF")
    # groupB.wav and groupC.wav have NO tombstone.

    summary = reconcile_orphan_segment_files()

    assert (seg_dir / "groupA.wav").exists(), "Referenced file must not be deleted"
    assert (seg_dir / "groupB.wav").exists(), "Untombstoned orphan must NOT be deleted"
    assert (seg_dir / "groupC.wav").exists(), "Untombstoned orphan must NOT be deleted"
    assert summary["orphans_deleted"] == 0
    assert summary["orphans_found"] == 2
    assert summary["orphans_untombstoned"] == 2
    assert summary["chapters_scanned"] >= 1


# ---------------------------------------------------------------------------
# Test: tombstoned + past grace period -> deleted
# ---------------------------------------------------------------------------

def test_tombstoned_orphan_past_grace_period_deleted():
    from app.db.segment_gc import (
        GC_TOMBSTONE_GRACE_PERIOD_SECONDS,
        reconcile_orphan_segment_files,
    )

    pid = create_project("GC Tombstone Aged Project")
    cid = create_chapter(pid, "GC Tombstone Aged Chapter")

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "aged.wav").write_bytes(b"RIFF")
    _insert_tombstone(cid, "aged.wav", age_seconds=GC_TOMBSTONE_GRACE_PERIOD_SECONDS + 60)

    summary = reconcile_orphan_segment_files()

    assert not (seg_dir / "aged.wav").exists(), "Tombstoned file past grace period must be deleted"
    assert summary["orphans_deleted"] == 1
    assert summary["orphans_untombstoned"] == 0

    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM segment_audio_tombstones WHERE chapter_id = ? AND filename = ?",
            (cid, "aged.wav"),
        ).fetchone()
    assert row is None, "Consumed tombstone row must be cleared after deletion"


# ---------------------------------------------------------------------------
# Test: tombstoned but still within grace period -> NOT deleted
# ---------------------------------------------------------------------------

def test_tombstoned_orphan_within_grace_period_not_deleted():
    from app.db.segment_gc import reconcile_orphan_segment_files

    pid = create_project("GC Tombstone Fresh Project")
    cid = create_chapter(pid, "GC Tombstone Fresh Chapter")

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "fresh.wav").write_bytes(b"RIFF")
    _insert_tombstone(cid, "fresh.wav", age_seconds=5)  # well within grace period

    summary = reconcile_orphan_segment_files()

    assert (seg_dir / "fresh.wav").exists(), "Tombstoned file within grace period must survive"
    assert summary["orphans_deleted"] == 0


# ---------------------------------------------------------------------------
# Test: a stale tombstone (file live again) is cleared, never the file
# ---------------------------------------------------------------------------

def test_stale_tombstone_for_live_file_is_cleared_not_the_file():
    """A row can be tombstoned, then legitimately re-rendered under the SAME
    id/filename before the grace period elapses. GC must re-check live
    references at delete time and clear the now-stale tombstone rather than
    deleting the (live, referenced) file."""
    from app.db.segment_gc import (
        GC_TOMBSTONE_GRACE_PERIOD_SECONDS,
        reconcile_orphan_segment_files,
    )

    pid = create_project("GC Stale Tombstone Project")
    cid = create_chapter(pid, "GC Stale Tombstone Chapter")

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "reused.wav").write_bytes(b"RIFF")

    # Tombstoned in the past (old enough to be past the grace period)...
    _insert_tombstone(cid, "reused.wav", age_seconds=GC_TOMBSTONE_GRACE_PERIOD_SECONDS + 60)
    # ...but a live row now references the SAME filename again (re-render).
    _insert_segment(cid, "seg-reused", "reused.wav")

    summary = reconcile_orphan_segment_files()

    assert (seg_dir / "reused.wav").exists(), "Live re-rendered file must NEVER be deleted"
    assert summary["orphans_deleted"] == 0

    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM segment_audio_tombstones WHERE chapter_id = ? AND filename = ?",
            (cid, "reused.wav"),
        ).fetchone()
    assert row is None, "Stale tombstone must be cleared once the filename is live again"


# ---------------------------------------------------------------------------
# Test 2: keeps all referenced files
# ---------------------------------------------------------------------------

def test_keeps_all_referenced_files():
    """When every file in segments/ is referenced, nothing is deleted."""
    from app.db.segment_gc import reconcile_orphan_segment_files

    pid = create_project("GC Keep Test")
    cid = create_chapter(pid, "GC Keep Chapter")

    # #232 Task 005's ux_seg_audio_file unique index (chapter_id,
    # audio_file_path) now enforces one-row-one-file at the DB level, so two
    # segments can no longer legitimately share a file the way a pre-collapse
    # render-batch row set once did — each gets its own referenced file
    # instead; the point under test (nothing referenced gets deleted) is
    # unaffected.
    _insert_segment(cid, "seg-x", "group1.wav")
    _insert_segment(cid, "seg-y", "group2.wav")

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "group1.wav").write_bytes(b"RIFF")
    (seg_dir / "group2.wav").write_bytes(b"RIFF")

    summary = reconcile_orphan_segment_files()

    assert (seg_dir / "group1.wav").exists()
    assert (seg_dir / "group2.wav").exists()
    assert summary["orphans_deleted"] == 0


# ---------------------------------------------------------------------------
# Test 3: skips chapters with active generation
# ---------------------------------------------------------------------------

def test_skips_active_generation_chapter():
    """A chapter with an active render is skipped entirely — no deletions."""
    from app.db.segment_gc import (
        GC_TOMBSTONE_GRACE_PERIOD_SECONDS,
        reconcile_orphan_segment_files,
    )

    pid = create_project("GC Active Test")
    cid = create_chapter(pid, "GC Active Chapter")

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "orphan.wav").write_bytes(b"RIFF")
    # Tombstoned + aged, so it WOULD be deleted if not for the active guard.
    _insert_tombstone(cid, "orphan.wav", age_seconds=GC_TOMBSTONE_GRACE_PERIOD_SECONDS + 60)

    with patch("app.db.segment_gc._chapter_has_active_generation", return_value=True):
        summary = reconcile_orphan_segment_files()

    assert (seg_dir / "orphan.wav").exists(), "Orphan must NOT be deleted for active chapters"
    assert summary["chapters_skipped_active"] >= 1
    assert summary["orphans_deleted"] == 0


# ---------------------------------------------------------------------------
# Test 4: never touches chapter-root outputs
# ---------------------------------------------------------------------------

def test_never_touches_chapter_root_outputs():
    """chapter.wav and chapter.m4a in the chapter root dir are not deleted."""
    from app.db.segment_gc import reconcile_orphan_segment_files

    pid = create_project("GC Root Test")
    cid = create_chapter(pid, "GC Root Chapter")

    chapter_dir = config.get_chapter_dir(pid, cid)
    chapter_wav = chapter_dir / "chapter.wav"
    chapter_m4a = chapter_dir / "chapter.m4a"
    chapter_wav.write_bytes(b"RIFF")
    chapter_m4a.write_bytes(b"ID3")

    # segments/ subdir is empty — nothing to orphan there
    _resolve_seg_dir(pid, cid)  # ensure dir exists

    summary = reconcile_orphan_segment_files()

    assert chapter_wav.exists(), "chapter.wav in root must survive"
    assert chapter_m4a.exists(), "chapter.m4a in root must survive"


# ---------------------------------------------------------------------------
# Test 5: dry_run deletes nothing but counts orphans (tombstoned or not)
# ---------------------------------------------------------------------------

def test_dry_run_deletes_nothing():
    """dry_run=True counts orphans but does not delete them, and does not
    mutate tombstone state either."""
    from app.db.segment_gc import (
        GC_TOMBSTONE_GRACE_PERIOD_SECONDS,
        reconcile_orphan_segment_files,
    )

    pid = create_project("GC DryRun Test")
    cid = create_chapter(pid, "GC DryRun Chapter")

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "orphan1.wav").write_bytes(b"RIFF")
    (seg_dir / "orphan2.wav").write_bytes(b"RIFF")
    # orphan2 is tombstoned and aged — would be deleted for real, but must
    # not be under dry_run.
    _insert_tombstone(cid, "orphan2.wav", age_seconds=GC_TOMBSTONE_GRACE_PERIOD_SECONDS + 60)

    summary = reconcile_orphan_segment_files(dry_run=True)

    assert (seg_dir / "orphan1.wav").exists(), "dry_run must not delete files"
    assert (seg_dir / "orphan2.wav").exists(), "dry_run must not delete files"
    assert summary["orphans_found"] >= 2
    assert summary["orphans_deleted"] == 0

    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM segment_audio_tombstones WHERE chapter_id = ? AND filename = ?",
            (cid, "orphan2.wav"),
        ).fetchone()
    assert row is not None, "dry_run must not consume the tombstone either"


# ---------------------------------------------------------------------------
# Per-project function tests (R1 revert-check targets for (a) and route test)
# ---------------------------------------------------------------------------

def test_per_project_scoping():
    """(a) Per-project sweep only touches the given project — not others.

    R1 revert-check target: must fail before reconcile_orphan_segment_files_for_project exists.
    """
    from app.db.segment_gc import (
        GC_TOMBSTONE_GRACE_PERIOD_SECONDS,
        reconcile_orphan_segment_files_for_project,
    )

    # Project A: has an unreferenced, tombstoned+aged segment file
    pid_a = create_project("GC Scope A")
    cid_a = create_chapter(pid_a, "Chapter A")
    seg_dir_a = _resolve_seg_dir(pid_a, cid_a)
    (seg_dir_a / "orphan_a.wav").write_bytes(b"RIFF")
    _insert_tombstone(cid_a, "orphan_a.wav", age_seconds=GC_TOMBSTONE_GRACE_PERIOD_SECONDS + 60)

    # Project B: has an unreferenced, tombstoned+aged segment file too
    pid_b = create_project("GC Scope B")
    cid_b = create_chapter(pid_b, "Chapter B")
    seg_dir_b = _resolve_seg_dir(pid_b, cid_b)
    (seg_dir_b / "orphan_b.wav").write_bytes(b"RIFF")
    _insert_tombstone(cid_b, "orphan_b.wav", age_seconds=GC_TOMBSTONE_GRACE_PERIOD_SECONDS + 60)

    # Run ONLY for project A
    summary = reconcile_orphan_segment_files_for_project(pid_a)

    assert not (seg_dir_a / "orphan_a.wav").exists(), "Project A orphan must be deleted"
    assert (seg_dir_b / "orphan_b.wav").exists(), "Project B orphan must NOT be touched"
    assert summary["projects"] == 1
    assert summary["orphans_deleted"] == 1
    assert summary["orphans_found"] == 1


def test_per_project_skips_active_generation():
    """(b) Per-project sweep skips chapters with active generation."""
    from app.db.segment_gc import (
        GC_TOMBSTONE_GRACE_PERIOD_SECONDS,
        reconcile_orphan_segment_files_for_project,
    )

    pid = create_project("GC PerProject Active Test")
    cid = create_chapter(pid, "Active Chapter")
    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "orphan.wav").write_bytes(b"RIFF")
    _insert_tombstone(cid, "orphan.wav", age_seconds=GC_TOMBSTONE_GRACE_PERIOD_SECONDS + 60)

    with patch("app.db.segment_gc._chapter_has_active_generation", return_value=True):
        summary = reconcile_orphan_segment_files_for_project(pid)

    assert (seg_dir / "orphan.wav").exists(), "Orphan must NOT be deleted for active chapters"
    assert summary["chapters_skipped_active"] >= 1
    assert summary["orphans_deleted"] == 0


def test_per_project_dry_run():
    """(c) Per-project sweep with dry_run=True counts but does not delete."""
    from app.db.segment_gc import reconcile_orphan_segment_files_for_project

    pid = create_project("GC PerProject DryRun Test")
    cid = create_chapter(pid, "DryRun Chapter")
    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "dryrun1.wav").write_bytes(b"RIFF")
    (seg_dir / "dryrun2.wav").write_bytes(b"RIFF")
    # No DB rows, no tombstones → both are orphans

    summary = reconcile_orphan_segment_files_for_project(pid, dry_run=True)

    assert (seg_dir / "dryrun1.wav").exists(), "dry_run must not delete files"
    assert (seg_dir / "dryrun2.wav").exists(), "dry_run must not delete files"
    assert summary["orphans_found"] >= 2
    assert summary["orphans_deleted"] == 0
    assert summary["projects"] == 1
