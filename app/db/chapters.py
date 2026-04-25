import logging
import os
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection
from ..pathing import safe_join, safe_join_flat

logger = logging.getLogger(__name__)
SAFE_AUDIO_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")
SAFE_SEGMENT_PREFIX_RE = re.compile(r"^[A-Za-z0-9_-]+$")
SAFE_TEXT_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")


def _is_safe_flat_name(value: Optional[str], pattern: re.Pattern[str]) -> bool:
    if not value or not isinstance(value, str):
        return False
    if value != os.path.basename(value):
        return False
    if "/" in value or "\\" in value:
        return False
    return bool(pattern.fullmatch(value))


def _canonical_chapter_id(chapter_id: str) -> str:
    try:
        return str(uuid.UUID(chapter_id))
    except (ValueError, TypeError, AttributeError):
        raise ValueError(f"Invalid chapter id: {chapter_id}")


def _detect_audio_flags(chapter_id: str, audio_file_path: Optional[str], resolved_path: Optional[Path]) -> Dict[str, bool]:
    flags = {"has_wav": False, "has_mp3": False, "has_m4a": False}

    names = {chapter_id, "chapter"}
    if audio_file_path:
        names.add(Path(audio_file_path).stem)
        names.add(audio_file_path.rsplit(".", 1)[0] if "." in audio_file_path else audio_file_path)

    for base_name in filter(None, names):
        for ext in (".wav", ".mp3", ".m4a"):
            try:
                candidate = safe_join_flat(resolved_path.parent, f"{base_name}{ext}") if resolved_path else None
                if candidate and candidate.exists():
                    flags[f"has_{ext.lstrip('.')}"] = True
            except ValueError:
                continue

    if resolved_path:
        ext = resolved_path.suffix.lower()
        if ext in (".wav", ".mp3", ".m4a"):
            flags[f"has_{ext.lstrip('.')}"] = True

    return flags


def cleanup_chapter_audio_files(
    project_id: Optional[str],
    chapter_id: str,
    segment_ids: Optional[List[str]] = None,
    explicit_files: Optional[List[str]] = None,
    delete_chapter_outputs: bool = True,
) -> bool:
    """Delete chapter-level and selected segment audio files without touching DB state."""
    from .. import config

    # 1. Identify all candidate directories
    legacy_pdir = (
        config.find_existing_project_subdir(project_id, "audio")
        if project_id
        else config.XTTS_OUT_DIR
    )
    nested_pdir = config.get_chapter_dir(project_id, chapter_id) if project_id else None

    target_dirs = []
    if legacy_pdir and legacy_pdir.exists():
        target_dirs.append(legacy_pdir)
    if nested_pdir and nested_pdir.exists():
        target_dirs.append(nested_pdir)
        # Literals are safe
        seg_dir = nested_pdir / "segments"
        if seg_dir.exists():
            target_dirs.append(seg_dir)

    if not target_dirs:
        return True

    # 2. Collect all files from all target directories
    known_files: List[tuple[Path, Path]] = []  # (root, file_path)
    for d in target_dirs:
        resolved_root = d.resolve()
        for entry in d.iterdir():
            if entry.is_file() and entry.suffix.lower() in (".wav", ".mp3", ".m4a"):
                known_files.append((resolved_root, entry))

    # 3. Cleanup explicit files
    for raw_path in explicit_files or []:
        if not raw_path:
            continue
        # For explicit files, we check if they exist in any of our target dirs
        for root, p in list(known_files):
            if p.name == raw_path:
                try:
                    p.unlink()
                    known_files.remove((root, p))
                except Exception:
                    logger.warning("Failed to delete explicit audio file %s", p, exc_info=True)

    # 4. Cleanup chapter outputs
    if delete_chapter_outputs:
        for root, p in list(known_files):
            # In legacy, they start with chapter_id. In nested, they might be "chapter.wav" or chapter_id.wav
            is_legacy_match = p.name.startswith(chapter_id)
            is_nested_match = root == nested_pdir.resolve() and (
                p.name.startswith("chapter.") or p.name.startswith(chapter_id)
            )

            if is_legacy_match or is_nested_match:
                try:
                    p.unlink()
                    known_files.remove((root, p))
                except Exception:
                    logger.warning("Failed to delete chapter audio file %s", p, exc_info=True)

    # 5. Cleanup segment files
    for sid in segment_ids or []:
        if not SAFE_SEGMENT_PREFIX_RE.fullmatch(sid):
            logger.warning("Skipping invalid segment id %s", sid)
            continue
        prefixes = (f"seg_{sid}", f"chunk_{sid}", f"{sid}.")
        for root, p in list(known_files):
            if any(p.name.startswith(prefix) for prefix in prefixes):
                try:
                    p.unlink()
                    known_files.remove((root, p))
                except Exception:
                    logger.warning("Failed to delete segment audio file %s", p, exc_info=True)

    return True


