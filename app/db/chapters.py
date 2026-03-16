import time
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection

def create_chapter(project_id: str, title: str, text_content: Optional[str] = None, sort_order: int = 0, predicted_audio_length: float = 0.0, char_count: int = 0, word_count: int = 0) -> str:
    import uuid
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            chapter_id = str(uuid.uuid4())
            if text_content:
                text_content = text_content.replace("\r\n", "\n")
            cursor.execute("""
                INSERT INTO chapters (id, project_id, title, text_content, sort_order, predicted_audio_length, char_count, word_count, text_last_modified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (chapter_id, project_id, title, text_content, sort_order, predicted_audio_length, char_count, word_count, time.time()))
            conn.commit()

            if text_content:
                from .segments import sync_chapter_segments
                sync_chapter_segments(chapter_id, text_content)

            return chapter_id

def get_chapter_segments_counts(chapter_id: str) -> tuple[int, int]:
    """Returns (done_count, total_count) for a chapter."""
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 
                    (SELECT COUNT(*) FROM chapter_segments WHERE chapter_id = ? AND audio_status = 'done') as done_count,
                    (SELECT COUNT(*) FROM chapter_segments WHERE chapter_id = ?) as total_count
            """, (chapter_id, chapter_id))
            row = cursor.fetchone()
            if row:
                return row['done_count'], row['total_count']
            return 0, 0

def get_chapter(chapter_id: str) -> Optional[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM chapters WHERE id = ?", (chapter_id,))
            row = cursor.fetchone()
            if not row: return None
            chap = dict(row)

    # Rule 3: Disk as Source of Truth - Outside Lock
    from .. import config
    pdir = config.get_project_audio_dir(chap["project_id"]) if chap["project_id"] else config.XTTS_OUT_DIR
    path = chap.get("audio_file_path")
    chap["has_wav"] = False
    chap["has_mp3"] = False
    chap["has_m4a"] = False

    if path:
        full_path = pdir / path
        if full_path.exists():
            if path.endswith(".wav"): chap["has_wav"] = True
            elif path.endswith(".mp3"): chap["has_mp3"] = True
            elif path.endswith(".m4a"): chap["has_m4a"] = True

    stem = chap["id"]
    if not chap["has_wav"] and (pdir / f"{stem}.wav").exists(): chap["has_wav"] = True
    if not chap["has_mp3"] and (pdir / f"{stem}.mp3").exists(): chap["has_mp3"] = True
    if not chap["has_m4a"] and (pdir / f"{stem}.m4a").exists(): chap["has_m4a"] = True

    if chap["audio_status"] == "done" and not chap["has_wav"]:
        if chap["has_mp3"] or chap["has_m4a"]:
            chap["has_wav"] = True

    return chap

def list_chapters(project_id: str) -> List[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT c.*, 
                (SELECT COUNT(*) FROM chapter_segments WHERE chapter_id = c.id) as total_segments_count,
                (SELECT COUNT(*) FROM chapter_segments WHERE chapter_id = c.id AND audio_status = 'done') as done_segments_count
                FROM chapters c 
                WHERE project_id = ? 
                ORDER BY sort_order ASC
            """, (project_id,))
            rows = [dict(row) for row in cursor.fetchall()]

    from .. import config
    pdir = config.get_project_audio_dir(project_id) if project_id else config.XTTS_OUT_DIR

    for chap in rows:
        path = chap.get("audio_file_path")
        chap["has_wav"] = False
        chap["has_mp3"] = False
        chap["has_m4a"] = False

        if path:
            full_path = pdir / path
            if full_path.exists():
                if path.endswith(".wav"): chap["has_wav"] = True
                elif path.endswith(".mp3"): chap["has_mp3"] = True
                elif path.endswith(".m4a"): chap["has_m4a"] = True

        stem = chap["id"]
        if not chap["has_wav"] and (pdir / f"{stem}.wav").exists(): chap["has_wav"] = True
        if not chap["has_mp3"] and (pdir / f"{stem}.mp3").exists(): chap["has_mp3"] = True
        if not chap["has_m4a"] and (pdir / f"{stem}.m4a").exists(): chap["has_m4a"] = True

        if chap["audio_status"] == "done" and not chap["has_wav"]:
            if chap["has_mp3"] or chap["has_m4a"]:
                 chap["has_wav"] = True

    return rows

def update_chapter(chapter_id: str, **updates) -> bool:
    if not updates: return False
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            fields = []
            values = []
            for k, v in updates.items():
                if k == "text_content" and v is not None:
                    v = v.replace("\r\n", "\n")
                fields.append(f"{k} = ?")
                values.append(v)

            if "text_content" in updates:
                fields.append("text_last_modified = ?")
                values.append(time.time())

            values.append(chapter_id)
            cursor.execute(f"UPDATE chapters SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()

            if "text_content" in updates:
                from .segments import sync_chapter_segments
                sync_chapter_segments(chapter_id, updates["text_content"])

            return cursor.rowcount > 0

def delete_chapter(chapter_id: str) -> bool:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM chapter_segments WHERE chapter_id = ?", (chapter_id,))
            cursor.execute("DELETE FROM processing_queue WHERE chapter_id = ?", (chapter_id,))
            cursor.execute("DELETE FROM chapters WHERE id = ?", (chapter_id,))
            conn.commit()
            return cursor.rowcount > 0

def reorder_chapters(chapter_ids: List[str]):
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            for idx, cid in enumerate(chapter_ids):
                cursor.execute("UPDATE chapters SET sort_order = ? WHERE id = ?", (idx, cid))
            conn.commit()

def reset_chapter_audio(chapter_id: str):
    """Resets the audio generation status of a chapter and all its segments to unprocessed."""
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()

            # 1. Get project info to find paths
            cursor.execute("SELECT project_id, audio_file_path FROM chapters WHERE id = ?", (chapter_id,))
            row = cursor.fetchone()
            if not row: return False
            project_id = row['project_id']

            # 2. Cleanup physical files if they exist
            from .. import config
            pdir = config.get_project_audio_dir(project_id) if project_id else config.XTTS_OUT_DIR
            audio_file = row['audio_file_path']
            if audio_file:
                audio_path = pdir / audio_file
                if audio_path.exists():
                    audio_path.unlink()

            # Also check for .wav if audio_file_path was .mp3 and vice versa
            stem = chapter_id
            for ext in ['.wav', '.mp3']:
                p = pdir / f"{stem}{ext}"
                if p.exists(): p.unlink()

            # 3. Reset database fields for chapter
            cursor.execute("""
                UPDATE chapters 
                SET audio_status = 'unprocessed', 
                    audio_file_path = NULL, 
                    audio_generated_at = NULL, 
                    audio_length_seconds = NULL 
                WHERE id = ?
            """, (chapter_id,))

            # 4. Reset database fields for segments
            cursor.execute("""
                UPDATE chapter_segments
                SET audio_status = 'unprocessed',
                    audio_file_path = NULL,
                    audio_generated_at = NULL
                WHERE chapter_id = ?
            """, (chapter_id,))

            # 5. Remove from processing_queue if it's there
            cursor.execute("DELETE FROM processing_queue WHERE chapter_id = ?", (chapter_id,))

            conn.commit()
            return True
