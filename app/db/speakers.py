import time
import uuid
import logging
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection

logger = logging.getLogger(__name__)
SAFE_PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")


def _profile_name_or_error(profile_name: str) -> str:
    if not SAFE_PROFILE_NAME_RE.fullmatch(profile_name):
        raise ValueError(f"Invalid profile name: {profile_name}")
    return profile_name


def _existing_profile_dir(voices_dir: Path, profile_name: str) -> Optional[Path]:
    profile_name = _profile_name_or_error(profile_name)
    if not voices_dir.exists():
        return None
    try:
        for entry in voices_dir.iterdir():
            if entry.is_dir() and entry.name == profile_name:
                return entry.resolve()
    except FileNotFoundError:
        return None
    return None


def _new_profile_dir(voices_dir: Path, profile_name: str) -> Path:
    return voices_dir / _profile_name_or_error(profile_name)


def infer_variant_name(profile_name: str) -> str:
    if " - " in profile_name:
        variant = profile_name.split(" - ", 1)[1].strip()
        return variant or "Default"
    return "Default"


def normalize_profile_metadata(profile_name: str, meta: Optional[Dict[str, Any]] = None, persist: bool = False) -> Dict[str, Any]:
    from .. import config
    import json

    meta = dict(meta or {})
    if "variant_name" not in meta or not meta.get("variant_name"):
        meta["variant_name"] = infer_variant_name(profile_name)

    if persist:
        profile_dir = _existing_profile_dir(config.VOICES_DIR, profile_name)
        if not profile_dir:
            return meta
        meta_path = profile_dir / "profile.json"
        try:
            meta_path.write_text(json.dumps(meta, indent=2))
        except Exception:
            logger.warning("Failed to persist normalized profile metadata for %s", profile_name, exc_info=True)

    return meta


def normalize_base_profiles() -> None:
    from .. import config
    import json

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM speakers ORDER BY name ASC")
            speakers = [dict(row) for row in cursor.fetchall()]
    pending_updates = []

    for speaker in speakers:
        try:
            base_dir = _existing_profile_dir(config.VOICES_DIR, speaker["name"])
        except ValueError:
            logger.warning("Skipping invalid speaker path for %s", speaker["name"])
            continue
        if not base_dir:
            continue

        meta_path = base_dir / "profile.json"
        meta: Dict[str, Any] = {}
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text())
            except Exception:
                logger.warning("Failed to read base profile metadata for %s", meta_path, exc_info=True)

        meta = normalize_profile_metadata(speaker["name"], meta, persist=False)

        meta_changed = False
        if meta.get("speaker_id") != speaker["id"]:
            meta["speaker_id"] = speaker["id"]
            meta_changed = True

        if meta_changed or not meta_path.exists():
            try:
                meta_path.write_text(json.dumps(meta, indent=2))
            except Exception:
                logger.warning("Failed to persist base profile metadata for %s", speaker["name"], exc_info=True)

        if speaker.get("default_profile_name") != speaker["name"]:
            pending_updates.append((speaker["name"], time.time(), speaker["id"]))

    if pending_updates:
        with _db_lock:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.executemany(
                    "UPDATE speakers SET default_profile_name = ?, updated_at = ? WHERE id = ?",
                    pending_updates
                )
                conn.commit()

def create_speaker(name: str, default_profile_name: Optional[str] = None) -> str:
    import json
    from .. import config

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
            try:
                profile_dir = _existing_profile_dir(config.VOICES_DIR, pname) or _new_profile_dir(config.VOICES_DIR, pname)
            except ValueError:
                pname = f"speaker-{speaker_id}"
                profile_dir = _new_profile_dir(config.VOICES_DIR, pname)

            # Collision handling: if directory belongs to ANOTHER speaker, use a suffix
            if profile_dir.exists():
                meta_path = profile_dir / "profile.json"
                if meta_path.exists():
                    try:
                        existing_meta = json.loads(meta_path.read_text())
                        if "speaker_id" in existing_meta and existing_meta["speaker_id"] != speaker_id:
                            # Suffix logic
                            idx = 1
                            while _existing_profile_dir(config.VOICES_DIR, f"{pname}_{idx}"):
                                idx += 1
                            pname = f"{pname}_{idx}"
                            profile_dir = _new_profile_dir(config.VOICES_DIR, pname)
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
            meta["variant_name"] = infer_variant_name(pname)
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
                        try:
                            safe_dir = _existing_profile_dir(config.VOICES_DIR, d.name)
                        except ValueError:
                            logger.warning("Skipping invalid voice profile directory %s", d, exc_info=True)
                            continue
                        if not safe_dir:
                            continue
                        meta_path = safe_dir / "profile.json"
                        if meta_path.exists():
                            try:
                                meta = json.loads(meta_path.read_text())
                                if meta.get("speaker_id") == speaker_id:
                                    shutil.rmtree(safe_dir)
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
