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
from ..utils.pathing import safe_join, safe_join_flat, find_secure_file, secure_join_flat
from ..core import config
from ..engines.voice_engines import get_default_profile_engine, list_tts_engines

logger = logging.getLogger(__name__)
SAFE_PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")

DEFAULT_SPEAKER_TEST_TEXT = (
    "The mysterious traveler, bathed in the soft glow of the azure twilight, "
    "whispered of ancient treasures buried beneath the jagged mountains. "
    "'Zephyr,' he exclaimed, his voice a mixture of awe and trepidation, "
    "'the path is treacherous, yet the reward is beyond measure.' "
    "Around them, the vibrant forest hummed with rhythmic sounds while a "
    "cold breeze carried the scent of wet earth and weathered stone."
)


def _infer_profile_engine(meta: Optional[Dict[str, Any]] = None) -> str:
    """Infer the target engine for a voice profile."""
    meta = dict(meta or {})
    return str(meta.get("engine") or "").strip().lower()


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
    # Check for loose wav discovery
    try:
        for entry in os.scandir(profile_dir):
            if entry.is_file() and entry.name.endswith(".wav"):
                return True
    except OSError:
        pass
    return False


def _existing_profile_dir(profile_name: str) -> Optional[Path]:
    """Internal helper to resolve an existing profile directory in V2 nested storage."""
    voices_dir = config.VOICES_DIR
    profile_name = _profile_name_or_error(profile_name)
    voices_root = os.fspath(voices_dir) if hasattr(voices_dir, "resolve") else str(voices_dir)
    voices_root = os.path.abspath(os.path.realpath(voices_root))

    # Rule 8: Enumerate trusted root and match by entry.name
    try:
        entries = {e.name: e for e in os.scandir(voices_root) if e.is_dir()}
    except OSError:
        return None

    # V2 Nested resolution: "Dracula - Angry" -> voices/Dracula/Angry
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

    # V2 Base voice default: "Dracula" -> voices/Dracula/Default
    if profile_name in entries:
        voice_root = entries[profile_name]
        try:
            voice_root_resolved = os.path.abspath(os.path.realpath(voice_root.path))
            if voice_root_resolved != voices_root and not voice_root_resolved.startswith(voices_root + os.sep):
                return None

            voice_root_path = Path(voice_root_resolved)

            # If it's a V2 voice root (has voice.json), we prefer the "Default" sub-variant.
            if find_secure_file(voice_root_path, "voice.json"):
                sub_entries = {e.name: e for e in os.scandir(voice_root_resolved) if e.is_dir()}
                # Use the explicitly marked default variant from voice.json if Default is missing
                target_variant = "Default"
                if "Default" not in sub_entries:
                    try:
                        with open(voice_root_path / "voice.json", "r", encoding="utf-8") as f:
                            v_meta = json.loads(f.read())
                            target_variant = v_meta.get("default_variant", "Default")
                    except Exception:
                        pass
                if target_variant in sub_entries:
                    nested_target = sub_entries[target_variant]
                    if _profile_dir_has_assets(Path(nested_target.path)):
                        return Path(nested_target.path)
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


def _resolve_existing_profile_name(profile_name_or_id: str) -> Optional[str]:
    """Resolve a speaker name/ID/profile name to the best existing profile identifier."""
    from ..db.state import get_settings
    default_settings = get_settings()
    target_profile = profile_name_or_id or default_settings.get("default_speaker_profile") or "Dark Fantasy"

    candidates: list[str] = []

    def add_candidate(name: Optional[str]):
        if name and name not in candidates:
            candidates.append(name)

    add_candidate(target_profile)

    speaker_name: Optional[str] = None
    speaker_default_profile: Optional[str] = None
    if _looks_like_uuid(target_profile):
        spk = get_speaker(target_profile)
        if spk:
            speaker_name = spk.get("name")
            speaker_default_profile = spk.get("default_profile_name")
    else:
        spk_match = next((s for s in list_speakers() if s["name"] == target_profile), None)
        if spk_match:
            speaker_name = spk_match.get("name")
            speaker_default_profile = spk_match.get("default_profile_name")

    if speaker_name:
        add_candidate(speaker_name)
    add_candidate(speaker_default_profile)

    prefix_source = speaker_name or (None if _looks_like_uuid(target_profile) else target_profile)
    voices_root = config.VOICES_DIR
    if prefix_source and voices_root.exists():
        # Nested layout candidates
        v_dir_path = voices_root / prefix_source
        if v_dir_path.exists() and v_dir_path.is_dir():
            try:
                for entry in sorted(os.scandir(v_dir_path), key=lambda e: e.name):
                    if entry.is_dir():
                        if find_secure_file(Path(entry.path), "profile.json"):
                            add_candidate(f"{prefix_source} - {entry.name}")
            except OSError:
                pass

    for candidate in candidates:
        try:
            p = _existing_profile_dir(candidate)
        except ValueError:
            continue
        if p:
            return candidate

    return None


