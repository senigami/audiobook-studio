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
            (project_dir / "audio").mkdir(parents=True, exist_ok=True)
            (project_dir / "text").mkdir(parents=True, exist_ok=True)
            (project_dir / "m4b").mkdir(parents=True, exist_ok=True)
            (project_dir / "cover").mkdir(parents=True, exist_ok=True)

            return project_id

def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
            row = cursor.fetchone()
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
            if config.PROJECTS_DIR.exists():
                for entry in config.PROJECTS_DIR.iterdir():
                    if entry.is_dir() and entry.name == project_id:
                        pdir = entry.resolve()
                        break

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


def migrate_legacy_project_covers() -> int:
    from .. import config

    candidates: list[tuple[str, Path, Path, str]] = []
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, cover_image_path FROM projects WHERE cover_image_path LIKE '/out/covers/%'")
            rows = cursor.fetchall()
            for row in rows:
                project_id = row["id"]
                cover_image_path = row["cover_image_path"]
                if not cover_image_path:
                    continue

                legacy_name = Path(cover_image_path.replace("/out/covers/", "")).name
                if not legacy_name:
                    continue

                legacy_path = config.COVER_DIR / legacy_name
                if not legacy_path.is_file():
                    continue

                project_cover_dir = config.get_project_cover_dir(project_id)
                new_name = f"cover{legacy_path.suffix.lower()}"
                destination = project_cover_dir / new_name
                new_virtual_path = f"/projects/{project_id}/cover/{new_name}"
                candidates.append((project_id, legacy_path, destination, new_virtual_path))

    migrated_updates: list[tuple[str, str]] = []
    import os
    trusted_cover_root = os.path.abspath(os.path.realpath(os.fspath(config.COVER_DIR)))

    for project_id, legacy_path, destination, new_virtual_path in candidates:
        # Rule 9: Locally visible containment check
        dest_parent = os.path.abspath(os.path.realpath(os.fspath(destination.parent)))
        trusted_projects_root = os.path.abspath(os.path.realpath(os.fspath(config.PROJECTS_DIR)))

        if not dest_parent.startswith(trusted_projects_root + os.sep):
             logger.warning("Migration destination escapes projects root: %s", dest_parent)
             continue

        os.makedirs(dest_parent, exist_ok=True)

        try:
            resolved_legacy = os.path.abspath(os.path.realpath(os.fspath(legacy_path)))
            resolved_dest = os.path.abspath(os.path.realpath(os.fspath(destination)))

            # Proof both sides
            if resolved_legacy.startswith(trusted_cover_root + os.sep) and resolved_dest.startswith(dest_parent + os.sep):
                if resolved_dest != resolved_legacy:
                    shutil.copy2(resolved_legacy, resolved_dest)
                migrated_updates.append((project_id, new_virtual_path))
        except Exception:
            logger.warning("Failed to migrate legacy cover %s for project %s", legacy_path, project_id, exc_info=True)

    if migrated_updates:
        with _db_lock:
            with get_connection() as conn:
                cursor = conn.cursor()
                for project_id, new_virtual_path in migrated_updates:
                    cursor.execute(
                        "UPDATE projects SET cover_image_path = ?, updated_at = ? WHERE id = ?",
                        (new_virtual_path, time.time(), project_id),
                    )
                conn.commit()

    return len(migrated_updates)
