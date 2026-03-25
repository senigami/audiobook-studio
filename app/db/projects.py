import time
import uuid
import logging
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection

logger = logging.getLogger(__name__)

def create_project(name: str, series: Optional[str] = None, author: Optional[str] = None, cover_image_path: Optional[str] = None) -> str:
    from .. import config

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            project_id = str(uuid.uuid4())
            now = time.time()
            cursor.execute("""
                INSERT INTO projects (id, name, series, author, cover_image_path, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (project_id, name, series, author, cover_image_path, now, now))
            conn.commit()

            project_dir = config.PROJECTS_DIR / project_id
            (project_dir / "audio").mkdir(parents=True, exist_ok=True)
            (project_dir / "text").mkdir(parents=True, exist_ok=True)
            (project_dir / "m4b").mkdir(parents=True, exist_ok=True)

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
            import shutil
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
            if pdir and pdir.is_relative_to(config.PROJECTS_DIR.resolve()):
                try:
                    shutil.rmtree(pdir)
                except Exception:
                    logger.warning("Failed to remove project directory %s", pdir, exc_info=True)

            return cursor.rowcount > 0
