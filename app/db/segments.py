import time
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection

def update_segments_status_bulk(segment_ids: List[str], chapter_id: str, status: str, broadcast: bool = True):
    if not segment_ids: return
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            placeholders = ",".join(["?"] * len(segment_ids))
            cursor.execute(f"UPDATE chapter_segments SET audio_status = ? WHERE id IN ({placeholders})", [status] + segment_ids)
            conn.commit()

    if broadcast:
        try:
            from ..api.ws import broadcast_segments_updated
            broadcast_segments_updated(chapter_id)
        except Exception as e:
            print(f"Warning: Failed to broadcast bulk segment update: {e}")

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
            rows = [dict(row) for row in cursor.fetchall()]

            # We need project_id to find the right directory. 
            cursor.execute("SELECT project_id FROM chapters WHERE id = ?", (chapter_id,))
            crow = cursor.fetchone()
            project_id = crow['project_id'] if crow else None

    # Rule 3: Disk as Source of Truth - Outside Lock
    from .. import config
    pdir = config.get_project_audio_dir(project_id) if project_id else config.XTTS_OUT_DIR

    for s in rows:
        if s['audio_status'] == 'done' and s['audio_file_path']:
            if not (pdir / s['audio_file_path']).exists():
                s['audio_status'] = 'unprocessed'
                s['audio_file_path'] = None
    return rows

def update_segment(segment_id: str, broadcast: bool = True, **updates) -> bool:
    if not updates: return False
    changed = False
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

            # If character or voice changed, update chapter timestamp for stale detection
            if changed and ("character_id" in updates or "speaker_profile_name" in updates):
                cursor.execute("SELECT chapter_id FROM chapter_segments WHERE id = ?", (segment_id,))
                row = cursor.fetchone()
                if row:
                    cursor.execute("UPDATE chapters SET text_last_modified = ? WHERE id = ?", (time.time(), row[0]))
                    conn.commit()

    # Broadcast via WebSocket if audio_status changed (outside the lock to avoid deadlock)
    if broadcast and changed and "audio_status" in updates:
        try:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT chapter_id FROM chapter_segments WHERE id = ?", (segment_id,))
                row = cursor.fetchone()
                if row:
                    from ..api.ws import broadcast_segments_updated
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
            query = f"UPDATE chapter_segments SET {', '.join(fields)} WHERE id IN ({placeholders})"
            cursor.execute(query, values + segment_ids)
            conn.commit()
            return cursor.rowcount > 0

def sync_chapter_segments(chapter_id: str, text_content: str):
    """
    Parses the text into sentences (segments) and syncs the chapter_segments table.
    Attempts to preserve IDs and assignments for sentences that haven't changed.
    """
    from .nlp import split_into_sentences
    sentences = split_into_sentences(text_content)

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            # 1. Get existing segments
            cursor.execute("SELECT * FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_order ASC", (chapter_id,))
            existing = [dict(row) for row in cursor.fetchall()]

            # 2. Simple diff/match logic:
            # For each new sentence, see if it exists in the old list at the same or similar position
            # This is a naive implementation; a more robust one would use fuzzy matching or trackers.
            new_segments = []
            for i, sent in enumerate(sentences):
                matched_id = None
                matched_speaker = None
                matched_char = None

                # Check if this sentence text exactly matches an existing one
                for ex in existing:
                    if ex['text_content'] == sent and not any(ns['id'] == ex['id'] for ns in new_segments):
                        matched_id = ex['id']
                        matched_speaker = ex['speaker_profile_name']
                        matched_char = ex['character_id']
                        break

                seg_id = matched_id or str(time.time_ns()) + f"_{i}"
                new_segments.append({
                    'id': seg_id,
                    'chapter_id': chapter_id,
                    'segment_order': i,
                    'text_content': sent,
                    'character_id': matched_char,
                    'speaker_profile_name': matched_speaker,
                    'audio_status': 'unprocessed' if not matched_id else 'done' 
                })

            # 3. Replace all (cleaner than complex sync)
            cursor.execute("DELETE FROM chapter_segments WHERE chapter_id = ?", (chapter_id,))
            for seg in new_segments:
                cursor.execute("""
                    INSERT INTO chapter_segments (id, chapter_id, segment_order, text_content, character_id, speaker_profile_name, audio_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (seg['id'], seg['chapter_id'], seg['segment_order'], seg['text_content'], seg['character_id'], seg['speaker_profile_name'], seg['audio_status']))

            conn.commit()
            return True
