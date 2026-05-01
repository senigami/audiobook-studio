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
from .. import config

logger = logging.getLogger(__name__)
SAFE_PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")
from ..voice_engines import DEFAULT_PROFILE_ENGINE, list_tts_engines


def _infer_profile_engine(meta: Optional[Dict[str, Any]] = None) -> str:
    meta = dict(meta or {})
    explicit_engine = str(meta.get("engine") or "").strip().lower()
    if explicit_engine in list_tts_engines():
        return explicit_engine

    from ..engines.behavior import setting_aliases_for

    # Check if any field matches a known alias for a non-default engine
    for engine_id in list_tts_engines():
        if engine_id == DEFAULT_PROFILE_ENGINE:
            continue

        aliases = setting_aliases_for(engine_id)
        for alias_key in aliases:
            if str(meta.get(alias_key) or "").strip():
                return engine_id

    return DEFAULT_PROFILE_ENGINE


def _profile_name_or_error(profile_name: str) -> str:
    if not SAFE_PROFILE_NAME_RE.fullmatch(profile_name):
        raise ValueError(f"Invalid profile name: {profile_name}")
    return profile_name


def _profile_dir_has_assets(profile_dir: Path) -> bool:
    if not profile_dir.exists() or not profile_dir.is_dir():
        return False
    if find_secure_file(profile_dir, "profile.json"):
        return True
    # If it's a v2 voice root (voice.json), it's NOT a playable profile directory itself.
    if find_secure_file(profile_dir, "voice.json"):
        return False
    # For legacy/compatibility and test support, we allow directories to be treated as profiles
    # even if empty or missing profile.json, so they can be discovered/built.
    return True


def _existing_profile_dir(voices_dir: Path, profile_name: str) -> Optional[Path]:
    profile_name = _profile_name_or_error(profile_name)
    voices_root = os.path.abspath(os.path.realpath(os.fspath(voices_dir)))

    # Rule 8: Enumerate trusted root and match by entry.name
    try:
        entries = {e.name: e for e in os.scandir(voices_root) if e.is_dir()}
    except OSError:
        return None

    # 1. Exact match (flat or intentional nested)
    if profile_name in entries:
        exact = entries[profile_name]
        # Rule 8: match for manifest files
        try:
            exact_resolved = os.path.abspath(os.path.realpath(os.fspath(exact)))
            if exact_resolved != voices_root and not exact_resolved.startswith(voices_root + os.sep):
                return None
            if any(entry.is_file() and entry.name == "voice.json" for entry in os.scandir(exact_resolved)):
                try:
                    # Rule 8: Look for "Default" variant
                    sub_entries = {e.name: e for e in os.scandir(exact_resolved) if e.is_dir()}
                    if "Default" in sub_entries:
                        nested_default = sub_entries["Default"]
                        if _profile_dir_has_assets(Path(nested_default.path)):
                            return Path(nested_default.path)
                except OSError:
                    pass
                return None
        except OSError:
            return None

        if _profile_dir_has_assets(exact):
            return exact

    # 2. Nested resolution: "Dracula - Angry" -> voices/Dracula/Angry
    if " - " in profile_name:
        parts = [s.strip() for s in profile_name.split(" - ", 1)]
        if len(parts) == 2:
            v_name, var_name = parts
            if v_name in entries:
                voice_root = entries[v_name]
                try:
                    voice_root_resolved = os.path.abspath(os.path.realpath(voice_root.path))
                    if voice_root_resolved != voices_root and not voice_root_resolved.startswith(voices_root + os.sep):
                        return None
                    sub_entries = {e.name: e for e in os.scandir(voice_root_resolved) if e.is_dir()}
                    if var_name in sub_entries:
                        nested = sub_entries[var_name]
                        if _profile_dir_has_assets(Path(nested.path)):
                            return Path(nested.path)
                except OSError:
                    pass

    # 3. Base voice default: "Dracula" -> voices/Dracula/Default (Fallback)
    if profile_name in entries:
        voice_root = entries[profile_name]
        try:
            voice_root_resolved = os.path.abspath(os.path.realpath(voice_root.path))
            if voice_root_resolved != voices_root and not voice_root_resolved.startswith(voices_root + os.sep):
                return None
            sub_entries = {e.name: e for e in os.scandir(voice_root_resolved) if e.is_dir()}
            if "Default" in sub_entries:
                nested_default = sub_entries["Default"]
                if _profile_dir_has_assets(Path(nested_default.path)):
                    return Path(nested_default.path)
        except OSError:
            pass

    return None


