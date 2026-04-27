import json
import logging
import os
import re
import uuid
from json import JSONDecodeError
from pathlib import Path
from typing import Optional
from ..config import VOICES_DIR
from ..state import get_settings
from ..db.speakers import infer_variant_name, normalize_profile_metadata, DEFAULT_PROFILE_ENGINE

logger = logging.getLogger(__name__)


def _abspath_realpath(value) -> str:
    return os.path.abspath(os.path.realpath(os.fspath(value)))


def _scandir_names_within_root(root_dir, *parts: str) -> Optional[set[str]]:
    """Rule 9: Locally visible containment proof for discovery sink."""
    root = os.path.abspath(os.path.realpath(os.fspath(root_dir)))
    root_prefix = root if root.endswith(os.sep) else root + os.sep

    # Linear proof for discovery
    candidate = os.path.abspath(os.path.realpath(os.path.join(root, *parts)))
    if candidate != root and not candidate.startswith(root_prefix):
        return None

    try:
        # SINK: Proof is locally visible in the same block
        with os.scandir(candidate) as entries:
            return {entry.name for entry in entries}
    except (OSError, RuntimeError):
        return None


def _dir_has_profile_assets(entry_names: set[str]) -> bool:
    if "profile.json" in entry_names:
        return True
    if "voice.json" in entry_names:
        return False
    return True


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def _profile_name_or_error(profile_name: str) -> str:
    from .. import config
    return config.canonical_voice_name(profile_name)


def _profile_dir_has_assets(profile_dir: Path) -> bool:
    entry_names = _scandir_names_within_root(VOICES_DIR, os.fspath(profile_dir))
    if entry_names is None:
        return False
    return _dir_has_profile_assets(entry_names)


def _candidate_voice_profile_dir(profile_name: str) -> Path:
    profile_name = _profile_name_or_error(profile_name)

    voices_root = os.path.abspath(os.path.realpath(os.fspath(VOICES_DIR)))
    voices_root_prefix = voices_root if voices_root.endswith(os.sep) else voices_root + os.sep

    # If it's a nested-style name "Dracula - Angry", prefer Dracula/Angry if Dracula is a v2 voice
    if " - " in profile_name:
        v_name, var_name = profile_name.split(" - ", 1)
        v_name = v_name.strip()
        var_name = var_name.strip()

        from ..config import get_voice_storage_version

        if get_voice_storage_version(v_name) >= 2:
            fullpath = os.path.abspath(os.path.realpath(os.path.join(voices_root, v_name, var_name)))
            if fullpath != voices_root and not fullpath.startswith(voices_root_prefix):
                raise ValueError(f"Invalid profile name: {profile_name}")
            return Path(fullpath)

    fullpath = os.path.abspath(os.path.realpath(os.path.join(voices_root, profile_name)))
    if fullpath != voices_root and not fullpath.startswith(voices_root_prefix):
        raise ValueError(f"Invalid profile name: {profile_name}")
    return Path(fullpath)


def _find_existing_voice_profile_dir(profile_name: str) -> Optional[Path]:
    profile_name = _profile_name_or_error(profile_name)
    voices_root = os.path.abspath(os.path.realpath(os.fspath(VOICES_DIR)))
    if not os.path.isdir(voices_root):
        return None

    # 1. Exact match (legacy flat OR intentional nested path)
    exact_names = _scandir_names_within_root(voices_root, profile_name)
    if exact_names is not None:
        exact = Path(os.path.join(voices_root, profile_name))
        # A valid profile directory must have profile.json
        if "profile.json" in exact_names:
            return exact

        if _dir_has_profile_assets(exact_names):
            return exact

        # If it's a voice root (has voice.json), try to find the Default variant
        if "voice.json" in exact_names:
            nested_default_names = _scandir_names_within_root(voices_root, profile_name, "Default")
            if nested_default_names is not None and _dir_has_profile_assets(nested_default_names):
                nested_default = Path(os.path.join(voices_root, profile_name, "Default"))
                return nested_default

    # 2. Nested resolution: "Dracula - Angry" -> voices/Dracula/Angry
    if " - " in profile_name:
        v_name, var_name = profile_name.split(" - ", 1)
        nested_names = _scandir_names_within_root(voices_root, v_name.strip(), var_name.strip())
        if nested_names is not None and _dir_has_profile_assets(nested_names):
            nested = Path(os.path.join(voices_root, v_name.strip(), var_name.strip()))
            return nested

    # 3. Base voice default: "Dracula" -> voices/Dracula/Default (Fallback)
    nested_default_names = _scandir_names_within_root(voices_root, profile_name, "Default")
    if nested_default_names is not None and _dir_has_profile_assets(nested_default_names):
        nested_default = Path(os.path.join(voices_root, profile_name, "Default"))
        return nested_default

    return None


