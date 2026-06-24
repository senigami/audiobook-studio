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
"""

from __future__ import annotations

import logging
import os

from .chapters_helpers import SAFE_AUDIO_NAME_RE
from .core import get_connection
from .segments import _chapter_has_active_generation

logger = logging.getLogger(__name__)


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
        "chapters_skipped_active=%d orphans_found=%d orphans_deleted=%d errors=%d",
        action,
        project_id,
        summary["chapters_scanned"],
        summary["chapters_skipped_active"],
        summary["orphans_found"],
        summary["orphans_deleted"],
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
        combined["errors"] += per["errors"]

    action = "dry-run scan" if dry_run else "sweep"
    logger.info(
        "segment_gc %s complete: projects=%d chapters_scanned=%d "
        "chapters_skipped_active=%d orphans_found=%d orphans_deleted=%d errors=%d",
        action,
        combined["projects"],
        combined["chapters_scanned"],
        combined["chapters_skipped_active"],
        combined["orphans_found"],
        combined["orphans_deleted"],
        combined["errors"],
    )
    return combined


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

    # Build the keep-set of referenced filenames from the DB
    keep: set[str] = set()
    with get_connection() as conn:
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
    for row in rows:
        raw = row[0]
        if raw:
            keep.add(os.path.basename(raw))

    # Resolve the segments directory
    chapter_dir = config.get_chapter_dir(project_id, chapter_id)
    seg_dir = config.secure_join_flat(chapter_dir, "segments")
    if seg_dir is None or not seg_dir.exists():
        return

    # Scan and collect orphans
    orphans: list[str] = []
    try:
        entries = list(os.scandir(seg_dir))
    except OSError:
        logger.warning("segment_gc: cannot scandir %s", seg_dir, exc_info=True)
        return

    for entry in entries:
        if not entry.is_file():
            continue
        name = entry.name
        if not name.lower().endswith((".wav", ".mp3", ".m4a")):
            continue
        if not SAFE_AUDIO_NAME_RE.fullmatch(name):
            continue
        if name not in keep:
            orphans.append(name)

    summary["orphans_found"] += len(orphans)

    if orphans and not dry_run:
        cleanup_chapter_audio_files(
            project_id,
            chapter_id,
            explicit_files=orphans,
            delete_chapter_outputs=False,
        )
        summary["orphans_deleted"] += len(orphans)
