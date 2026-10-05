"""Garbage-collection pass for orphaned segment audio files.

``reconcile_orphan_segment_files_for_project(project_id)`` sweeps a single
project's chapters and deletes WAV/MP3/M4A files inside ``segments/`` that are
no longer referenced by any ``chapter_segments`` DB row.

``reconcile_orphan_segment_files()`` is the library-wide variant that iterates
all projects and delegates to the per-project function; it is kept for manual
full sweeps.

Design constraints:
- Pure function — no import-time side effects (nothing runs at module import).
- Keyed on referenced *filenames* (not segment IDs), so group-WAVs shared by
  multiple segment rows are handled correctly.
- Delegates actual deletion to the existing hardened primitive
  ``cleanup_chapter_audio_files`` (validates path containment before deleting).
- Scoped strictly to each chapter's ``segments/`` subdir; never enumerates or
  deletes chapter-root files.

Tombstone-gated deletion (#232 Task 004, INV-3): an unreferenced file is a
deletion CANDIDATE, never an automatic delete. It is only actually removed
once ALL of: (a) a ``segment_audio_tombstones`` row exists for it, (b) that
row is older than ``GC_TOMBSTONE_GRACE_PERIOD_SECONDS``, and (c) no live
``chapter_segments`` row currently references that exact filename (re-checked
at delete time, not just inferred from the tombstone's existence — a
resync-invalidated row can legitimately be re-rendered under the same
id/filename before the grace period elapses). A candidate with no tombstone
is reported (``orphans_untombstoned``) and left alone; an operator/scheduled
sweep decides what to do with a long-lived untombstoned orphan. A tombstone
whose filename check (c) fails is itself stale (the file is live again) and
is cleared, never the file.

The sweep runs inside ``chapter_lock`` — this provides no additional
correctness serialization (SQLite's own writer lock already does that for
the ``BEGIN IMMEDIATE`` transaction below), only observability of "what is
mutating this chapter" for diagnostics.
"""

from __future__ import annotations

import logging
import os
import time

from .chapter_locks import ChapterLockHeldError, chapter_lock
from .chapters_helpers import SAFE_AUDIO_NAME_RE
from .core import get_connection
from .segments import _chapter_has_active_generation

logger = logging.getLogger(__name__)

# Named constant, not a magic number (task requirement) — how long a
# tombstoned file must sit before GC will actually delete it.
GC_TOMBSTONE_GRACE_PERIOD_SECONDS = 3600


def reconcile_orphan_segment_files_for_project(
    project_id: str, *, dry_run: bool = False
) -> dict:
    """Garbage-collect orphaned segment audio files for a single project.

    Args:
        project_id: The project to sweep.
        dry_run: When True, count orphans but do not delete anything.

    Returns:
        Summary dict with integer counts (``"projects"`` is always 1):
        ``{"projects", "chapters_scanned", "chapters_skipped_active",
           "orphans_deleted", "orphans_found", "errors"}``.
    """
    from app.db.chapters import list_chapters  # noqa: PLC0415
    from app.core import config  # noqa: PLC0415
    from app.db.chapters_cleanup import cleanup_chapter_audio_files  # noqa: PLC0415

    summary: dict[str, int] = {
        "projects": 1,
        "chapters_scanned": 0,
        "chapters_skipped_active": 0,
        "orphans_deleted": 0,
        "orphans_found": 0,
        "orphans_untombstoned": 0,
        "errors": 0,
    }

    try:
        chapters = list_chapters(project_id)
    except Exception:
        logger.warning(
            "segment_gc: failed to list chapters for project %s", project_id, exc_info=True
        )
        summary["errors"] += 1
        chapters = []

    for chapter in chapters:
        chapter_id: str = chapter["id"]
        try:
            _process_chapter(
                project_id=project_id,
                chapter_id=chapter_id,
                config=config,
                cleanup_chapter_audio_files=cleanup_chapter_audio_files,
                dry_run=dry_run,
                summary=summary,
            )
        except Exception:
            logger.warning(
                "segment_gc: error processing chapter %s in project %s",
                chapter_id,
                project_id,
                exc_info=True,
            )
            summary["errors"] += 1

    action = "dry-run scan" if dry_run else "sweep"
    logger.info(
        "segment_gc %s complete for project=%s: chapters_scanned=%d "
        "chapters_skipped_active=%d orphans_found=%d orphans_deleted=%d "
        "orphans_untombstoned=%d errors=%d",
        action,
        project_id,
        summary["chapters_scanned"],
        summary["chapters_skipped_active"],
        summary["orphans_found"],
        summary["orphans_deleted"],
        summary["orphans_untombstoned"],
        summary["errors"],
    )
    return summary