def _new_profile_dir(voices_dir: Path, profile_name: str) -> Path:
    name = _profile_name_or_error(profile_name)

    # Rule 9: Explicit containment check via relative_to
    try:
        if " - " in name:
            parts = [s.strip() for s in name.split(" - ", 1)]
            if len(parts) == 2:
                fullpath = (voices_dir / parts[0] / parts[1]).resolve()
            else:
                fullpath = (voices_dir / name).resolve()
        else:
            fullpath = (voices_dir / name).resolve()

        fullpath.relative_to(voices_dir.resolve())
        return fullpath
    except (OSError, ValueError, RuntimeError):
        raise ValueError(f"Invalid profile path: {profile_name}")


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

    meta = dict(meta or {})
    if "variant_name" not in meta or not meta.get("variant_name"):
        meta["variant_name"] = infer_variant_name(profile_name)
    meta["engine"] = _infer_profile_engine(meta)

    # Normalize aliases (e.g. voxtral_voice_id -> voice_asset_id)
    from ..engines.behavior import setting_aliases_for
    aliases = setting_aliases_for(meta["engine"])
    for source, target in aliases.items():
        if source in meta and target not in meta:
            meta[target] = meta.pop(source)

    if persist:
        profile_dir = _existing_profile_dir(config.VOICES_DIR, profile_name)
        if not profile_dir:
            return meta

        import os
        trusted_voices_root = os.path.abspath(os.fspath(config.VOICES_DIR))
        resolved_pdir = os.path.abspath(os.fspath(profile_dir))

        # Rule 9: Locally visible containment check
        if resolved_pdir.startswith(trusted_voices_root + os.sep):
            meta_path_full = os.path.normpath(os.path.join(resolved_pdir, "profile.json"))
            if meta_path_full.startswith(resolved_pdir + os.sep):
                try:
                    with open(meta_path_full, "w", encoding="utf-8") as f:
                        f.write(json.dumps(meta, indent=2))
                except Exception:
                    logger.warning("Failed to persist normalized profile metadata for %s", profile_name, exc_info=True)

    return meta