def _existing_profile_metadata_path(profile_name: str) -> Optional[Path]:
    profile_name = _profile_name_or_error(profile_name)
    profile_dir = _find_existing_voice_profile_dir(profile_name)
    if not profile_dir:
        return None

    # Rule 9: Locally visible containment proof
    voices_root = os.path.abspath(os.path.realpath(os.fspath(VOICES_DIR)))
    voices_root_prefix = voices_root if voices_root.endswith(os.sep) else voices_root + os.sep

    profile_root = os.path.abspath(os.path.realpath(os.fspath(profile_dir)))
    if profile_root != voices_root and not profile_root.startswith(voices_root_prefix):
        raise ValueError(f"Invalid profile metadata path for: {profile_name}")

    profile_root_prefix = profile_root if profile_root.endswith(os.sep) else profile_root + os.sep
    meta_path = os.path.abspath(os.path.realpath(os.path.join(profile_root, "profile.json")))
    if meta_path != profile_root and not meta_path.startswith(profile_root_prefix):
        raise ValueError(f"Invalid profile metadata path for: {profile_name}")

    return Path(meta_path)


def get_voice_profile_dir(profile_name: str):
    exact = _find_existing_voice_profile_dir(profile_name)
    if exact:
        return exact

    resolved_name = _resolve_existing_profile_name(profile_name)
    if resolved_name and resolved_name != profile_name:
        resolved = _find_existing_voice_profile_dir(resolved_name)
        if resolved:
            return resolved
    return _candidate_voice_profile_dir(profile_name)


def get_voice_profile_latent_path(profile_name: str):
    return get_voice_profile_dir(profile_name) / "latent.pth"


def _resolve_existing_profile_name(profile_name_or_id: str) -> Optional[str]:
    """Resolve a speaker name/ID/profile name to the best existing profile folder."""
    default_settings = get_settings()
    target_profile = profile_name_or_id or default_settings.get("default_speaker_profile") or "Dark Fantasy"

    candidates: list[str] = []

    def add_candidate(name: Optional[str]):
        if name and name not in candidates:
            candidates.append(name)

    add_candidate(target_profile)

    speaker_name: Optional[str] = None
    speaker_default_profile: Optional[str] = None
    if _is_uuid(target_profile):
        try:
            from ..db import get_speaker

            spk = get_speaker(target_profile)
        except Exception:
            spk = None
        if spk:
            speaker_name = spk.get("name")
            speaker_default_profile = spk.get("default_profile_name")
    else:
        try:
            from ..db import list_speakers

            spk_match = next((s for s in list_speakers() if s["name"] == target_profile), None)
        except Exception:
            spk_match = None
        if spk_match:
            speaker_name = spk_match.get("name")
            speaker_default_profile = spk_match.get("default_profile_name")

    if speaker_name:
        add_candidate(speaker_name)
    add_candidate(speaker_default_profile)

    prefix_source = speaker_name or (None if _is_uuid(target_profile) else target_profile)
    voices_root = os.path.abspath(os.path.realpath(os.fspath(VOICES_DIR)))
    if prefix_source and os.path.isdir(voices_root):
        # Flat layout candidates
        # Rule 8: Enumerate trusted root
        for entry in sorted(os.scandir(voices_root), key=lambda e: e.name):
            if entry.is_dir() and entry.name.startswith(prefix_source + " - "):
                add_candidate(entry.name)

        # Nested layout candidates
        v_dir_names = _scandir_names_within_root(voices_root, prefix_source)
        if v_dir_names is not None:
            # Rule 9: Locally visible containment proof for nested scandir
            voices_root_prefix = voices_root if voices_root.endswith(os.sep) else voices_root + os.sep
            v_dir_path = os.path.abspath(os.path.realpath(os.path.join(voices_root, prefix_source)))
            if v_dir_path.startswith(voices_root_prefix):
                for entry in sorted(os.scandir(v_dir_path), key=lambda e: e.name):
                    if entry.is_dir():
                        entry_names = _scandir_names_within_root(voices_root, prefix_source, entry.name)
                        if entry_names is not None and "profile.json" in entry_names:
                            add_candidate(f"{prefix_source} - {entry.name}")

    for candidate in candidates:
        try:
            p = _find_existing_voice_profile_dir(candidate)
        except ValueError:
            continue
        if p:
            return candidate

    return None


def get_speaker_wavs(profile_name_or_id: str) -> Optional[str]:
    """Returns a comma-separated string of absolute paths for the given profile or speaker ID."""
    target_profile = _resolve_existing_profile_name(profile_name_or_id)
    if not target_profile:
        return None

    try:
        p = get_voice_profile_dir(target_profile)
    except ValueError:
        return None

    wavs = sorted(w for w in p.glob("*.wav") if w.name != "sample.wav")
    if not wavs:
        # Variants created by tests or lightweight imports may only have a
        # single sample file. Fall back to it so name resolution still works.
        wavs = sorted(p.glob("sample.wav"))
    if not wavs:
        return None

    return ",".join([str(w.absolute()) for w in wavs])


DEFAULT_SPEAKER_TEST_TEXT = (
    "The mysterious traveler, bathed in the soft glow of the azure twilight, "
    "whispered of ancient treasures buried beneath the jagged mountains. "
    "'Zephyr,' he exclaimed, his voice a mixture of awe and trepidation, "
    "'the path is treacherous, yet the reward is beyond measure.' "
    "Around them, the vibrant forest hummed with rhythmic sounds while a "
    "cold breeze carried the scent of wet earth and weathered stone."
)


