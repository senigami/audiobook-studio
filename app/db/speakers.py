import time
import uuid
import logging
import os
import re
import json
import sqlite3
from pathlib import Path
from typing import List, Dict, Any, Optional
from .core import _db_lock, get_connection

logger = logging.getLogger(__name__)
SAFE_PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")
DEFAULT_PROFILE_ENGINE = "xtts"
VALID_PROFILE_ENGINES = {DEFAULT_PROFILE_ENGINE, "voxtral"}


def _infer_profile_engine(meta: Optional[Dict[str, Any]] = None) -> str:
    meta = dict(meta or {})
    explicit_engine = str(meta.get("engine") or "").strip().lower()
    if explicit_engine in VALID_PROFILE_ENGINES:
        return explicit_engine

    voxtral_fields = (
        "voxtral_voice_id",
        "voxtral_model",
        "preview_voxtral_voice_id",
        "preview_voxtral_model",
    )
    if any(str(meta.get(field) or "").strip() for field in voxtral_fields):
        return "voxtral"

    return DEFAULT_PROFILE_ENGINE


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


def _looks_like_uuid(value: Optional[str]) -> bool:
    if not value or not isinstance(value, str):
        return False
    try:
        uuid.UUID(value)
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def infer_speaker_name(profile_name: str, meta: Optional[Dict[str, Any]] = None) -> str:
    meta = dict(meta or {})
    variant_name = str(meta.get("variant_name") or infer_variant_name(profile_name) or "Default").strip() or "Default"
    if " - " not in profile_name:
        return profile_name

    base_name, suffix = profile_name.split(" - ", 1)
    if variant_name == "Default" or suffix.strip() == variant_name:
        return base_name.strip() or profile_name
    return base_name.strip() or profile_name


def is_default_profile_name(profile_name: str, meta: Optional[Dict[str, Any]] = None) -> bool:
    meta = dict(meta or {})
    variant_name = str(meta.get("variant_name") or infer_variant_name(profile_name) or "Default").strip() or "Default"
    return variant_name == "Default" or " - " not in profile_name


def normalize_profile_metadata(profile_name: str, meta: Optional[Dict[str, Any]] = None, persist: bool = False) -> Dict[str, Any]:
    from .. import config

    meta = dict(meta or {})
    if "variant_name" not in meta or not meta.get("variant_name"):
        meta["variant_name"] = infer_variant_name(profile_name)
    meta["engine"] = _infer_profile_engine(meta)

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

def create_speaker(name: str, default_profile_name: Optional[str] = None, speaker_id: Optional[str] = None) -> str:
    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            speaker_id = speaker_id or str(uuid.uuid4())
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


def repair_speakers_from_profiles(voices_dir: Optional[Path] = None) -> None:
    from .. import config

    root = voices_dir or config.VOICES_DIR
    if not root.exists():
        return

    voice_dirs = sorted([
        entry for entry in root.iterdir()
        if entry.is_dir() and SAFE_PROFILE_NAME_RE.fullmatch(entry.name)
    ], key=lambda entry: entry.name.lower())

    if not voice_dirs:
        return

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM speakers ORDER BY name ASC")
            speakers = [dict(row) for row in cursor.fetchall()]

            speakers_by_id = {speaker["id"]: speaker for speaker in speakers}
            speakers_by_name = {speaker["name"]: speaker for speaker in speakers}

            for profile_dir in voice_dirs:
                meta_path = profile_dir / "profile.json"
                meta: Dict[str, Any] = {}
                if meta_path.exists():
                    try:
                        meta = json.loads(meta_path.read_text())
                    except Exception:
                        logger.warning("Failed to read legacy speaker metadata for %s", meta_path, exc_info=True)
                        meta = {}

                meta = normalize_profile_metadata(profile_dir.name, meta, persist=False)
                speaker_name = infer_speaker_name(profile_dir.name, meta)
                is_default_profile = is_default_profile_name(profile_dir.name, meta)
                desired_default_profile_name = profile_dir.name if is_default_profile else None

                raw_speaker_id = meta.get("speaker_id")
                speaker: Optional[Dict[str, Any]] = None

                if isinstance(raw_speaker_id, str) and raw_speaker_id in speakers_by_id:
                    speaker = speakers_by_id[raw_speaker_id]
                elif speaker_name in speakers_by_name:
                    speaker = speakers_by_name[speaker_name]
                else:
                    desired_id = raw_speaker_id if _looks_like_uuid(raw_speaker_id) else None
                    try:
                        created_id = create_speaker(
                            speaker_name,
                            default_profile_name=desired_default_profile_name or profile_dir.name,
                            speaker_id=desired_id,
                        )
                        speaker = get_speaker(created_id)
                    except sqlite3.IntegrityError:
                        speaker = get_speaker(desired_id) if desired_id else None
                        if not speaker and speaker_name in speakers_by_name:
                            speaker = speakers_by_name[speaker_name]
                    if not speaker:
                        continue
                    speakers_by_id[speaker["id"]] = speaker
                    speakers_by_name[speaker["name"]] = speaker

                updates: Dict[str, Any] = {}
                if desired_default_profile_name and speaker.get("default_profile_name") != desired_default_profile_name:
                    updates["default_profile_name"] = desired_default_profile_name
                elif not speaker.get("default_profile_name"):
                    updates["default_profile_name"] = profile_dir.name

                if updates:
                    update_speaker(speaker["id"], **updates)
                    speaker.update(updates)
                    speakers_by_id[speaker["id"]] = speaker
                    speakers_by_name[speaker["name"]] = speaker

                if meta.get("speaker_id") != speaker["id"] or not meta_path.exists():
                    meta["speaker_id"] = speaker["id"]
                    try:
                        meta_path.write_text(json.dumps(meta, indent=2))
                    except Exception:
                        logger.warning("Failed to persist repaired speaker metadata for %s", meta_path, exc_info=True)

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