def get_profile_engine(profile_name_or_id: Optional[str], fallback_engine: Optional[str] = None) -> str:
    """Resolve the engine ID for a profile name or speaker ID without depending on app.jobs."""
    if not profile_name_or_id:
        return ""

    # 1. Resolve canonical profile name
    target_profile = _resolve_existing_profile_name(profile_name_or_id)
    if not target_profile:
        return ""

    # 2. Find profile directory and read metadata
    pdir = _existing_profile_dir(target_profile)
    if not pdir:
        return ""

    meta_file = find_secure_file(pdir, "profile.json")
    if not meta_file:
        return ""

    try:
        with open(meta_file, "r", encoding="utf-8", errors="replace") as f:
            meta = json.loads(f.read())
    except Exception:
        meta = {}

    explicit_engine = meta.get("engine")
    if not explicit_engine:
        return ""

    from ..engines.voice_engines import normalize_tts_engine
    return normalize_tts_engine(explicit_engine, settings=None)


def get_profile_dir(profile_name: str) -> Path:
    """Resolve the directory for a voice profile, supporting canonical name resolution."""
    exact = _existing_profile_dir(profile_name)
    if exact:
        return exact

    resolved_name = _resolve_existing_profile_name(profile_name)
    if resolved_name and resolved_name != profile_name:
        resolved = _existing_profile_dir(resolved_name)
        if resolved:
            return resolved
    return _new_profile_dir(config.VOICES_DIR, profile_name)


def get_profile_wavs(profile_name_or_id: str) -> Optional[str]:
    """Returns a comma-separated string of absolute paths for the given profile or speaker ID."""
    target_profile = _resolve_existing_profile_name(profile_name_or_id)
    if not target_profile:
        return None

    try:
        p = get_profile_dir(target_profile)
    except ValueError:
        return None

    wavs = sorted(w for w in p.glob("*.wav") if w.name != "sample.wav")
    if not wavs:
        wavs = sorted(p.glob("sample.wav"))
    if not wavs:
        return None

    return ",".join([str(w.absolute()) for w in wavs])


def get_speaker_settings(profile_name_or_id: str) -> dict:
    """Returns metadata (like speed and test text) for a profile or speaker ID, falling back to global settings."""
    from ..db.state import get_settings
    defaults = get_settings()

    res = {
        "speed": float(defaults.get("speed", 1.0)),
        "test_text": DEFAULT_SPEAKER_TEST_TEXT,
        "speaker_id": None,
        "variant_name": None,
        "built_samples": [],
        "engine": "",
    }
    # Resolve to canonical name if it exists
    target_profile = _resolve_existing_profile_name(profile_name_or_id)
    if not target_profile:
         return res

    pdir = _existing_profile_dir(target_profile)
    if not pdir:
        return res

    meta_file = find_secure_file(pdir, "profile.json")
    if not meta_file:
        meta = normalize_profile_metadata(target_profile, {}, persist=True)
    else:
        try:
            with open(meta_file, "r", encoding="utf-8", errors="replace") as f:
                meta = json.loads(f.read())
        except Exception:
            meta = {}
        meta = normalize_profile_metadata(target_profile, meta, persist=True)

    # Extract generic fields first
    for k in res:
        if k in meta:
            res[k] = meta[k]

    # Then extract engine-specific settings via behavior helper
    from ..engines.behavior import extract_engine_settings
    engine_settings = extract_engine_settings(res["engine"], meta)
    res.update(engine_settings)

    # Ensure preview fields are also extracted (preserving the 'preview_' prefix)
    for k, v in meta.items():
        if k.startswith("preview_"):
            res[k] = v

    return res


def update_speaker_settings(profile_name: str, **updates) -> bool:
    """Updates metadata for a profile in its profile.json."""
    try:
        target_profile = _resolve_existing_profile_name(profile_name)
    except ValueError:
        return False
    if not target_profile or target_profile == profile_name:
        # If resolution failed or returned the same name, trust the input name.
        # This prevents over-resolving "Dracula - Angry" to "Dracula".
        try:
            target_profile = _profile_name_or_error(profile_name)
        except ValueError:
            return False

    pdir = _existing_profile_dir(target_profile)
    if not pdir:
        pdir = _new_profile_dir(config.VOICES_DIR, target_profile)

    # Rule 9: Locally visible containment check
    try:
        pdir.resolve().relative_to(config.VOICES_DIR.resolve())
    except (ValueError, OSError, RuntimeError):
        logger.warning("Blocking update_speaker_settings for out-of-bounds path: %s", pdir)
        return False

    meta_file = pdir / "profile.json"
    pdir.mkdir(parents=True, exist_ok=True)

    meta = {}
    if meta_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8", errors="replace") as f:
                meta = json.loads(f.read())
        except Exception:
            meta = {}

    for k, v in updates.items():
        if v is None:
            if k in meta:
                del meta[k]
        else:
            meta[k] = v

    try:
        with open(meta_file, "w", encoding="utf-8") as fp:
            fp.write(json.dumps(meta, indent=2))
        return True
    except Exception:
        logger.exception("Failed to update speaker settings for %s", profile_name)
        return False