def move_chapter_artifacts_to_trash(
    project_id: Optional[str],
    chapter_id: str,
    segment_ids: Optional[List[str]] = None,
    explicit_audio_files: Optional[List[str]] = None,
) -> bool:
    from .. import config

    if not project_id:
        return True

    try:
        chapter_id = _canonical_chapter_id(chapter_id)
    except ValueError:
        logger.warning("Skipping trash move for invalid chapter id %s", chapter_id)
        return False

    # Rule 9: Explicit containment for dynamic chapter_id
    try:
        # Use project-aware trash dir resolution
        base_trash_path = config.get_project_trash_dir(project_id) or config.TRASH_DIR
        base_trash = os.path.abspath(os.path.normpath(os.fspath(base_trash_path)))
        trash_root_str = os.path.abspath(os.path.normpath(os.path.join(base_trash, chapter_id)))
        if not trash_root_str.startswith(base_trash + os.sep) and trash_root_str != base_trash:
             raise ValueError("Invalid trash root")
        trash_root = Path(trash_root_str)
    except Exception:
        logger.warning("Skipping trash move for invalid chapter id %s", chapter_id)
        return False

    # Literals are safe
    trash_audio_dir = trash_root / "audio"
    trash_text_dir = trash_root / "text"

    trash_audio_dir.mkdir(parents=True, exist_ok=True)
    trash_text_dir.mkdir(parents=True, exist_ok=True)

    # 1. Identify all source candidates
    legacy_audio_dir = (
        config.find_existing_project_subdir(project_id, "audio")
        or config.get_project_audio_dir(project_id)
    )
    legacy_text_dir = (
        config.find_existing_project_subdir(project_id, "text")
        or config.get_project_text_dir(project_id)
    )
    nested_dir = config.get_chapter_dir(project_id, chapter_id)

    # 2. Collect all potential files
    source_files: List[tuple[Path, Path]] = []  # (root, file_path)
    for d in [legacy_audio_dir, legacy_text_dir, nested_dir]:
        if d and d.exists():
            for entry in d.iterdir():
                if entry.is_file():
                    source_files.append((d, entry))
            # Also check segments subdir if nested
            if d == nested_dir:
                seg_dir = d / "segments"
                if seg_dir.exists():
                    for entry in seg_dir.iterdir():
                        if entry.is_file():
                            source_files.append((seg_dir, entry))

    # 3. Filter and move
    audio_moved = 0
    text_moved = 0

    segment_ids_set = set(segment_ids or [])
    explicit_audio_set = set(explicit_audio_files or [])

    for root, src in source_files:
        name = src.name
        is_audio = src.suffix.lower() in (".wav", ".mp3", ".m4a")
        is_text = src.suffix.lower() == ".txt"

        should_move = False
        target_dir = trash_audio_dir if is_audio else trash_text_dir

        # Match logic
        if name in explicit_audio_set:
            should_move = True
        elif name.startswith(chapter_id):
            should_move = True
        elif name == "chapter.wav" or name == "chapter.txt":
            should_move = True
        elif is_audio:
            # Check segments
            for sid in segment_ids_set:
                if name.startswith(f"seg_{sid}") or name.startswith(f"chunk_{sid}") or name == f"{sid}.wav":
                    should_move = True
                    break

        if not should_move:
            continue

        try:
            # Rule 9 for dynamic name
            if not SAFE_AUDIO_NAME_RE.fullmatch(name) and not SAFE_TEXT_NAME_RE.fullmatch(name):
                 continue

            base_target = os.path.abspath(os.path.normpath(os.fspath(target_dir)))
            dest_str = os.path.abspath(os.path.normpath(os.path.join(base_target, name)))
            if not dest_str.startswith(base_target + os.sep) and dest_str != base_target:
                 continue

            dest = Path(dest_str)
            # Ensure unique destination name if multiple sources have same filename
            if dest.exists():
                unique_name = f"{uuid.uuid4().hex}_{name}"
                dest = Path(os.path.abspath(os.path.normpath(os.path.join(base_target, unique_name))))

            shutil.move(str(src), str(dest))
            if is_audio: audio_moved += 1
            else: text_moved += 1
        except Exception as e:
            logger.warning("Failed to move artifact %s to trash: %s", src, e, exc_info=True)

    # 4. If using nested layout and it's empty now (or we want to move the whole folder if it's a full delete)
    # Actually, move_chapter_artifacts_to_trash is often called for specific subsets.
    # If it's a full chapter delete, we might want to move the whole folder.
    # But delete_chapter calls this first, then deletes DB.
    # Let's check if the nested dir still exists and move it if it's a full delete intent.
    # For now, the file-by-file move is safer to avoid moving unrelated files if they somehow got in there.

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
            if text_content:
                from .segments import sync_chapter_segments
                sync_chapter_segments(chapter_id, text_content, conn=conn)

            conn.commit()

            # Ensure nested directory exists immediately
            from ..config import get_chapter_dir
            nested_dir = get_chapter_dir(project_id, chapter_id)
            nested_dir.mkdir(parents=True, exist_ok=True)
            (nested_dir / "segments").mkdir(exist_ok=True)

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
                    import logging
                    logging.getLogger(__name__).error(
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
