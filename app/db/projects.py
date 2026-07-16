import time
import uuid
import logging
import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection

logger = logging.getLogger(__name__)

def create_project(
    name: str,
    series: Optional[str] = None,
    author: Optional[str] = None,
    cover_image_path: Optional[str] = None,
    speaker_profile_name: Optional[str] = None,
    series_position: Optional[int] = None,
) -> str:
    from ..core import config

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            project_id = str(uuid.uuid4())
            now = time.time()
            cursor.execute("""
                INSERT INTO projects (id, name, series, series_position, author, speaker_profile_name, cover_image_path, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (project_id, name, series, series_position, author, speaker_profile_name, cover_image_path, now, now))
            conn.commit()

            from ..storage.manager import get_storage_manager
            ctx = get_storage_manager().get_project_context(project_id)
            ctx.m4b_dir.mkdir(parents=True, exist_ok=True)
            ctx.cover_dir.mkdir(parents=True, exist_ok=True)
            project_dir = ctx.root

            # Save V2 manifest immediately for new projects
            from ..domain.projects.manifest import save_project_manifest, CURRENT_STORAGE_VERSION
            manifest = {
                "version": CURRENT_STORAGE_VERSION,
                "title": name,
                "series": series,
                "series_position": series_position,
                "author": author,
                "created_at": now,
            }
            save_project_manifest(project_dir, manifest)

            return project_id

def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    request_started_at = time.perf_counter()
    with _db_lock:
        lock_acquired_at = time.perf_counter()
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
            row = cursor.fetchone()
            total_ms = round((time.perf_counter() - request_started_at) * 1000)
            lock_wait_ms = round((lock_acquired_at - request_started_at) * 1000)
            query_ms = round((time.perf_counter() - lock_acquired_at) * 1000)
            if total_ms >= 100:
                logger.info(
                    "get_project timing project=%s total_ms=%s lock_wait_ms=%s query_ms=%s",
                    project_id,
                    total_ms,
                    lock_wait_ms,
                    query_ms,
                )
            return dict(row) if row else None

# Task 005 (north_star_screen_parity) — per-project workflow status, derived
# from chapter-lifecycle aggregates already in the DB (no schema change, no
# per-project round-trip, no filesystem scan). Owner-approved partial scope:
# only 3 states are derivable this way — "drafting" (no chapter has been
# chunked into segments yet), "casting" (some progress but not fully
# rendered), "rendered" (every chapter's audio_status is 'done'). "Studio"
# (actively rendering) and "Published" (assembled into an audiobook) are out
# of scope for this pass — see design-docs/plans/active/
# north_star_screen_parity/tasks/005-library-project-status.md.
_PROJECT_STATUS_AGGREGATE_SQL = """
    SELECT
        p.*,
        COUNT(DISTINCT c.id) AS chapter_count,
        COUNT(DISTINCT CASE WHEN seg_counts.total_segments > 0 THEN c.id END) AS chapters_with_segments_count,
        COUNT(DISTINCT CASE WHEN c.audio_status = 'done' THEN c.id END) AS chapters_rendered_count
    FROM projects p
    LEFT JOIN chapters c ON c.project_id = p.id
    LEFT JOIN (
        SELECT chapter_id, COUNT(*) AS total_segments
        FROM chapter_segments
        GROUP BY chapter_id
    ) seg_counts ON seg_counts.chapter_id = c.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
"""


def _derive_project_status(chapter_count: int, chapters_with_segments_count: int, chapters_rendered_count: int) -> str:
    if chapter_count == 0 or chapters_with_segments_count == 0:
        return "drafting"
    if chapters_rendered_count == chapter_count:
        return "rendered"
    return "casting"


def list_projects() -> List[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(_PROJECT_STATUS_AGGREGATE_SQL)
            rows = [dict(row) for row in cursor.fetchall()]

    for row in rows:
        chapter_count = row.get("chapter_count", 0) or 0
        chapters_with_segments_count = row.pop("chapters_with_segments_count", 0) or 0
        chapters_rendered_count = row.get("chapters_rendered_count", 0) or 0
        # Task 006 (north_star_screen_parity) — expose the raw counts (rather
        # than popping them like chapters_with_segments_count, which has no
        # frontend use yet) so the Library "Continue" section can derive a
        # real, non-fabricated rendered-fraction percentage
        # (chapters_rendered_count / chapter_count) without a new query.
        row["chapter_count"] = chapter_count
        row["chapters_rendered_count"] = chapters_rendered_count
        row["status"] = _derive_project_status(chapter_count, chapters_with_segments_count, chapters_rendered_count)

    return rows

def update_project(project_id: str, **updates) -> bool:
    if not updates: return False
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            fields = []
            values = []
            for k, v in updates.items():
                fields.append(f"{k} = ?")
                values.append(v)
            fields.append("updated_at = ?")
            values.append(time.time())
            values.append(project_id)

            cursor.execute(f"UPDATE projects SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
            return cursor.rowcount > 0

def delete_project(project_id: str) -> bool:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            # 1. First, get project info for path cleanup
            from ..storage.manager import get_storage_manager
            storage = get_storage_manager()
            ctx = storage.get_project_context(project_id)
            pdir = ctx.root if ctx.root.exists() else None

            # 2. Delete from DB
            # Delete related characters
            cursor.execute("DELETE FROM characters WHERE project_id = ?", (project_id,))
            # Delete related segments implicitly if we delete chapters, or explicitly
            cursor.execute("DELETE FROM chapter_segments WHERE chapter_id IN (SELECT id FROM chapters WHERE project_id = ?)", (project_id,))
            cursor.execute("DELETE FROM processing_queue WHERE project_id = ?", (project_id,))
            cursor.execute("DELETE FROM chapters WHERE project_id = ?", (project_id,))
            cursor.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            conn.commit()

            # 3. Physical cleanup
            if pdir:
                if storage.is_safe(pdir):
                    try:
                        shutil.rmtree(pdir)
                    except Exception:
                        logger.warning("Failed to remove project directory %s", pdir, exc_info=True)

            return cursor.rowcount > 0
