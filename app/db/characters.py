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
            # Revert any segments assigned to this character back to the narrator,
            # rather than leaving a dangling character_id. Any audio rendered in the
            # deleted character's voice is now stale, so invalidate it so the line
            # re-renders with the narrator/default voice.
            cursor.execute(
                """
                UPDATE chapter_segments
                SET character_id = NULL,
                    speaker_profile_name = NULL,
                    audio_status = CASE WHEN audio_status = 'done' THEN 'unprocessed' ELSE audio_status END,
                    audio_file_path = CASE WHEN audio_status = 'done' THEN NULL ELSE audio_file_path END,
                    audio_generated_at = CASE WHEN audio_status = 'done' THEN NULL ELSE audio_generated_at END
                WHERE character_id = ?
                """,
                (character_id,),
            )
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
