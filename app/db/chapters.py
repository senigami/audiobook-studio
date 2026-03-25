import logging
import re
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection

logger = logging.getLogger(__name__)
SAFE_AUDIO_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")
SAFE_SEGMENT_PREFIX_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def cleanup_chapter_audio_files(
    project_id: Optional[str],
    chapter_id: str,
    segment_ids: Optional[List[str]] = None,
    explicit_files: Optional[List[str]] = None,
    delete_chapter_outputs: bool = True,
) -> bool:
    """Delete chapter-level and selected segment audio files without touching DB state."""
    from .. import config

    pdir = config.find_existing_project_subdir(project_id, "audio") if project_id else config.XTTS_OUT_DIR
    if project_id and not pdir:
        return True
    resolved_root = pdir.resolve()
    known_files = {
        entry.name: entry.resolve()
        for entry in pdir.iterdir()
        if entry.is_file() and entry.suffix.lower() in (".wav", ".mp3", ".m4a")
    } if pdir.exists() else {}

    for raw_path in explicit_files or []:
        if not raw_path:
            continue
        path_obj = Path(raw_path)
        if raw_path != path_obj.name or not SAFE_AUDIO_NAME_RE.fullmatch(raw_path):
            logger.warning("Skipping invalid explicit audio file %s", raw_path)
            continue

        resolved = known_files.get(raw_path)
        if not resolved:
            continue
        if not resolved.is_relative_to(resolved_root):
            logger.warning("Skipping explicit audio file outside root %s", resolved)
            continue
        try:
            resolved.unlink()
            known_files.pop(raw_path, None)
        except Exception:
            logger.warning("Failed to delete explicit audio file %s", resolved, exc_info=True)

    if delete_chapter_outputs:
        for name, p in list(known_files.items()):
            if not p.is_relative_to(resolved_root) or not name.startswith(chapter_id):
                continue
            if p.suffix.lower() in (".wav", ".mp3", ".m4a"):
                try:
                    p.unlink()
                    known_files.pop(name, None)
                except Exception:
                    logger.warning("Failed to delete chapter audio file %s", p, exc_info=True)

    for sid in segment_ids or []:
        if not SAFE_SEGMENT_PREFIX_RE.fullmatch(sid):
            logger.warning("Skipping invalid segment id %s", sid)
            continue
        prefix = f"seg_{sid}"
        for name, s_path in list(known_files.items()):
            try:
                if not s_path.is_relative_to(resolved_root) or not name.startswith(prefix):
                    continue
                s_path.unlink()
                known_files.pop(name, None)
            except Exception:
                logger.warning("Failed to delete segment audio file %s", s_path, exc_info=True)

    return True

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
    pdir = config.find_existing_project_subdir(chap["project_id"], "audio") if chap["project_id"] else config.XTTS_OUT_DIR
    existing_names = {
        entry.name
        for entry in pdir.iterdir()
        if entry.is_file() and entry.suffix.lower() in (".wav", ".mp3", ".m4a")
    } if pdir and pdir.exists() else set()
    path = chap.get("audio_file_path")
    chap["has_wav"] = False
    chap["has_mp3"] = False
    chap["has_m4a"] = False

    if path and path in existing_names:
        if path.endswith(".wav"): chap["has_wav"] = True
        elif path.endswith(".mp3"): chap["has_mp3"] = True
        elif path.endswith(".m4a"): chap["has_m4a"] = True

    stem = chap["id"]
    if not chap["has_wav"] and f"{stem}.wav" in existing_names: chap["has_wav"] = True
    if not chap["has_mp3"] and f"{stem}.mp3" in existing_names: chap["has_mp3"] = True
    if not chap["has_m4a"] and f"{stem}.m4a" in existing_names: chap["has_m4a"] = True

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
    pdir = config.find_existing_project_subdir(project_id, "audio") if project_id else config.XTTS_OUT_DIR

    existing_names = {
        entry.name
        for entry in pdir.iterdir()
        if entry.is_file() and entry.suffix.lower() in (".wav", ".mp3", ".m4a")
    } if pdir and pdir.exists() else set()

    for chap in rows:
        path = chap.get("audio_file_path")
        chap["has_wav"] = False
        chap["has_mp3"] = False
        chap["has_m4a"] = False

        if path and path in existing_names:
            if path.endswith(".wav"): chap["has_wav"] = True
            elif path.endswith(".mp3"): chap["has_mp3"] = True
            elif path.endswith(".m4a"): chap["has_m4a"] = True

        stem = chap["id"]
        if not chap["has_wav"] and f"{stem}.wav" in existing_names: chap["has_wav"] = True
        if not chap["has_mp3"] and f"{stem}.mp3" in existing_names: chap["has_mp3"] = True
        if not chap["has_m4a"] and f"{stem}.m4a" in existing_names: chap["has_m4a"] = True

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
            is_text_update = "text_content" in updates
            for k, v in updates.items():
                if k == "text_content" and v is not None:
                    v = v.replace("\r\n", "\n")
                fields.append(f"{k} = ?")
                values.append(v)

            if is_text_update:
                fields.append("text_last_modified = ?")
                values.append(time.time())
                fields.append("audio_status = ?")
                values.append("unprocessed")

            values.append(chapter_id)
            cursor.execute(f"UPDATE chapters SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()

            if is_text_update:
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

            cursor.execute("SELECT id FROM chapter_segments WHERE chapter_id = ?", (chapter_id,))
            seg_rows = cursor.fetchall()
            seg_ids = [s_row["id"] for s_row in seg_rows]

            # 2. Cleanup physical files if they exist
            cleanup_chapter_audio_files(project_id, chapter_id, seg_ids)

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
