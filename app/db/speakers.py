import time
import uuid
import logging
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection

logger = logging.getLogger(__name__)

def create_speaker(name: str, default_profile_name: Optional[str] = None) -> str:
    import json
    from .. import config
    from pathlib import Path

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

            # Legacy sync: ensure profile directory exists and linked
            pname = default_profile_name or name
            profile_dir = config.VOICES_DIR / pname

            # Collision handling: if directory belongs to ANOTHER speaker, use a suffix
            if profile_dir.exists():
                meta_path = profile_dir / "profile.json"
                if meta_path.exists():
                    try:
                        existing_meta = json.loads(meta_path.read_text())
                        if "speaker_id" in existing_meta and existing_meta["speaker_id"] != speaker_id:
                            # Suffix logic
                            idx = 1
                            while (config.VOICES_DIR / f"{pname}_{idx}").exists():
                                idx += 1
                            pname = f"{pname}_{idx}"
                            profile_dir = config.VOICES_DIR / pname
                    except Exception:
                        logger.debug("Failed to inspect existing voice profile metadata for %s", profile_dir, exc_info=True)

            profile_dir.mkdir(parents=True, exist_ok=True)

            meta_path = profile_dir / "profile.json"
            meta = {}
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text())
                except Exception:
                    logger.debug("Failed to read existing profile metadata for %s", meta_path, exc_info=True)

            meta["speaker_id"] = speaker_id
            if "variant_name" not in meta:
                meta["variant_name"] = "Default"
            if "speed" not in meta:
                meta["speed"] = 1.0

            meta_path.write_text(json.dumps(meta, indent=2))

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
    from .. import config
    import shutil
    import json

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()

            # Find and delete associated profile directories
            # We look for any directory in VOICES_DIR containing a profile.json with matching speaker_id
            if config.VOICES_DIR.exists():
                for d in config.VOICES_DIR.iterdir():
                    if d.is_dir():
                        meta_path = d / "profile.json"
                        if meta_path.exists():
                            try:
                                meta = json.loads(meta_path.read_text())
                                if meta.get("speaker_id") == speaker_id:
                                    shutil.rmtree(d)
                            except Exception:
                                logger.debug("Failed to inspect voice profile metadata for %s", meta_path, exc_info=True)

            cursor.execute("DELETE FROM speakers WHERE id = ?", (speaker_id,))
            conn.commit()
            return cursor.rowcount > 0

def update_voice_profile_references(old_name: str, new_name: str):
    """Updates all references to a voice profile name in the database."""
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            # 1. Update characters table
            cursor.execute("UPDATE characters SET speaker_profile_name = ? WHERE speaker_profile_name = ?", (new_name, old_name))
            # 2. Update chapter_segments table
            cursor.execute("UPDATE chapter_segments SET speaker_profile_name = ? WHERE speaker_profile_name = ?", (new_name, old_name))
            conn.commit()
