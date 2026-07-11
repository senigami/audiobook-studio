"""Tests for app.db.segment_gc — startup GC pass for orphaned segment audio files.

TDD: these tests are written BEFORE the implementation. They define the
contract for reconcile_orphan_segment_files() and
reconcile_orphan_segment_files_for_project().

R2 compliant: mocks only _chapter_has_active_generation (boundary) and
watchdog (boundary). Never mocks the GC function itself or db internals.
R4 compliant: no sleeps or setTimeout waits.
"""
from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import patch

import pytest

from app.db.core import get_connection
from app.db.projects import create_project
from app.db.chapters import create_chapter
from app.core import config


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


def _resolve_seg_dir(project_id: str, chapter_id: str) -> Path:
    chapter_dir = config.get_chapter_dir(project_id, chapter_id)
    seg_dir = config.secure_join_flat(chapter_dir, "segments")
    assert seg_dir is not None
    seg_dir.mkdir(parents=True, exist_ok=True)
    return seg_dir


# ---------------------------------------------------------------------------
# Test 1 (R1 revert-check target): deletes unreferenced files
# ---------------------------------------------------------------------------

def test_deletes_orphaned_files():
    """Only files referenced by a DB row survive; true orphans are deleted."""
    from app.db.segment_gc import reconcile_orphan_segment_files

    pid = create_project("GC Test Project")
    cid = create_chapter(pid, "GC Chapter")

    # DB: only groupA.wav is referenced
    _insert_segment(cid, "seg-a", "groupA.wav")

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "groupA.wav").write_bytes(b"RIFF")
    (seg_dir / "groupB.wav").write_bytes(b"RIFF")
    (seg_dir / "groupC.wav").write_bytes(b"RIFF")

    summary = reconcile_orphan_segment_files()

    assert (seg_dir / "groupA.wav").exists(), "Referenced file must not be deleted"
    assert not (seg_dir / "groupB.wav").exists(), "Orphan groupB.wav must be deleted"
    assert not (seg_dir / "groupC.wav").exists(), "Orphan groupC.wav must be deleted"
    assert summary["orphans_deleted"] == 2
    assert summary["chapters_scanned"] >= 1


# ---------------------------------------------------------------------------
# Test 2: keeps all referenced files
# ---------------------------------------------------------------------------

def test_keeps_all_referenced_files():
    """When every file in segments/ is referenced, nothing is deleted."""
    from app.db.segment_gc import reconcile_orphan_segment_files

    pid = create_project("GC Keep Test")
    cid = create_chapter(pid, "GC Keep Chapter")

    _insert_segment(cid, "seg-x", "group1.wav")
    _insert_segment(cid, "seg-y", "group1.wav")  # two segments, same group file

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "group1.wav").write_bytes(b"RIFF")

    summary = reconcile_orphan_segment_files()

    assert (seg_dir / "group1.wav").exists()
    assert summary["orphans_deleted"] == 0


# ---------------------------------------------------------------------------
# Test 3: skips chapters with active generation
# ---------------------------------------------------------------------------

def test_skips_active_generation_chapter():
    """A chapter with an active render is skipped entirely — no deletions."""
    from app.db.segment_gc import reconcile_orphan_segment_files

    pid = create_project("GC Active Test")
    cid = create_chapter(pid, "GC Active Chapter")

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "orphan.wav").write_bytes(b"RIFF")
    # No DB row references orphan.wav, but the chapter is "active"

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
# Test 5: dry_run deletes nothing but counts orphans
# ---------------------------------------------------------------------------

def test_dry_run_deletes_nothing():
    """dry_run=True counts orphans but does not delete them."""
    from app.db.segment_gc import reconcile_orphan_segment_files

    pid = create_project("GC DryRun Test")
    cid = create_chapter(pid, "GC DryRun Chapter")

    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "orphan1.wav").write_bytes(b"RIFF")
    (seg_dir / "orphan2.wav").write_bytes(b"RIFF")
    # No DB rows → both are orphans

    summary = reconcile_orphan_segment_files(dry_run=True)

    assert (seg_dir / "orphan1.wav").exists(), "dry_run must not delete files"
    assert (seg_dir / "orphan2.wav").exists(), "dry_run must not delete files"
    assert summary["orphans_found"] >= 2
    assert summary["orphans_deleted"] == 0


# ---------------------------------------------------------------------------
# Per-project function tests (R1 revert-check targets for (a) and route test)
# ---------------------------------------------------------------------------

def test_per_project_scoping():
    """(a) Per-project sweep only touches the given project — not others.

    R1 revert-check target: must fail before reconcile_orphan_segment_files_for_project exists.
    """
    from app.db.segment_gc import reconcile_orphan_segment_files_for_project

    # Project A: has an unreferenced segment file
    pid_a = create_project("GC Scope A")
    cid_a = create_chapter(pid_a, "Chapter A")
    seg_dir_a = _resolve_seg_dir(pid_a, cid_a)
    (seg_dir_a / "orphan_a.wav").write_bytes(b"RIFF")
    # No DB row → orphan_a.wav is an orphan in project A

    # Project B: has an unreferenced segment file
    pid_b = create_project("GC Scope B")
    cid_b = create_chapter(pid_b, "Chapter B")
    seg_dir_b = _resolve_seg_dir(pid_b, cid_b)
    (seg_dir_b / "orphan_b.wav").write_bytes(b"RIFF")
    # No DB row → orphan_b.wav is an orphan in project B

    # Run ONLY for project A
    summary = reconcile_orphan_segment_files_for_project(pid_a)

    assert not (seg_dir_a / "orphan_a.wav").exists(), "Project A orphan must be deleted"
    assert (seg_dir_b / "orphan_b.wav").exists(), "Project B orphan must NOT be touched"
    assert summary["projects"] == 1
    assert summary["orphans_deleted"] == 1
    assert summary["orphans_found"] == 1


def test_per_project_skips_active_generation():
    """(b) Per-project sweep skips chapters with active generation."""
    from app.db.segment_gc import reconcile_orphan_segment_files_for_project

    pid = create_project("GC PerProject Active Test")
    cid = create_chapter(pid, "Active Chapter")
    seg_dir = _resolve_seg_dir(pid, cid)
    (seg_dir / "orphan.wav").write_bytes(b"RIFF")
    # No DB row → orphan.wav would be an orphan

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
    # No DB rows → both are orphans

    summary = reconcile_orphan_segment_files_for_project(pid, dry_run=True)

    assert (seg_dir / "dryrun1.wav").exists(), "dry_run must not delete files"
    assert (seg_dir / "dryrun2.wav").exists(), "dry_run must not delete files"
    assert summary["orphans_found"] >= 2
    assert summary["orphans_deleted"] == 0
    assert summary["projects"] == 1
