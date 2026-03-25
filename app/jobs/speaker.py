import json
import logging
import re
import uuid
from pathlib import Path
from typing import Optional
from ..config import VOICES_DIR
from ..state import get_settings
from ..db.speakers import infer_variant_name, normalize_profile_metadata

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


def get_voice_profile_dir(profile_name: str):
    profile_name = _profile_name_or_error(profile_name)
    if not VOICES_DIR.exists():
        return VOICES_DIR / profile_name
    try:
        for entry in VOICES_DIR.iterdir():
            if entry.is_dir() and entry.name == profile_name:
                return entry.resolve()
    except FileNotFoundError:
        return VOICES_DIR / profile_name
    return VOICES_DIR / profile_name


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
        from ..db import get_speaker
        spk = get_speaker(target_profile)
        if spk:
            speaker_name = spk.get("name")
            speaker_default_profile = spk.get("default_profile_name")
    else:
        from ..db import list_speakers
        spk_match = next((s for s in list_speakers() if s["name"] == target_profile), None)
        if spk_match:
            speaker_name = spk_match.get("name")
            speaker_default_profile = spk_match.get("default_profile_name")

    if speaker_name:
        add_candidate(speaker_name)
    add_candidate(speaker_default_profile)

    prefix_source = speaker_name or (None if _is_uuid(target_profile) else target_profile)
    if prefix_source:
        for d in sorted(VOICES_DIR.iterdir(), key=lambda p: p.name):
            if d.is_dir() and d.name.startswith(prefix_source + " - "):
                add_candidate(d.name)

    for candidate in candidates:
        try:
            p = get_voice_profile_dir(candidate)
        except ValueError:
            continue
        if p.exists() and p.is_dir():
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

    wavs = sorted(p.glob("*.wav"))
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

def get_speaker_settings(profile_name_or_id: str) -> dict:
    """Returns metadata (like speed and test text) for a profile or speaker ID, falling back to global settings."""
    defaults = get_settings()

    res = {
        "speed": float(defaults.get("xtts_speed", 1.0)),
        "test_text": DEFAULT_SPEAKER_TEST_TEXT,
        "speaker_id": None,
        "variant_name": None,
        "built_samples": []
    }
    target_profile = _resolve_existing_profile_name(profile_name_or_id)
    if not target_profile:
        return res

    try:
        p = get_voice_profile_dir(target_profile)
    except ValueError:
        return res

    meta_path = p / "profile.json"
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
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
            meta = normalize_profile_metadata(target_profile, meta, persist=True)
            if "variant_name" in meta:
                res["variant_name"] = meta["variant_name"]
        except Exception:
            logger.warning("Failed to read speaker metadata from %s", meta_path, exc_info=True)
    else:
        meta = normalize_profile_metadata(target_profile, {}, persist=True)
        res["variant_name"] = meta.get("variant_name") or infer_variant_name(target_profile)

    return res

def update_speaker_settings(profile_name: str, **updates):
    """Updates metadata for a profile in its profile.json."""
    try:
        p = get_voice_profile_dir(profile_name)
    except ValueError:
        return False
    if not p.exists():
        return False

    meta_path = p / "profile.json"
    meta = {}
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
        except Exception:
            logger.warning("Failed to read speaker metadata from %s", meta_path, exc_info=True)

    for k, v in updates.items():
        if v is None:
            if k in meta:
                del meta[k]
        else:
            meta[k] = v

    meta_path.write_text(json.dumps(meta, indent=2))
    return True
