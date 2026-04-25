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
from ..pathing import safe_join, safe_join_flat, find_secure_file, secure_join_flat

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


def _profile_dir_has_assets(profile_dir: Path) -> bool:
    if not profile_dir.exists() or not profile_dir.is_dir():
        return False
    if (profile_dir / "profile.json").exists():
        return True
    if (profile_dir / "voice.json").exists():
        return False
    return True


def _existing_profile_dir(voices_dir: Path, profile_name: str) -> Optional[Path]:
    profile_name = _profile_name_or_error(profile_name)
    if not voices_dir.exists() or not voices_dir.is_dir():
        return None

    # Rule 8: Enumerate trusted root and match by entry.name
    try:
        entries = {e.name: e for e in voices_dir.iterdir() if e.is_dir()}
    except OSError:
        return None

    # 1. Exact match (flat or intentional nested)
    if profile_name in entries:
        exact = entries[profile_name]
        # v2: voices/Name/Default
        if (exact / "voice.json").exists():
            try:
                sub_entries = {e.name: e for e in exact.iterdir() if e.is_dir()}
                if "Default" in sub_entries:
                    nested_default = sub_entries["Default"]
                    if _profile_dir_has_assets(nested_default):
                        return nested_default.resolve()
            except OSError:
                pass
        # v1 or flat: voices/Name
        if _profile_dir_has_assets(exact):
            return exact.resolve()

    # 2. Nested resolution: "Dracula - Angry" -> voices/Dracula/Angry
    if " - " in profile_name:
        parts = [s.strip() for s in profile_name.split(" - ", 1)]
        if len(parts) == 2:
            v_name, var_name = parts
            if v_name in entries:
                voice_root = entries[v_name]
                try:
                    sub_entries = {e.name: e for e in voice_root.iterdir() if e.is_dir()}
                    if var_name in sub_entries:
                        nested = sub_entries[var_name]
                        if _profile_dir_has_assets(nested):
                            return nested.resolve()
                except OSError:
                    pass

    # 3. Base voice default: "Dracula" -> voices/Dracula/Default (Fallback)
    if profile_name in entries:
        voice_root = entries[profile_name]
        try:
            sub_entries = {e.name: e for e in voice_root.iterdir() if e.is_dir()}
            if "Default" in sub_entries:
                nested_default = sub_entries["Default"]
                if _profile_dir_has_assets(nested_default):
                    return nested_default.resolve()
        except OSError:
            pass

    return None


def _new_profile_dir(voices_dir: Path, profile_name: str) -> Path:
    name = _profile_name_or_error(profile_name)

    # Rule 9: Explicit containment pattern for new paths
    base_dir = os.path.abspath(os.path.normpath(os.fspath(voices_dir)))

    if " - " in name:
        parts = [s.strip() for s in name.split(" - ", 1)]
        if len(parts) == 2:
            rel_path = os.path.join(parts[0], parts[1])
        else:
            rel_path = name
    else:
        rel_path = name

    fullpath = os.path.abspath(os.path.normpath(os.path.join(base_dir, rel_path)))
    if not fullpath.startswith(base_dir + os.sep):
        raise ValueError(f"Invalid profile path: {profile_name}")

    return Path(fullpath)


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

        # Rule 9: Secure join for literal filename within trusted root
        try:
            meta_path = secure_join_flat(profile_dir, "profile.json")
        except ValueError as e:
             raise ValueError(f"Invalid manifest path for {profile_name}: {e}")
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
        if not meta_path.exists():
             # Check for voice.json if profile.json missing (might be a root folder)
             meta_path = base_dir / "voice.json"

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


def sync_speakers_from_profiles(voices_dir: Optional[Path] = None) -> None:
    from .. import config

    root = voices_dir or config.VOICES_DIR
    if not root.exists():
        return

    # Gather all profile directories (flat and nested)
    all_profile_dirs = []
    for entry in root.iterdir():
        if not entry.is_dir() or not SAFE_PROFILE_NAME_RE.fullmatch(entry.name):
            continue

        # Check if it's a voice root (has voice.json)
        if (entry / "voice.json").exists():
            for sub in entry.iterdir():
                if sub.is_dir() and _profile_dir_has_assets(sub):
                    all_profile_dirs.append(sub)

        # Check if it's a profile directory directly (flat layout or default variant)
        if _profile_dir_has_assets(entry):
            all_profile_dirs.append(entry)

    if not all_profile_dirs:
        return

    voice_dirs = sorted(all_profile_dirs, key=lambda entry: entry.name.lower())

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
                # Calculate effective profile name for virtual flat compatibility
                if profile_dir.parent == root:
                    profile_name = profile_dir.name
                else:
                    profile_name = f"{profile_dir.parent.name} - {profile_dir.name}"
                    if profile_dir.name == "Default":
                        profile_name = profile_dir.parent.name

                meta_path = profile_dir / "profile.json"
                meta: Dict[str, Any] = {}
                if meta_path.exists():
                    try:
                        meta = json.loads(meta_path.read_text())
                    except Exception:
                        logger.warning("Failed to read legacy speaker metadata for %s", meta_path, exc_info=True)
                        meta = {}

                meta = normalize_profile_metadata(profile_name, meta, persist=False)
                speaker_name = infer_speaker_name(profile_name, meta)
                is_default_profile = is_default_profile_name(profile_name, meta)
                desired_default_profile_name = profile_name if is_default_profile else None

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
                            default_profile_name=desired_default_profile_name or profile_name,
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
                    updates["default_profile_name"] = profile_name

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
                        logger.warning("Failed to persist synchronized speaker metadata for %s", meta_path, exc_info=True)

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
                    if not d.is_dir():
                        continue

                    # 1. Voice Root (v2)
                    if (d / "voice.json").exists():
                        try:
                            from ..domain.voices.manifest import load_voice_manifest
                            manifest = load_voice_manifest(d)
                            if manifest.get("id") == speaker_id:
                                shutil.rmtree(d)
                                continue
                        except Exception:
                            pass

                    # 2. Legacy Flat or Nested Variants (Fallback check)
                    # We check all profile.json files in this directory and its subdirectories
                    # actually simpler to just check if it's a profile dir
                    try:
                        profile_dirs = []
                        if (d / "profile.json").exists():
                            profile_dirs.append(d)
                        else:
                            # Check subdirs for nested variants
                            for sub in d.iterdir():
                                if sub.is_dir() and (sub / "profile.json").exists():
                                    profile_dirs.append(sub)

                        for pdir in profile_dirs:
                            meta_path = pdir / "profile.json"
                            if meta_path.exists():
                                meta = json.loads(meta_path.read_text())
                                if meta.get("speaker_id") == speaker_id:
                                    # If it's a nested variant, we only delete the variant.
                                    # If it's a flat folder, we delete the folder.
                                    shutil.rmtree(pdir)
                                    # If the parent is now empty (except for voice.json), delete it too
                                    if pdir.parent != config.VOICES_DIR:
                                        remaining = [f for f in pdir.parent.iterdir() if f.name != "voice.json"]
                                        if not remaining:
                                            shutil.rmtree(pdir.parent)
                    except Exception:
                        logger.debug("Failed to inspect voice profile metadata for %s", d, exc_info=True)

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
