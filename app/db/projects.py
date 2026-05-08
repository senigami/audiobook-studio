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
) -> str:
    from .. import config

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            project_id = str(uuid.uuid4())
            now = time.time()
            cursor.execute("""
                INSERT INTO projects (id, name, series, author, speaker_profile_name, cover_image_path, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (project_id, name, series, author, speaker_profile_name, cover_image_path, now, now))
            conn.commit()

            project_dir = config.PROJECTS_DIR / project_id
            (project_dir / "m4b").mkdir(parents=True, exist_ok=True)
            (project_dir / "cover").mkdir(parents=True, exist_ok=True)

            # Save V2 manifest immediately for new projects
            from ..domain.projects.manifest import save_project_manifest, CURRENT_STORAGE_VERSION
            manifest = {
                "version": CURRENT_STORAGE_VERSION,
                "title": name,
                "series": series,
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

def list_projects() -> List[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM projects ORDER BY updated_at DESC")
            return [dict(row) for row in cursor.fetchall()]

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
            from .. import config
            pdir = None
            try:
                pdir = config.get_project_dir(project_id)
                if not pdir.exists():
                    pdir = None
            except ValueError:
                pass

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
                import os
                trusted_projects_root = os.path.abspath(os.path.realpath(os.fspath(config.PROJECTS_DIR)))
                resolved_pdir = os.path.abspath(os.path.realpath(os.fspath(pdir)))

                if resolved_pdir.startswith(trusted_projects_root + os.sep):
                    try:
                        shutil.rmtree(resolved_pdir)
                    except Exception:
                        logger.warning("Failed to remove project directory %s", resolved_pdir, exc_info=True)

            return cursor.rowcount > 0
