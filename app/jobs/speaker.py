import json
from typing import Optional
from ..config import VOICES_DIR
from ..state import get_settings

def get_speaker_wavs(profile_name_or_id: str) -> Optional[str]:
    """Returns a comma-separated string of absolute paths for the given profile or speaker ID."""
    from ..db import get_speaker, list_speakers

    target_profile = profile_name_or_id
    if not target_profile:
        target_profile = get_settings().get("default_speaker_profile") or "Dark Fantasy"

    # Resolve speaker ID or Name to a profile folder
    # 1. If it's a UUID, it's a speaker ID
    if len(target_profile) == 36 and "-" in target_profile:
        spk = get_speaker(target_profile)
        if spk and spk["default_profile_name"]:
            target_profile = spk["default_profile_name"]
    # 2. If it's a speaker name (not a profile folder name yet), find its default
    else:
        all_spks = list_speakers()
        spk_match = next((s for s in all_spks if s['name'] == target_profile), None)
        if spk_match and spk_match.get("default_profile_name"):
            target_profile = spk_match["default_profile_name"]

    p = VOICES_DIR / target_profile

    if not p.exists() or not p.is_dir():
        # Fallback to ANY existing profile folder if the requested one is gone
        subdirs = [d for d in VOICES_DIR.iterdir() if d.is_dir() and not d.name.startswith(".")]
        if subdirs:
            p = subdirs[0]
        else:
            return None

    wavs = sorted(p.glob("*.wav"))
    if not wavs:
        return None

    return ",".join([str(w.absolute()) for w in wavs])


def get_speaker_settings(profile_name_or_id: str) -> dict:
    """Returns metadata (like speed and test text) for a profile or speaker ID, falling back to global settings."""
    defaults = get_settings()

    target_profile = profile_name_or_id
    if not target_profile:
        target_profile = defaults.get("default_speaker_profile") or "Dark Fantasy"

    # Resolve speaker ID or Name to a profile folder
    if len(target_profile) == 36 and "-" in target_profile:
        from ..db import get_speaker
        spk = get_speaker(target_profile)
        if spk and spk["default_profile_name"]:
            target_profile = spk["default_profile_name"]
    else:
        from ..db import list_speakers
        all_spks = list_speakers()
        spk_match = next((s for s in all_spks if s['name'] == target_profile), None)
        if spk_match and spk_match.get("default_profile_name"):
            target_profile = spk_match["default_profile_name"]
        elif spk_match:
            subs = sorted([d.name for d in VOICES_DIR.iterdir() if d.is_dir() and d.name.startswith(target_profile + " -")])
            if subs:
                target_profile = subs[0]

    p = VOICES_DIR / target_profile

    default_test_text = (
        "The mysterious traveler, bathed in the soft glow of the azure twilight, "
        "whispered of ancient treasures buried beneath the jagged mountains. "
        "'Zephyr,' he exclaimed, his voice a mixture of awe and trepidation, "
        "'the path is treacherous, yet the reward is beyond measure.' "
        "Around them, the vibrant forest hummed with rhythmic sounds while a "
        "cold breeze carried the scent of wet earth and weathered stone."
    )

    res = {
        "speed": float(defaults.get("xtts_speed", 1.0)),
        "test_text": default_test_text,
        "speaker_id": None,
        "variant_name": None,
        "built_samples": []
    }

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
        except: pass

    return res

def update_speaker_settings(profile_name: str, **updates):
    """Updates metadata for a profile in its profile.json."""
    p = VOICES_DIR / profile_name
    if not p.exists():
        return False

    meta_path = p / "profile.json"
    meta = {}
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
        except: pass

    meta.update(updates)
    meta_path.write_text(json.dumps(meta, indent=2))
    return True