def reconcile_orphan_segment_files(*, dry_run: bool = False) -> dict:
    """Garbage-collect orphaned segment audio files across all projects/chapters.

    Iterates all projects and delegates to
    ``reconcile_orphan_segment_files_for_project`` for each, aggregating the
    results.

    Args:
        dry_run: When True, count orphans but do not delete anything.

    Returns:
        Summary dict with integer counts:
        ``{"projects", "chapters_scanned", "chapters_skipped_active",
           "orphans_deleted", "orphans_found", "errors"}``.
    """
    from app.db.projects import list_projects  # noqa: PLC0415

    combined: dict[str, int] = {
        "projects": 0,
        "chapters_scanned": 0,
        "chapters_skipped_active": 0,
        "orphans_deleted": 0,
        "orphans_found": 0,
        "orphans_untombstoned": 0,
        "errors": 0,
    }

    projects = list_projects()
    combined["projects"] = len(projects)

    for project in projects:
        project_id: str = project["id"]
        per = reconcile_orphan_segment_files_for_project(project_id, dry_run=dry_run)
        combined["chapters_scanned"] += per["chapters_scanned"]
        combined["chapters_skipped_active"] += per["chapters_skipped_active"]
        combined["orphans_deleted"] += per["orphans_deleted"]
        combined["orphans_found"] += per["orphans_found"]
        combined["orphans_untombstoned"] += per["orphans_untombstoned"]
        combined["errors"] += per["errors"]

    action = "dry-run scan" if dry_run else "sweep"
    logger.info(
        "segment_gc %s complete: projects=%d chapters_scanned=%d "
        "chapters_skipped_active=%d orphans_found=%d orphans_deleted=%d "
        "orphans_untombstoned=%d errors=%d",
        action,
        combined["projects"],
        combined["chapters_scanned"],
        combined["chapters_skipped_active"],
        combined["orphans_found"],
        combined["orphans_deleted"],
        combined["orphans_untombstoned"],
        combined["errors"],
    )
    return combined


def _live_filenames(conn, chapter_id: str) -> set[str]:
    """Basename set of every filename currently referenced by a live row."""
    rows = conn.execute(
        """
        SELECT audio_file_path
        FROM chapter_segments
        WHERE chapter_id = ?
          AND audio_file_path IS NOT NULL
          AND audio_file_path != ''
        """,
        (chapter_id,),
    ).fetchall()
    return {os.path.basename(row[0]) for row in rows if row[0]}


def _process_chapter(
    *,
    project_id: str,
    chapter_id: str,
    config,
    cleanup_chapter_audio_files,
    dry_run: bool,
    summary: dict,
) -> None:
    """Process a single chapter — inner logic extracted for try/except isolation."""
    # Race guard: skip chapters with an active/queued render
    if _chapter_has_active_generation(chapter_id):
        summary["chapters_skipped_active"] += 1
        return

    summary["chapters_scanned"] += 1

    with get_connection() as conn:
        keep = _live_filenames(conn, chapter_id)

    # Resolve the segments directory
    chapter_dir = config.get_chapter_dir(project_id, chapter_id)
    seg_dir = config.secure_join_flat(chapter_dir, "segments")
    if seg_dir is None or not seg_dir.exists():
        return

    # Scan and collect deletion CANDIDATES (unreferenced files) — not yet
    # deletions. Whether a candidate is actually removed is gated below by
    # tombstone status (INV-3).
    try:
        entries = list(os.scandir(seg_dir))
    except OSError:
        logger.warning("segment_gc: cannot scandir %s", seg_dir, exc_info=True)
        return

    candidates: list[str] = []
    for entry in entries:
        if not entry.is_file():
            continue
        name = entry.name
        if not name.lower().endswith((".wav", ".mp3", ".m4a")):
            continue
        if not SAFE_AUDIO_NAME_RE.fullmatch(name):
            continue
        if name not in keep:
            candidates.append(name)

    summary["orphans_found"] += len(candidates)

    if dry_run:
        return

    to_delete: list[str] = []
    now = time.time()
    try:
        with get_connection() as conn:
            with chapter_lock(conn, chapter_id, held_by="segment_gc"):
                # Re-fetch the live set fresh, inside the lock, so the
                # re-reference checks below reflect the current state, not
                # the state at scan time.
                live_now = _live_filenames(conn, chapter_id)

                # Every tombstone for this chapter, not just ones matching a
                # directory-scan candidate — a filename can become live again
                # (re-rendered under the same id) between the scan above and
                # this lock, in which case it was already filtered OUT of
                # `candidates` by the original keep-set and would never be
                # reconciled below otherwise.
                tombstone_rows = conn.execute(
                    "SELECT filename, created_at FROM segment_audio_tombstones WHERE chapter_id = ?",
                    (chapter_id,),
                ).fetchall()
                tombstones = {row[0]: row[1] for row in tombstone_rows}

                stale_tombstone_names = [name for name in tombstones if name in live_now]

                for name in candidates:
                    if name in live_now:
                        # Became live between scan and lock; already handled
                        # via stale_tombstone_names above if tombstoned.
                        continue

                    created_at = tombstones.get(name)
                    if created_at is None:
                        # No tombstone: report, never delete on inference.
                        summary["orphans_untombstoned"] += 1
                        continue

                    if now - created_at < GC_TOMBSTONE_GRACE_PERIOD_SECONDS:
                        continue  # tombstoned, but still within grace period

                    to_delete.append(name)

                if stale_tombstone_names or to_delete:
                    conn.executemany(
                        "DELETE FROM segment_audio_tombstones WHERE chapter_id = ? AND filename = ?",
                        [(chapter_id, name) for name in (*stale_tombstone_names, *to_delete)],
                    )
                conn.commit()
    except ChapterLockHeldError:
        logger.info(
            "segment_gc: chapter %s locked by another operation, skipping this sweep",
            chapter_id,
        )
        return

    if to_delete:
        cleanup_chapter_audio_files(
            project_id,
            chapter_id,
            explicit_files=to_delete,
            delete_chapter_outputs=False,
        )
        summary["orphans_deleted"] += len(to_delete)
