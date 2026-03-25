import logging
import os
import re
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection

logger = logging.getLogger(__name__)
SAFE_AUDIO_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")
SAFE_SEGMENT_PREFIX_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def _contained_audio_path(base_dir: Path, name: str) -> Path:
    if not SAFE_AUDIO_NAME_RE.fullmatch(name):
        raise ValueError(f"Invalid audio name: {name}")
    base_path = os.path.abspath(os.path.normpath(os.fspath(base_dir)))
    fullpath = os.path.abspath(os.path.normpath(os.path.join(base_path, name)))
    if not fullpath.startswith(base_path + os.sep) and fullpath != base_path:
        raise ValueError(f"Invalid audio path: {name}")
    return Path(fullpath)


def cleanup_chapter_audio_files(
    project_id: Optional[str],
    chapter_id: str,
    segment_ids: Optional[List[str]] = None,
    explicit_files: Optional[List[str]] = None,
) -> bool:
    """Delete chapter-level and selected segment audio files without touching DB state."""
    from .. import config

    pdir = config.get_project_audio_dir(project_id) if project_id else config.XTTS_OUT_DIR
    resolved_root = pdir.resolve()

    for raw_path in explicit_files or []:
        if not raw_path:
            continue
        candidate_names = []
        path_obj = Path(raw_path)
        if path_obj.name:
            candidate_names.append(path_obj.name)
        if raw_path == path_obj.name and raw_path not in candidate_names:
            candidate_names.append(raw_path)

        for candidate_name in candidate_names:
            try:
                resolved = _contained_audio_path(pdir, candidate_name).resolve()
            except ValueError:
                logger.warning("Skipping invalid explicit audio file %s", raw_path)
                continue
            if not resolved.is_relative_to(resolved_root):
                logger.warning("Skipping explicit audio file outside root %s", resolved)
                continue
            if resolved.exists() and resolved.is_file():
                try:
                    resolved.unlink()
                except Exception:
                    logger.warning("Failed to delete explicit audio file %s", resolved, exc_info=True)

    for p in pdir.iterdir():
        try:
            p = p.resolve()
        except Exception:
            logger.warning("Skipping unresolved chapter audio path %s", p, exc_info=True)
            continue
        if not p.is_relative_to(resolved_root) or not p.name.startswith(chapter_id):
            continue
        if p.is_file() and p.suffix.lower() in (".wav", ".mp3", ".m4a"):
            try:
                p.unlink()
            except Exception:
                logger.warning("Failed to delete chapter audio file %s", p, exc_info=True)

    for sid in segment_ids or []:
        if not SAFE_SEGMENT_PREFIX_RE.fullmatch(sid):
            logger.warning("Skipping invalid segment id %s", sid)
            continue
        prefix = f"seg_{sid}"
        for s_path in pdir.iterdir():
            try:
                s_path = s_path.resolve()
                if not s_path.is_relative_to(resolved_root) or not s_path.name.startswith(prefix):
                    continue
                s_path.unlink()
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
    pdir = config.get_project_audio_dir(chap["project_id"]) if chap["project_id"] else config.XTTS_OUT_DIR
    path = chap.get("audio_file_path")
    chap["has_wav"] = False
    chap["has_mp3"] = False
    chap["has_m4a"] = False

    if path:
        full_path = None
        try:
            full_path = _contained_audio_path(pdir, path)
        except ValueError:
            full_path = None
        if full_path and full_path.exists():
            if path.endswith(".wav"): chap["has_wav"] = True
            elif path.endswith(".mp3"): chap["has_mp3"] = True
            elif path.endswith(".m4a"): chap["has_m4a"] = True

    stem = chap["id"]
    if not chap["has_wav"] and _contained_audio_path(pdir, f"{stem}.wav").exists(): chap["has_wav"] = True
    if not chap["has_mp3"] and _contained_audio_path(pdir, f"{stem}.mp3").exists(): chap["has_mp3"] = True
    if not chap["has_m4a"] and _contained_audio_path(pdir, f"{stem}.m4a").exists(): chap["has_m4a"] = True

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
            full_path = None
            try:
                full_path = _contained_audio_path(pdir, path)
            except ValueError:
                full_path = None
            if full_path and full_path.exists():
                if path.endswith(".wav"): chap["has_wav"] = True
                elif path.endswith(".mp3"): chap["has_mp3"] = True
                elif path.endswith(".m4a"): chap["has_m4a"] = True

        stem = chap["id"]
        if not chap["has_wav"] and _contained_audio_path(pdir, f"{stem}.wav").exists(): chap["has_wav"] = True
        if not chap["has_mp3"] and _contained_audio_path(pdir, f"{stem}.mp3").exists(): chap["has_mp3"] = True
        if not chap["has_m4a"] and _contained_audio_path(pdir, f"{stem}.m4a").exists(): chap["has_m4a"] = True

        if chap["audio_status"] == "done" and not chap["has_wav"]:
            if chap["has_mp3"] or chap["has_m4a"]:
                 chap["has_wav"] = True

    return rows

def update_chapter(chapter_id: str, **updates) -> bool:
    if not updates: return False
    stale_audio_path = None
    project_id = None
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            if "text_content" in updates:
                cursor.execute("SELECT project_id, audio_file_path FROM chapters WHERE id = ?", (chapter_id,))
                current = cursor.fetchone()
                if current:
                    project_id = current["project_id"]
                    stale_audio_path = current["audio_file_path"]
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
                fields.extend([
                    "audio_status = ?",
                    "audio_file_path = ?",
                    "audio_generated_at = ?",
                    "audio_length_seconds = ?",
                ])
                values.extend([
                    "unprocessed",
                    None,
                    None,
                    None,
                ])

            values.append(chapter_id)
            cursor.execute(f"UPDATE chapters SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()

            if is_text_update:
                from .segments import sync_chapter_segments
                sync_chapter_segments(chapter_id, updates["text_content"])
                if stale_audio_path:
                    cleanup_chapter_audio_files(project_id, chapter_id, explicit_files=[stale_audio_path])

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
