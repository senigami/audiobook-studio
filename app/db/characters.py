import time
import uuid
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection

def create_character(project_id: str, name: str, speaker_profile_name: Optional[str] = None, default_emotion: str = "Neutral", chapter_id: Optional[str] = None, **updates) -> str:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            character_id = str(uuid.uuid4())
            color = updates.get('color', '#8b5cf6')
            cursor.execute("""
                INSERT INTO characters (id, project_id, name, speaker_profile_name, default_emotion, color, chapter_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (character_id, project_id, name, speaker_profile_name, default_emotion, color, chapter_id))
            conn.commit()
            return character_id

def get_characters(project_id: str, chapter_id: Optional[str] = None) -> List[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            if chapter_id is not None:
                cursor.execute(
                    "SELECT * FROM characters WHERE project_id = ? AND (chapter_id IS NULL OR chapter_id = ?)",
                    (project_id, chapter_id),
                )
            else:
                cursor.execute("SELECT * FROM characters WHERE project_id = ?", (project_id,))
            return [dict(row) for row in cursor.fetchall()]

def update_character(character_id: str, **updates) -> bool:
    if not updates: return False
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            fields = []
            values = []
            for k, v in updates.items():
                fields.append(f"{k} = ?")
                values.append(v)
            values.append(character_id)
            cursor.execute(f"UPDATE characters SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
            return cursor.rowcount > 0

def delete_character(character_id: str) -> bool:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM characters WHERE id = ?", (character_id,))
            conn.commit()
            return cursor.rowcount > 0

def promote_character(character_id: str) -> bool:
    """Promote a chapter-scoped temp character to book scope by clearing chapter_id."""
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE characters SET chapter_id = NULL WHERE id = ?", (character_id,))
            conn.commit()
            return cursor.rowcount > 0