def normalize_base_profiles(voices_dir: Optional[Path] = None) -> None:
    voices_dir = voices_dir or config.VOICES_DIR

    with _db_lock:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, default_profile_name FROM speakers ORDER BY name ASC")
            speakers = [dict(row) for row in cursor.fetchall()]

    if not speakers:
        return

    pending_updates = []
    trusted_voices_root = os.path.abspath(os.fspath(voices_dir))

    # Pre-scan voices root once
    try:
        root_entries = {e.name: e for e in os.scandir(trusted_voices_root) if e.is_dir()}
    except OSError:
        return

    for speaker in speakers:
        speaker_name = speaker["name"]
        # Rule 8: Enumerate trusted root and match by entry.name
        if speaker_name not in root_entries:
            continue

        exact = root_entries[speaker_name]
        try:
            resolved_base = os.path.abspath(os.path.realpath(exact.path))
        except OSError:
            continue

        if not resolved_base.startswith(trusted_voices_root + os.sep):
            continue

        # Check for v2 structure
        voice_json = os.path.join(resolved_base, "voice.json")
        if os.path.exists(voice_json):
            # Authoritative V2 structure: resolve to Default variant
            resolved_base = os.path.abspath(os.path.realpath(os.fspath(voices_dir / speaker_name / "Default")))
            if not os.path.isdir(resolved_base):
                continue
            meta_path_full = os.path.normpath(os.path.join(resolved_base, "profile.json"))
        else:
            resolved_base = os.path.abspath(os.path.realpath(os.fspath(voices_dir / speaker_name)))
            if not os.path.isdir(resolved_base):
                continue
            meta_path_full = os.path.normpath(os.path.join(resolved_base, "profile.json"))

        if not os.path.exists(meta_path_full):
            continue

        meta: Dict[str, Any] = {}
        try:
            with open(meta_path_full, "r", encoding="utf-8") as f:
                meta = json.loads(f.read())
        except Exception:
            logger.warning("Failed to read base profile metadata for %s", meta_path_full, exc_info=True)
            continue

        # Normalize in memory
        orig_meta = meta.copy()
        meta = normalize_profile_metadata(speaker_name, meta, persist=False)

        if meta != orig_meta:
            try:
                with open(meta_path_full, "w", encoding="utf-8") as f:
                    f.write(json.dumps(meta, indent=2))
            except Exception:
                logger.warning("Failed to persist base profile metadata for %s", speaker_name, exc_info=True)

        if speaker.get("default_profile_name") != speaker_name:
            pending_updates.append((speaker_name, time.time(), speaker["id"]))

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

    root = voices_dir or config.VOICES_DIR
    if not root.exists():
        return

    # Gather all profile directories (flat and nested)
    all_profile_dirs = []
    for entry in root.iterdir():
        if not entry.is_dir() or not SAFE_PROFILE_NAME_RE.fullmatch(entry.name):
            continue

        # Check if it's a voice root (has voice.json)
        if find_secure_file(entry, "voice.json"):
            for sub in entry.iterdir():
                if sub.is_dir() and _profile_dir_has_assets(sub):
                    all_profile_dirs.append(sub)
        # Check if it's a profile directory directly (flat layout or default variant)
        elif _profile_dir_has_assets(entry):
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

                import os
                trusted_voices_root = os.path.abspath(os.fspath(root))
                resolved_pdir = os.path.abspath(os.fspath(profile_dir))

                if not resolved_pdir.startswith(trusted_voices_root + os.sep):
                    continue

                meta_path_full = os.path.normpath(os.path.join(resolved_pdir, "profile.json"))
                if not meta_path_full.startswith(resolved_pdir + os.sep):
                    continue

                meta: Dict[str, Any] = {}
                if os.path.exists(meta_path_full):
                    try:
                        with open(meta_path_full, "r", encoding="utf-8") as f:
                            meta = json.loads(f.read())
                    except Exception:
                        logger.warning("Failed to read legacy speaker metadata for %s", meta_path_full, exc_info=True)
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

                if meta.get("speaker_id") != speaker["id"] or not os.path.exists(meta_path_full):
                    meta["speaker_id"] = speaker["id"]
                    try:
                        with open(meta_path_full, "w", encoding="utf-8") as f:
                            f.write(json.dumps(meta, indent=2))
                    except Exception:
                        logger.warning("Failed to persist synchronized speaker metadata for %s", meta_path_full, exc_info=True)

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
                    if find_secure_file(d, "voice.json"):
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
                        if find_secure_file(d, "profile.json"):
                            profile_dirs.append(d)
                        else:
                            # Check subdirs for nested variants
                            for sub in d.iterdir():
                                if sub.is_dir() and find_secure_file(sub, "profile.json"):
                                    profile_dirs.append(sub)

                        for pdir in profile_dirs:
                            import os
                            trusted_voices_root = os.path.abspath(os.fspath(config.VOICES_DIR))
                            resolved_pdir = os.path.abspath(os.fspath(pdir))

                            if not resolved_pdir.startswith(trusted_voices_root + os.sep):
                                continue

                            meta_path_full = os.path.normpath(os.path.join(resolved_pdir, "profile.json"))
                            if not meta_path_full.startswith(resolved_pdir + os.sep):
                                continue

                            if os.path.exists(meta_path_full):
                                with open(meta_path_full, "r", encoding="utf-8") as f:
                                    meta = json.loads(f.read())
                                if meta.get("speaker_id") == speaker_id:
                                    # If it's a nested variant, we only delete the variant.
                                    # If it's a flat folder, we delete the folder.
                                    shutil.rmtree(resolved_pdir)
                                    # If the parent is now empty (except for voice.json), delete it too
                                    parent_dir = os.path.dirname(resolved_pdir)
                                    if parent_dir != trusted_voices_root:
                                        remaining = [f for f in os.listdir(parent_dir) if f != "voice.json"]
                                        if not remaining:
                                            shutil.rmtree(parent_dir)
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
