import sqlite3
import time
import uuid
import json
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
import threading

# Use a connection pool or a single connection with a lock
_db_lock = threading.Lock()
DB_PATH = Path(os.getenv("DB_PATH", "audiobook_studio.db"))

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()

            # Projects table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    series TEXT,
                    author TEXT,
                    cover_image_path TEXT,
                    created_at REAL,
                    updated_at REAL
                )
            """)

            # Chapters table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS chapters (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    text_content TEXT,
                    sort_order INTEGER,
                    audio_status TEXT DEFAULT 'unprocessed',
                    audio_file_path TEXT,
                    audio_generated_at REAL,
                    audio_length_seconds REAL,
                    text_last_modified REAL,
                    predicted_audio_length REAL,
                    char_count INTEGER,
                    word_count INTEGER,
                    FOREIGN KEY (project_id) REFERENCES projects (id)
                )
            """)

            # Processing Queue table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS processing_queue (
                    id TEXT PRIMARY KEY,
                    project_id TEXT,
                    chapter_id TEXT,
                    split_part INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'queued',
                    created_at REAL,
                    completed_at REAL,
                    FOREIGN KEY (project_id) REFERENCES projects (id),
                    FOREIGN KEY (chapter_id) REFERENCES chapters (id)
                )
            """)

            # Characters table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS characters (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    speaker_profile_name TEXT,
                    default_emotion TEXT,
                    color TEXT DEFAULT '#8b5cf6',
                    FOREIGN KEY (project_id) REFERENCES projects (id)
                )
            """)

            # Chapter Segments table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS chapter_segments (
                    id TEXT PRIMARY KEY,
                    chapter_id TEXT NOT NULL,
                    segment_order INTEGER NOT NULL,
                    text_content TEXT NOT NULL,
                    sanitized_text TEXT,
                    character_id TEXT,
                    speaker_profile_name TEXT,
                    audio_file_path TEXT,
                    audio_status TEXT DEFAULT 'unprocessed',
                    audio_generated_at REAL,
                    FOREIGN KEY (chapter_id) REFERENCES chapters (id),
                    FOREIGN KEY (character_id) REFERENCES characters (id)
                )
            """)

            # Migration: Ensure speaker_profile_name exists in chapter_segments
            try:
                cursor.execute("ALTER TABLE chapter_segments ADD COLUMN speaker_profile_name TEXT")
            except sqlite3.OperationalError:
                # Already exists
                pass

            # Speakers table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS speakers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    default_profile_name TEXT,
                    created_at REAL,
                    updated_at REAL
                )
            """)
            # Migration
            try:
                cursor.execute("ALTER TABLE chapter_segments ADD COLUMN sanitized_text TEXT")
            except:
                pass

            conn.commit()

# --- Project Functions ---
def create_project(name: str, series: Optional[str] = None, author: Optional[str] = None, cover_image_path: Optional[str] = None) -> str:
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
            # Delete related characters
            cursor.execute("DELETE FROM characters WHERE project_id = ?", (project_id,))
            # Delete related segments implicitly if we delete chapters, or explicitly
            cursor.execute("DELETE FROM chapter_segments WHERE chapter_id IN (SELECT id FROM chapters WHERE project_id = ?)", (project_id,))
            cursor.execute("DELETE FROM processing_queue WHERE project_id = ?", (project_id,))
            cursor.execute("DELETE FROM chapters WHERE project_id = ?", (project_id,))
            cursor.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            conn.commit()
            return cursor.rowcount > 0

