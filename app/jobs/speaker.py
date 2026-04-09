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
SAFE_PROFILE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]*$")


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def _profile_name_or_error(profile_name: str) -> str:
    if not SAFE_PROFILE_NAME_RE.fullmatch(profile_name):
        raise ValueError(f"Invalid profile name: {profile_name}")
    return profile_name


def _candidate_voice_profile_dir(profile_name: str) -> Path:
    profile_name = _profile_name_or_error(profile_name)
    base_dir = os.path.abspath(os.path.normpath(os.fspath(VOICES_DIR)))
    fullpath = os.path.abspath(os.path.normpath(os.path.join(base_dir, profile_name)))
    if not fullpath.startswith(base_dir + os.sep):
        raise ValueError(f"Invalid profile name: {profile_name}")
    return Path(fullpath)


def _find_existing_voice_profile_dir(profile_name: str) -> Optional[Path]:
    profile_name = _profile_name_or_error(profile_name)
    if not VOICES_DIR.exists():
        return None
    try:
        for entry in VOICES_DIR.iterdir():
            if entry.is_dir() and entry.name == profile_name:
                return entry.resolve()
    except FileNotFoundError:
        return None
    return None


def _existing_profile_metadata_path(profile_name: str) -> Optional[Path]:
    profile_name = _profile_name_or_error(profile_name)
    profile_dir = _find_existing_voice_profile_dir(profile_name)
    if not profile_dir:
        return None
    profile_root = os.path.abspath(os.path.normpath(os.fspath(profile_dir)))
    meta_path = os.path.abspath(os.path.normpath(os.path.join(profile_root, "profile.json")))
    if not meta_path.startswith(profile_root + os.sep):
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
    """Resolve a speaker name/ID/profile name to the best existing profile folder.

    Preference order:
    1. The exact requested folder name, if it exists.
    2. The speaker's base folder name, if it exists.
    3. The speaker's configured default profile, if it exists.
    4. Any existing variant folders for that speaker.
    """
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
    if prefix_source and VOICES_DIR.exists():
        for d in sorted(VOICES_DIR.iterdir(), key=lambda p: p.name):
            if d.is_dir() and d.name.startswith(prefix_source + " - "):
                add_candidate(d.name)

    for candidate in candidates:
        try:
            p = _find_existing_voice_profile_dir(candidate)
        except ValueError:
            continue
        if p and p.exists() and p.is_dir():
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


def _read_profile_metadata(profile_name: str, meta_path: Path, *, repair: bool = False) -> dict:
    if not meta_path.exists():
        meta = normalize_profile_metadata(profile_name, {}, persist=False)
        if repair:
            try:
                meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
            except Exception:
                logger.warning("Failed to create default speaker metadata at %s", meta_path, exc_info=True)
        return meta

    try:
        raw = meta_path.read_text(encoding="utf-8", errors="replace").strip()
        meta = json.loads(raw) if raw else {}
    except JSONDecodeError:
        logger.warning("Speaker metadata was blank or invalid JSON at %s; rebuilding defaults.", meta_path, exc_info=True)
        meta = {}
    except Exception:
        logger.warning("Failed to read speaker metadata from %s", meta_path, exc_info=True)
        meta = {}

    normalized = normalize_profile_metadata(profile_name, meta, persist=False)
    if repair and normalized != meta:
        try:
            meta_path.write_text(json.dumps(normalized, indent=2), encoding="utf-8")
        except Exception:
            logger.warning("Failed to repair speaker metadata at %s", meta_path, exc_info=True)
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
    meta = _read_profile_metadata(target_profile, meta_path, repair=True)
    if "speed" in meta:
        res["speed"] = meta["speed"]
    if "test_text" in meta:
        res["test_text"] = meta["test_text"]
    if "speaker_id" in meta:
        res["speaker_id"] = meta["speaker_id"]
    if "variant_name" in meta:
        res["variant_name"] = meta["variant_name"]
    if "built_samples" in meta:
        res["built_samples"] = meta["built_samples"]
    if "engine" in meta:
        res["engine"] = meta["engine"]
    if "voxtral_voice_id" in meta:
        res["voxtral_voice_id"] = meta["voxtral_voice_id"]
    if "voxtral_model" in meta:
        res["voxtral_model"] = meta["voxtral_model"]
    if "reference_sample" in meta:
        res["reference_sample"] = meta["reference_sample"]
    if "preview_test_text" in meta:
        res["preview_test_text"] = meta["preview_test_text"]
    if "preview_engine" in meta:
        res["preview_engine"] = meta["preview_engine"]
    if "preview_reference_sample" in meta:
        res["preview_reference_sample"] = meta["preview_reference_sample"]
    if "preview_voxtral_voice_id" in meta:
        res["preview_voxtral_voice_id"] = meta["preview_voxtral_voice_id"]
    if "preview_voxtral_model" in meta:
        res["preview_voxtral_model"] = meta["preview_voxtral_model"]

    return res

def update_speaker_settings(profile_name: str, **updates):
    """Updates metadata for a profile in its profile.json."""
    try:
        profile_name = _profile_name_or_error(profile_name)
    except ValueError:
        return False

    try:
        meta_path = _existing_profile_metadata_path(profile_name)
    except ValueError:
        return False
    if not meta_path:
        return False
    meta = _read_profile_metadata(profile_name, meta_path, repair=False)

    for k, v in updates.items():
        if v is None:
            if k in meta:
                del meta[k]
        else:
            meta[k] = v

    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return True
