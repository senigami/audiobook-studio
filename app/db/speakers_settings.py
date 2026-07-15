"""Per-profile settings/metadata read-write and normalization.

Split out of the former monolithic ``speakers.py`` (see ``app/db/speakers.py``,
now a thin facade). Owns ``profile.json`` metadata: reading/writing settings,
inferring/normalizing the target engine, and the base-profile normalization
sweep.
"""
import time
import logging
import json
from pathlib import Path
from typing import Dict, Any, Optional

from .core import _db_lock, get_connection
from ..utils.pathing import find_secure_file
from ..core import config
from .speaker_paths import _profile_name_or_error
from .speaker_naming import infer_variant_name
from .speakers_paths import (
    _existing_profile_dir,
    _new_profile_dir,
    _resolve_existing_profile_name,
    get_profile_dir,
)

logger = logging.getLogger(__name__)

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


def get_profile_engine(profile_name_or_id: Optional[str], fallback_engine: Optional[str] = None) -> str:
    """Resolve the engine ID for a profile name or speaker ID without depending on app.jobs."""
    if not profile_name_or_id:
        return ""

    # Cross-module lookups honor a facade-level monkeypatch (mirrors the
    # app.db.state precedent of preferring the facade's current attribute).
    from . import speakers as _speakers_module
    _existing_profile_dir_fn = getattr(_speakers_module, "_existing_profile_dir", _existing_profile_dir)
    _find_secure_file_fn = getattr(_speakers_module, "find_secure_file", find_secure_file)

    # 1. Resolve canonical profile name
    target_profile = _resolve_existing_profile_name(profile_name_or_id)
    if not target_profile:
        return ""

    # 2. Find profile directory and read metadata
    pdir = _existing_profile_dir_fn(target_profile)
    if not pdir:
        return ""

    meta_file = _find_secure_file_fn(pdir, "profile.json")
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


def profile_has_custom_test_text(profile_name_or_id: str) -> bool:
    """True if this profile's profile.json explicitly sets ``test_text``.

    False means the profile has never had one written (by the user, or by any
    other caller) and would fall back to ``DEFAULT_SPEAKER_TEST_TEXT`` in
    ``get_speaker_settings`` -- the signal a caller needs to know whether it's
    safe to apply an archetype-suggested sample line without clobbering
    something the user already set.
    """
    target_profile = _resolve_existing_profile_name(profile_name_or_id)
    if not target_profile:
        return False
    pdir = _existing_profile_dir(target_profile)
    if not pdir:
        return False
    meta_file = find_secure_file(pdir, "profile.json")
    if not meta_file:
        return False
    try:
        with open(meta_file, "r", encoding="utf-8", errors="replace") as f:
            meta = json.loads(f.read())
    except Exception:
        return False
    return "test_text" in meta


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
        "performance_tags": [],
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
    # Cross-module lookups honor a facade-level monkeypatch (mirrors the
    # app.db.state precedent of preferring the facade's current attribute).
    from . import speakers as _speakers_module
    _profile_name_or_error_fn = getattr(_speakers_module, "_profile_name_or_error", _profile_name_or_error)
    _existing_profile_dir_fn = getattr(_speakers_module, "_existing_profile_dir", _existing_profile_dir)
    _new_profile_dir_fn = getattr(_speakers_module, "_new_profile_dir", _new_profile_dir)

    try:
        target_profile = _resolve_existing_profile_name(profile_name)
    except ValueError:
        return False
    if not target_profile or target_profile == profile_name:
        # If resolution failed or returned the same name, trust the input name.
        # This prevents over-resolving "Dracula - Angry" to "Dracula".
        try:
            target_profile = _profile_name_or_error_fn(profile_name)
        except ValueError:
            return False

    pdir = _existing_profile_dir_fn(target_profile)
    if not pdir:
        pdir = _new_profile_dir_fn(config.VOICES_DIR, target_profile)

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

    if "performance_tags" in updates and updates["performance_tags"] is not None:
        normalized_tags = []
        for tag in updates["performance_tags"]:
            normalized = str(tag).strip().lower().replace(" ", "-")
            if normalized and normalized not in normalized_tags:
                normalized_tags.append(normalized)
        updates["performance_tags"] = normalized_tags

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

    # Cross-module lookup honors a facade-level monkeypatch (mirrors the
    # app.db.state precedent of preferring the facade's current attribute).
    from . import speakers as _speakers_module
    _get_connection_fn = getattr(_speakers_module, "get_connection", get_connection)

    with _db_lock:
        with _get_connection_fn() as conn:
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
            with _get_connection_fn() as conn:
                cursor = conn.cursor()
                cursor.executemany(
                    "UPDATE speakers SET default_profile_name = ?, updated_at = ? WHERE id = ?",
                    pending_updates
                )
                conn.commit()