def _get_minimal_save_metadata(profile_name: str, meta: Dict[str, Any], orig_meta: Dict[str, Any]) -> Dict[str, Any]:
    save_meta = orig_meta.copy()

    # Normalize aliases in save_meta
    from ..engines.behavior import setting_aliases_for
    engine = meta.get("engine") or _infer_profile_engine(meta)
    aliases = setting_aliases_for(engine)
    for source, target in aliases.items():
        if source in save_meta and target not in save_meta:
            save_meta[target] = save_meta.pop(source)

    # Retain variant_name only if it was explicitly present
    if "variant_name" in orig_meta:
        if not orig_meta.get("variant_name"):
            save_meta["variant_name"] = meta.get("variant_name") or infer_variant_name(profile_name)
    else:
        save_meta.pop("variant_name", None)

    # Retain engine only if it was explicitly present
    if "engine" in orig_meta:
        if not orig_meta.get("engine"):
            save_meta["engine"] = meta.get("engine") or _infer_profile_engine(meta)
    else:
        save_meta.pop("engine", None)

    return save_meta


def normalize_profile_metadata(profile_name: str, meta: Optional[Dict[str, Any]] = None, persist: bool = False) -> Dict[str, Any]:

    meta = dict(meta or {})
    orig_meta = meta.copy()
    if "variant_name" not in meta or not meta.get("variant_name"):
        meta["variant_name"] = infer_variant_name(profile_name)
    meta["engine"] = _infer_profile_engine(meta)

    # Normalize aliases
    from ..engines.behavior import setting_aliases_for
    aliases = setting_aliases_for(meta["engine"])
    for source, target in aliases.items():
        if source in meta and target not in meta:
            meta[target] = meta.pop(source)

    if persist:
        save_meta = _get_minimal_save_metadata(profile_name, meta, orig_meta)

        profile_dir = get_profile_dir(profile_name)
        if profile_dir:
            import os
            trusted_voices_root = os.path.abspath(os.fspath(config.VOICES_DIR))
            resolved_pdir = os.path.abspath(os.fspath(profile_dir))

            # Rule 9: Locally visible containment check
            if resolved_pdir.startswith(trusted_voices_root + os.sep):
                meta_path_full = os.path.normpath(os.path.join(resolved_pdir, "profile.json"))
                if meta_path_full.startswith(resolved_pdir + os.sep):
                    needs_write = (
                        save_meta != orig_meta
                        or not os.path.exists(meta_path_full)
                        or os.path.getsize(meta_path_full) == 0
                    )
                    if needs_write:
                        try:
                            with open(meta_path_full, "w", encoding="utf-8") as f:
                                f.write(json.dumps(save_meta, indent=2))
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
    import os
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

        save_meta = _get_minimal_save_metadata(speaker_name, meta, orig_meta)

        if save_meta != orig_meta:
            try:
                with open(meta_path_full, "w", encoding="utf-8") as f:
                    f.write(json.dumps(save_meta, indent=2))
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

    # Gather all profile directories (V2 only)
    all_profile_dirs = []
    for entry in root.iterdir():
        if not entry.is_dir() or not SAFE_PROFILE_NAME_RE.fullmatch(entry.name):
            continue

        # Check if it's a voice root (has voice.json)
        if find_secure_file(entry, "voice.json"):
            for sub in entry.iterdir():
                if sub.is_dir() and _profile_dir_has_assets(sub):
                    all_profile_dirs.append(sub)

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
                # Map nested storage to profile identifiers
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
                        logger.warning("Failed to read speaker metadata for %s", meta_path_full, exc_info=True)
                        meta = {}

                # Create a copy of the original metadata on disk
                orig_meta = json.loads(json.dumps(meta))

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

                if orig_meta.get("speaker_id") != speaker["id"] or not os.path.exists(meta_path_full):
                    orig_meta["speaker_id"] = speaker["id"]
                    if orig_meta.get("engine"):
                        from ..engines.behavior import setting_aliases_for
                        aliases = setting_aliases_for(orig_meta["engine"])
                        for source, target in aliases.items():
                            if source in orig_meta and target not in orig_meta:
                                orig_meta[target] = orig_meta.pop(source)
                    try:
                        os.makedirs(os.path.dirname(meta_path_full), exist_ok=True)
                        with open(meta_path_full, "w", encoding="utf-8") as f:
                            f.write(json.dumps(orig_meta, indent=2))
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
