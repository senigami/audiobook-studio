import logging
import time
import uuid
from typing import List, Dict, Any, Optional

from .core import _db_lock, get_connection
from ..pathing import secure_join_flat

# Sub-modules
from .chapters_helpers import (
    SAFE_AUDIO_NAME_RE, 
    SAFE_SEGMENT_PREFIX_RE, 
    SAFE_TEXT_NAME_RE,
    _is_safe_flat_name, 
    _canonical_chapter_id, 
    _detect_audio_flags
)
from .chapters_cleanup import (
    cleanup_chapter_audio_files, 
    move_chapter_artifacts_to_trash
)

logger = logging.getLogger(__name__)


def create_chapter(project_id: str, title: str, text_content: Optional[str] = None, sort_order: int = 0, predicted_audio_length: float = 0.0, char_count: int = 0, word_count: int = 0) -> str:
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
            if text_content:
                from .segments import sync_chapter_segments
                sync_chapter_segments(chapter_id, text_content, conn=conn)

            conn.commit()

            # Ensure nested directory exists immediately
            from ..config import get_chapter_dir
            nested_dir = get_chapter_dir(project_id, chapter_id)
            nested_dir.mkdir(parents=True, exist_ok=True)
            secure_join_flat(nested_dir, "segments").mkdir(exist_ok=True)

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
            if not row:
                return None
            chap = dict(row)

    # Rule 3: Disk as Source of Truth - Outside Lock
    from .. import config

    path = chap.get("audio_file_path")

    resolved = config.resolve_chapter_asset_path(
        chap["project_id"], chap["id"], "audio", filename=path
    )
    if not resolved and not path:
        resolved = config.resolve_chapter_asset_path(chap["project_id"], chap["id"], "audio")

    flags = _detect_audio_flags(chap["id"], path, resolved)
    chap.update(flags)

    if chap["audio_status"] == "done" and not chap["has_wav"]:
        if chap["has_mp3"] or chap["has_m4a"]:
            chap["has_wav"] = True

    return chap


def list_chapters(project_id: str) -> List[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT c.*,
                (SELECT COUNT(*) FROM chapter_segments WHERE chapter_id = c.id) as total_segments_count,
                (SELECT COUNT(*) FROM chapter_segments WHERE chapter_id = c.id AND audio_status = 'done') as done_segments_count
                FROM chapters c
                WHERE project_id = ?
                ORDER BY sort_order ASC
            """,
                (project_id,),
            )
            rows = [dict(row) for row in cursor.fetchall()]

    from .. import config

    for chap in rows:
        path = chap.get("audio_file_path")

        resolved = config.resolve_chapter_asset_path(
            chap["project_id"], chap["id"], "audio", filename=path
        )
        if not resolved and not path:
            resolved = config.resolve_chapter_asset_path(
                chap["project_id"], chap["id"], "audio"
            )

        flags = _detect_audio_flags(chap["id"], path, resolved)
        chap.update(flags)

        if chap["audio_status"] == "done" and not chap["has_wav"]:
            if chap["has_mp3"] or chap["has_m4a"]:
                chap["has_wav"] = True

    return rows


def update_chapter(chapter_id: str, **updates) -> bool:
    if not updates: return False
    updated = False
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
            updated = cursor.rowcount > 0
            if updated and is_text_update:
                try:
                    from .segments import sync_chapter_segments
                    sync_chapter_segments(chapter_id, updates["text_content"], conn=conn)
                except Exception as e:
                    logger.error(
                        "Failed to sync segments for chapter %s: %s; rolling back chapter text update",
                        chapter_id, e, exc_info=True,
                    )
                    conn.rollback()
                    return False

            conn.commit()
            return updated


def delete_chapter(chapter_id: str) -> bool:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT project_id, audio_file_path FROM chapters WHERE id = ?", (chapter_id,))
            chapter_row = cursor.fetchone()
            if not chapter_row:
                return False

            project_id = chapter_row["project_id"]
            explicit_files = [chapter_row["audio_file_path"]] if chapter_row["audio_file_path"] else []

            cursor.execute(
                "SELECT id, audio_file_path FROM chapter_segments WHERE chapter_id = ?",
                (chapter_id,),
            )
            segment_rows = cursor.fetchall()
            seg_ids = [row["id"] for row in segment_rows]
            explicit_files.extend(row["audio_file_path"] for row in segment_rows if row["audio_file_path"])

            move_chapter_artifacts_to_trash(project_id, chapter_id, seg_ids, explicit_audio_files=explicit_files)

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
            cursor.execute(
                "SELECT audio_file_path FROM chapter_segments WHERE chapter_id = ? AND audio_file_path IS NOT NULL",
                (chapter_id,),
            )
            explicit_files = [row["audio_file_path"] for row in cursor.fetchall() if row["audio_file_path"]]
            if row["audio_file_path"]:
                explicit_files.append(row["audio_file_path"])

            # 2. Cleanup physical files if they exist
            cleanup_chapter_audio_files(project_id, chapter_id, seg_ids, explicit_files=explicit_files)

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