# --- Character Functions ---
def create_character(project_id: str, name: str, speaker_profile_name: Optional[str] = None, default_emotion: str = "Neutral", **updates) -> str:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            char_id = str(uuid.uuid4())
            color = updates.get('color', '#8b5cf6')
            cursor.execute("""
                INSERT INTO characters (id, project_id, name, speaker_profile_name, default_emotion, color)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (char_id, project_id, name, speaker_profile_name, default_emotion, color))
            conn.commit()
            return char_id

def get_characters(project_id: str) -> List[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM characters WHERE project_id = ? ORDER BY name ASC", (project_id,))
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
            # Nullify assignments in segments
            cursor.execute("UPDATE chapter_segments SET character_id = NULL WHERE character_id = ?", (character_id,))
            cursor.execute("DELETE FROM characters WHERE id = ?", (character_id,))
            conn.commit()
            return cursor.rowcount > 0

# --- Speaker Functions ---
def create_speaker(name: str, default_profile_name: Optional[str] = None) -> str:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            speaker_id = str(uuid.uuid4())
            now = time.time()
            cursor.execute("""
                INSERT INTO speakers (id, name, default_profile_name, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            """, (speaker_id, name, default_profile_name, now, now))
            conn.commit()
            return speaker_id

def get_speaker(speaker_id: str) -> Optional[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM speakers WHERE id = ?", (speaker_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

def list_speakers() -> List[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM speakers ORDER BY name ASC")
            return [dict(row) for row in cursor.fetchall()]

def update_speaker(speaker_id: str, **updates) -> bool:
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
            values.append(speaker_id)
            cursor.execute(f"UPDATE speakers SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
            return cursor.rowcount > 0

def delete_speaker(speaker_id: str) -> bool:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            # Cascade: Revert character mapping to NULL if speaker deleted
            cursor.execute("SELECT name FROM speakers WHERE id = ?", (speaker_id,))
            row = cursor.fetchone()
            if row:
                cursor.execute("UPDATE characters SET speaker_profile_name = NULL WHERE speaker_profile_name = ?", (row[0],))

            cursor.execute("DELETE FROM speakers WHERE id = ?", (speaker_id,))
            conn.commit()
            return cursor.rowcount > 0

def update_voice_profile_references(old_name: str, new_name: str):
    """Updates all references to a voice profile name in the database."""
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            # Update characters
            cursor.execute("UPDATE characters SET speaker_profile_name = ? WHERE speaker_profile_name = ?", (new_name, old_name))
            # Update speakers default profile
            cursor.execute("UPDATE speakers SET default_profile_name = ? WHERE default_profile_name = ?", (new_name, old_name))
            conn.commit()


# --- Chapter Functions ---
def create_chapter(project_id: str, title: str, text_content: Optional[str] = None, sort_order: int = 0, predicted_audio_length: float = 0.0, char_count: int = 0, word_count: int = 0) -> str:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            chapter_id = str(uuid.uuid4())
            now = time.time()
            cursor.execute("""
                INSERT INTO chapters (id, project_id, title, text_content, sort_order, text_last_modified, predicted_audio_length, char_count, word_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (chapter_id, project_id, title, text_content, sort_order, now, predicted_audio_length, char_count, word_count))
            conn.commit()
            return chapter_id

def get_chapter(chapter_id: str) -> Optional[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM chapters WHERE id = ?", (chapter_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

def list_chapters(project_id: str) -> List[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM chapters WHERE project_id = ? ORDER BY sort_order ASC", (project_id,))
            return [dict(row) for row in cursor.fetchall()]

def update_chapter(chapter_id: str, **updates) -> bool:
    if not updates: return False
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            fields = []
            values = []
            for k, v in updates.items():
                fields.append(f"{k} = ?")
                values.append(v)
            if 'text_content' in updates:
                fields.append("text_last_modified = ?")
                values.append(time.time())
            values.append(chapter_id)

            cursor.execute(f"UPDATE chapters SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
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

def reorder_chapters(chapter_ids: List[str]) -> bool:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            for i, cid in enumerate(chapter_ids):
                cursor.execute("UPDATE chapters SET sort_order = ? WHERE id = ?", (i, cid))
            conn.commit()
            return True

def reset_chapter_audio(chapter_id: str) -> bool:
    """Resets the audio generation status of a chapter and all its segments to unprocessed."""
    from .config import get_project_audio_dir
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT project_id, audio_file_path FROM chapters WHERE id = ?", (chapter_id,))
            row = cursor.fetchone()
            if not row:
                return False

            project_id = row[0]
            audio_file = row[1]
            p_audio_dir = get_project_audio_dir(project_id)

            # 1. Delete chapter audio file on disk if it exists
            if project_id and audio_file:
                stem = Path(audio_file).stem
                for ext in [".wav", ".mp3"]:
                    f = p_audio_dir / f"{stem}{ext}"
                    if f.exists():
                        f.unlink()

            # 2. Delete all segment audio files
            cursor.execute("SELECT audio_file_path FROM chapter_segments WHERE chapter_id = ?", (chapter_id,))
            segments = cursor.fetchall()
            for s_row in segments:
                s_audio_file = s_row[0]
                if s_audio_file:
                    f = p_audio_dir / s_audio_file
                    if f.exists():
                        f.unlink()

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

# --- Chapter Segment Functions ---

def get_chapter_segments(chapter_id: str) -> List[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT s.*, c.color as character_color, c.name as character_name
                FROM chapter_segments s
                LEFT JOIN characters c ON s.character_id = c.id
                WHERE s.chapter_id = ? 
                ORDER BY s.segment_order ASC
            """, (chapter_id,))
            return [dict(row) for row in cursor.fetchall()]

def update_segment(segment_id: str, broadcast: bool = True, **updates) -> bool:
    if not updates: return False
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            fields = []
            values = []
            for k, v in updates.items():
                fields.append(f"{k} = ?")
                values.append(v)
            values.append(segment_id)
            cursor.execute(f"UPDATE chapter_segments SET {', '.join(fields)} WHERE id = ?", values)
            conn.commit()
            changed = cursor.rowcount > 0

    # Broadcast via WebSocket if audio_status changed (outside the lock to avoid deadlock)
    if broadcast and changed and "audio_status" in updates:
        try:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT chapter_id FROM chapter_segments WHERE id = ?", (segment_id,))
                row = cursor.fetchone()
                if row:
                    from .web import broadcast_segments_updated
                    broadcast_segments_updated(row["chapter_id"])
        except Exception as e:
            print(f"Warning: Failed to broadcast segment update: {e}")

    return changed

def update_segments_bulk(segment_ids: List[str], **updates) -> bool:
    if not updates or not segment_ids: return False
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            fields = []
            values = []
            for k, v in updates.items():
                fields.append(f"{k} = ?")
                values.append(v)

            placeholders = ",".join(["?"] * len(segment_ids))
            sql = f"UPDATE chapter_segments SET {', '.join(fields)} WHERE id IN ({placeholders})"
            cursor.execute(sql, (*values, *segment_ids))
            conn.commit()
            changed = cursor.rowcount > 0

    # Broadcast via WebSocket if audio_status changed
    if changed:
        try:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT DISTINCT chapter_id FROM chapter_segments WHERE id = ?", (segment_ids[0],))
                row = cursor.fetchone()
                if row:
                    from .web import broadcast_segments_updated
                    broadcast_segments_updated(row["chapter_id"])
        except (ImportError, IndexError, Exception):
            pass
    return changed

def sync_chapter_segments(chapter_id: str, text_content: str):
    """
    Parses the text into sentences (segments) and syncs the chapter_segments table.
    Attempts to preserve IDs and assignments for sentences that haven't changed.
    """
    from .textops import split_sentences, preprocess_text, normalize_newlines

    # Clean newlines and standardize structure before splitting
    text_content = normalize_newlines(text_content)

    # Split into actual sentences while preserving trailing spaces/newlines
    text_content = normalize_newlines(text_content)
    sentences = [s for s, _, _ in split_sentences(text_content, preserve_gap=True)]

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()

            # Fetch existing segments
            cursor.execute("SELECT * FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order ASC", (chapter_id,))
            existing_segments = [dict(row) for row in cursor.fetchall()]

            # Simple matching strategy: if text matches exactly, keep it.
            existing_texts = {seg['text_content']: seg for seg in existing_segments}

            # Delete all existing segments for this chapter
            cursor.execute("DELETE FROM chapter_segments WHERE chapter_id = ?", (chapter_id,))

            # Re-insert in order, preserving IDs and attributes if an exact text match is found
            from .textops import clean_text_for_tts, preprocess_text

            for i, text in enumerate(sentences):
                old_seg = existing_texts.get(text)

                # Compute sanitized version for Performance view (strips brackets/quotes but keeps commas/punc)
                # We use clean_text_for_tts which now does a full but line-by-line safe clean.
                sanitized = clean_text_for_tts(text)

                if old_seg:
                    # Reuse old segment attributes
                    seg_id = old_seg['id']
                    char_id = old_seg['character_id']
                    speaker_profile_name = old_seg.get('speaker_profile_name')
                    audio_path = old_seg['audio_file_path']
                    audio_status = old_seg['audio_status']
                    audio_gen_at = old_seg['audio_generated_at']

                    # Ensure we only reuse an old segment once
                    del existing_texts[text]
                else:
                    # New segment
                    seg_id = str(uuid.uuid4())
                    char_id = None
                    speaker_profile_name = None
                    audio_path = None
                    audio_status = 'unprocessed'
                    audio_gen_at = None

                cursor.execute("""
                    INSERT INTO chapter_segments 
                    (id, chapter_id, segment_order, text_content, sanitized_text, character_id, speaker_profile_name, audio_file_path, audio_status, audio_generated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (seg_id, chapter_id, i, text, sanitized, char_id, speaker_profile_name, audio_path, audio_status, audio_gen_at))

            conn.commit()

            # Broadcast via WebSocket if text changed
            try:
                from .web import broadcast_segments_updated
                broadcast_segments_updated(chapter_id)
            except:
                pass

# --- Processing Queue Functions ---
def add_to_queue(project_id: str, chapter_id: str, split_part: int = 0) -> str:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()

            # Enforce Uniqueness: check if already queued or running
            cursor.execute("""
                SELECT id FROM processing_queue 
                WHERE chapter_id = ? AND split_part = ? AND status IN ('queued', 'running')
            """, (chapter_id, split_part))
            existing = cursor.fetchone()
            if existing:
                return existing[0]

            queue_id = str(uuid.uuid4())
            now = time.time()
            cursor.execute("""
                INSERT INTO processing_queue (id, project_id, chapter_id, split_part, status, created_at)
                VALUES (?, ?, ?, ?, 'queued', ?)
            """, (queue_id, project_id, chapter_id, split_part, now))

            # Also update chapter status to queued if it's unprocessed or done
            # Clear audio_generated_at so the "text changed" alert doesn't show for a stale version
            cursor.execute("UPDATE chapters SET audio_status = 'processing', audio_generated_at = NULL WHERE id = ?", (chapter_id,))
            conn.commit()
            return queue_id

def get_queue() -> List[Dict[str, Any]]:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT q.*, c.title AS chapter_title, p.name AS project_name 
                FROM processing_queue q
                JOIN chapters c ON q.chapter_id = c.id
                JOIN projects p ON q.project_id = p.id
                ORDER BY 
                    CASE WHEN q.status = 'running' THEN 0 ELSE 1 END,
                    q.created_at ASC
            """)
            return [dict(row) for row in cursor.fetchall()]

def clear_queue() -> int:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()

            # 1. Update chapters associated with queued items to be 'unprocessed' again
            # Only for items we are about to delete (status != 'running')
            cursor.execute("""
                UPDATE chapters 
                SET audio_status = 'unprocessed'
                WHERE id IN (SELECT chapter_id FROM processing_queue WHERE status != 'running')
            """)

            # 2. Delete the queue items
            cursor.execute("DELETE FROM processing_queue WHERE status != 'running'")
            conn.commit()
            return cursor.rowcount

def update_queue_item(queue_id: str, status: str, audio_length_seconds: float = 0.0) -> bool:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            now = time.time()
            if status in ['done', 'failed', 'cancelled']:
                cursor.execute("UPDATE processing_queue SET status = ?, completed_at = ? WHERE id = ?", (status, now, queue_id))
            else:
                cursor.execute("UPDATE processing_queue SET status = ? WHERE id = ?", (status, queue_id))

            # Sync Chapter status and audio path
            cursor.execute("SELECT chapter_id, split_part FROM processing_queue WHERE id = ?", (queue_id,))
            row = cursor.fetchone()
            chapter_id = None
            split_part = 0

            if row:
                chapter_id, split_part = row
            else:
                # Fallback: if queue_id is formatted like a chapter ID and exists, use that
                # Sometimes jobs created outside the queue (or recovered) use the chapter_id directly
                # Legacy jobs often have queue_id == chapter_id
                # Or they are of the format chapter_id_split_part
                parts = queue_id.rsplit('_', 1)
                if len(parts) == 2 and parts[1].isdigit():
                    possible_cid = parts[0]
                    possible_split = int(parts[1])
                else:
                    possible_cid = queue_id
                    possible_split = 0

                cursor.execute("SELECT id FROM chapters WHERE id = ?", (possible_cid,))
                if cursor.fetchone():
                    chapter_id = possible_cid
                    split_part = possible_split

            if chapter_id:
                if status == 'done':
                    # Assuming standard naming output by jobs.py
                    audio_path = f"{chapter_id}_{split_part}.mp3"
                    cursor.execute(
                        "UPDATE chapters SET audio_status = 'done', audio_file_path = ?, audio_generated_at = ?, audio_length_seconds = ? WHERE id = ?", 
                        (audio_path, now, audio_length_seconds, chapter_id)
                    )
                elif status == 'running' or status == 'queued':
                    cursor.execute("UPDATE chapters SET audio_status = 'processing', audio_generated_at = NULL WHERE id = ?", (chapter_id,))
                elif status == 'cancelled' or status == 'failed' or status == 'error':
                    cursor.execute("UPDATE chapters SET audio_status = ?, audio_generated_at = NULL WHERE id = ?", ('unprocessed' if status == 'cancelled' else 'error', chapter_id))

            conn.commit()
            return cursor.rowcount > 0

def reconcile_project_audio(project_id: str):
    """
    Scans the project's audio directory and updates the database if audio files exist 
    but the chapter status is not 'done'.
    """
    from .config import get_project_audio_dir
    audio_dir = get_project_audio_dir(project_id)
    if not audio_dir.exists():
        return

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, audio_status, audio_length_seconds FROM chapters WHERE project_id = ?", (project_id,))
            chapters = cursor.fetchall()

            for chap in chapters:
                cid, status, length = chap
                # We check for {cid}.mp3, {cid}.wav, {cid}_0.mp3, {cid}_0.wav (depending on splitting/naming conventions)
                # Looking at earlier logs, it seems they are often named things like 'chapter_name.mp3' or 'seg_ID.wav'
                # however, standard chapters in projects usually use the filename from the job or a formatted name.
                # Actually, jobs use j.chapter_file which is the filename.

                # In this system, 'done' status in chapters usually means the file exists.
                if status != 'done':
                    # Heuristic: Check for common patterns
                    # If we don't have the exact filename stored in the chapter yet, 
                    # we might need to be clever or rely on the fact that most are {cid}.mp3 or similar.
                    # Let's look at how jobs generate them. they use Path(j.chapter_file).stem

                    # Since we don't have the "filename" easily available in the chapter table 
                    # (it might be in 'title' but sanitized), let's look for files that start with cid or match common patterns.
                    pass 

            # Revised approach: Scan the directory and map files to chapters
            if not audio_dir.exists():
                return

            files = os.listdir(audio_dir)
            chapter_files = {} # cid -> list of files

            for f in files:
                if not f.endswith(('.mp3', '.wav', '.m4a')):
                    continue
                stem = Path(f).stem
                cid = stem.split('_')[0]
                if cid not in chapter_files:
                    chapter_files[cid] = []
                chapter_files[cid].append(f)

            for cid, f_list in chapter_files.items():
                # Prefer .mp3 if multiple exist for a chapter
                best_file = f_list[0]
                for f in f_list:
                    if f.endswith('.mp3'):
                        best_file = f
                        break

                cursor.execute("SELECT audio_status, audio_file_path FROM chapters WHERE id = ?", (cid,))
                row = cursor.fetchone()
                if not row:
                    continue

                status, current_path = row
                # Update if not done, or if path is missing/wrong
                if status != 'done' or current_path != best_file:
                    audio_path = audio_dir / best_file

                    # Get duration
                    duration = 0.0
                    import subprocess
                    try:
                        result = subprocess.run(
                            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
                            stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT,
                            text=True,
                            timeout=2
                        )
                        duration = float(result.stdout.strip())
                    except: pass

                    cursor.execute("""
                        UPDATE chapters 
                        SET audio_status = 'done', audio_file_path = ?, audio_length_seconds = ? 
                        WHERE id = ?
                    """, (best_file, duration, cid))

            conn.commit()

def remove_from_queue(queue_id: str) -> bool:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()

            # 1. Reset chapter status before deletion IF it's not already 'done'
            # (Removing a finished job should not wipe the audio record)
            cursor.execute("""
                UPDATE chapters 
                SET audio_status = 'unprocessed'
                WHERE id IN (
                    SELECT chapter_id FROM processing_queue 
                    WHERE id = ? AND status != 'done'
                )
            """, (queue_id,))

            # 2. Delete the queue item
            cursor.execute("DELETE FROM processing_queue WHERE id = ?", (queue_id,))
            conn.commit()
            return cursor.rowcount > 0

def clear_completed_queue() -> int:
    """Deletes all 'done' and 'cancelled' items from the processing queue without resetting chapter status."""
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM processing_queue WHERE status IN ('done', 'cancelled')")
            conn.commit()
            return cursor.rowcount

def reconcile_queue_status(active_ids: List[str]):
    """Sets any 'running' or 'queued' jobs to 'cancelled' if their ID is not in the active_ids list."""
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            # Find jobs that are in processing state but not active in state.json
            placeholders = ','.join(['?'] * len(active_ids)) if active_ids else "''"
            cursor.execute(f"""
                UPDATE processing_queue 
                SET status = 'cancelled', completed_at = ? 
                WHERE status IN ('running', 'queued') AND id NOT IN ({placeholders})
            """, (time.time(), *active_ids))

            # Also sync chapter status
            cursor.execute(f"""
                UPDATE chapters 
                SET audio_status = 'unprocessed' 
                WHERE id IN (
                    SELECT chapter_id FROM processing_queue 
                    WHERE status = 'cancelled' AND id NOT IN ({placeholders})
                )
            """, (*active_ids,))

            conn.commit()

def reorder_queue(queue_ids: List[str]) -> bool:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("BEGIN TRANSACTION")
            try:
                now = time.time()
                for idx, qid in enumerate(queue_ids):
                    cursor.execute("UPDATE processing_queue SET created_at = ? WHERE id = ?", (now + idx, qid))
                conn.commit()
                return True
            except:
                conn.rollback()
                return False

# --- Initialization & Migration ---
def migrate_state_json_to_db():
    from .config import BASE_DIR
    state_file = BASE_DIR / "state.json"
    if not state_file.exists():
        return

    init_db()
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM projects")
            count = cursor.fetchone()[0]
            if count > 0:
                return # Already data in DB, assume migrated

            try:
                raw = state_file.read_text(encoding="utf-8", errors="replace").strip()
                if not raw: return
                state_data = json.loads(raw)
            except Exception as e:
                print(f"Error loading state.json for migration: {e}")
                return

            jobs = state_data.get("jobs", {})
            if not jobs:
                return

            # Create a "Default Project"
            project_id = str(uuid.uuid4())
            now = time.time()
            cursor.execute("""
                INSERT INTO projects (id, name, series, author, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (project_id, "Imported Project", "Legacy Data", None, now, now))

            # Loop jobs and insert chapters
            for jid, jdata in jobs.items():
                chap_id = str(uuid.uuid4())
                audio_status = 'unprocessed'
                if jdata.get("status") == "done": audio_status = 'done'
                elif jdata.get("status") in ["queued", "running"]: audio_status = 'processing'

                cursor.execute("""
                    INSERT INTO chapters (id, project_id, title, sort_order, audio_status, audio_file_path, text_last_modified, predicted_audio_length)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    chap_id, 
                    project_id, 
                    jdata.get("custom_title") or jdata.get("chapter_file", "Unknown Chapter"), 
                    0, 
                    audio_status, 
                    jdata.get("output_mp3") or jdata.get("output_wav"),
                    now,
                    jdata.get("eta_seconds", 0)
                ))
            conn.commit()
            print("Successfully migrated legacy state.json jobs into the database.")

migrate_state_json_to_db()