def _read_profile_metadata(profile_name: str, meta_path: Path, *, fix_schema: bool = False) -> dict:
    profile_name = _profile_name_or_error(profile_name)

    # Rule 9: Locally visible containment proof for file reading sinks
    voices_root = os.path.abspath(os.path.realpath(os.fspath(VOICES_DIR)))
    voices_root_prefix = voices_root if voices_root.endswith(os.sep) else voices_root + os.sep

    meta_path_final = os.path.abspath(os.path.realpath(os.fspath(meta_path)))
    if meta_path_final != voices_root and not meta_path_final.startswith(voices_root_prefix):
        raise ValueError(f"Invalid profile metadata path for: {profile_name}")

    # Metadata access is restricted to the canonical profile.json only.
    if os.path.basename(meta_path_final) != "profile.json":
        raise ValueError(f"Invalid profile metadata filename for: {profile_name}")

    if not os.path.isfile(meta_path_final):
        meta = normalize_profile_metadata(profile_name, {}, persist=False)
        if fix_schema:
            try:
                # SINK: Proof is locally visible
                with open(meta_path_final, "w", encoding="utf-8") as fp:
                    fp.write(json.dumps(meta, indent=2))
            except Exception:
                logger.warning("Failed to create default speaker metadata at %s", meta_path_final, exc_info=True)
        return meta

    try:
        # SINK: Proof is locally visible
        with open(meta_path_final, "r", encoding="utf-8", errors="replace") as fp:
            raw = fp.read().strip()
        meta = json.loads(raw) if raw else {}
    except JSONDecodeError:
        logger.warning(
            "Speaker metadata was blank or invalid JSON at %s; rebuilding defaults.", meta_path_final, exc_info=True
        )
        meta = {}
    except Exception:
        logger.warning("Failed to read speaker metadata from %s", meta_path_final, exc_info=True)
        meta = {}

    normalized = normalize_profile_metadata(profile_name, meta, persist=False)
    if fix_schema and normalized != meta:
        try:
            # SINK: Proof is locally visible
            with open(meta_path_final, "w", encoding="utf-8") as fp:
                fp.write(json.dumps(normalized, indent=2))
        except Exception:
            logger.warning("Failed to fix speaker metadata schema at %s", meta_path_final, exc_info=True)
    return normalized


def get_speaker_settings(profile_name_or_id: str) -> dict:
    """Returns metadata (like speed and test text) for a profile or speaker ID, falling back to global settings."""
    defaults = get_settings()

    res = {
        "speed": float(defaults.get("xtts_speed", 1.0)),
        "test_text": DEFAULT_SPEAKER_TEST_TEXT,
        "speaker_id": None,
        "variant_name": None,
        "built_samples": [],
        "engine": DEFAULT_PROFILE_ENGINE,
        "voxtral_voice_id": None,
        "voxtral_model": None,
        "reference_sample": None,
        "preview_test_text": None,
        "preview_engine": None,
        "preview_reference_sample": None,
        "preview_voxtral_voice_id": None,
        "preview_voxtral_model": None,
    }
    target_profile = _resolve_existing_profile_name(profile_name_or_id)
    if not target_profile:
        return res

    try:
        meta_path = _existing_profile_metadata_path(target_profile)
    except ValueError:
        return res
    if not meta_path:
        return res
    meta = _read_profile_metadata(target_profile, meta_path, fix_schema=True)
    for k in res:
        if k in meta:
            res[k] = meta[k]

    return res


def update_speaker_settings(profile_name: str, **updates):
    """Updates metadata for a profile in its profile.json."""
    try:
        profile_name = _profile_name_or_error(profile_name)
    except ValueError:
        return False

    try:
        profile_dir = get_voice_profile_dir(profile_name)
    except ValueError:
        return False

    # Rule 9: Locally visible containment proof for file writing sink
    voices_root = os.path.abspath(os.path.realpath(os.fspath(VOICES_DIR)))
    voices_root_prefix = voices_root if voices_root.endswith(os.sep) else voices_root + os.sep

    profile_root = os.path.abspath(os.path.realpath(os.fspath(profile_dir)))
    if profile_root != voices_root and not profile_root.startswith(voices_root_prefix):
        return False

    profile_root_prefix = profile_root if profile_root.endswith(os.sep) else profile_root + os.sep
    meta_path_final = os.path.abspath(os.path.realpath(os.path.join(profile_root, "profile.json")))
    if meta_path_final != profile_root and not meta_path_final.startswith(profile_root_prefix):
        return False

    meta = _read_profile_metadata(profile_name, Path(meta_path_final), fix_schema=False)

    for k, v in updates.items():
        if v is None:
            if k in meta:
                del meta[k]
        else:
            meta[k] = v

    # SINK: Proof is locally visible in the same block
    with open(meta_path_final, "w", encoding="utf-8") as fp:
        fp.write(json.dumps(meta, indent=2))
    return True
