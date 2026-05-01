from pathlib import Path
from typing import Iterable, Optional

DEFAULT_PROFILE_ENGINE = "xtts"

def list_tts_engines() -> list[str]:
    try:
        from .engines.bridge import create_voice_bridge
        bridge = create_voice_bridge()
        return [entry["engine_id"] for entry in bridge.describe_registry()]
    except Exception:
        # Fallback if bridge is not ready
        return ["xtts", "voxtral"]


def normalize_tts_engine(engine: Optional[str], fallback: str = DEFAULT_PROFILE_ENGINE) -> str:
    valid = list_tts_engines()
    normalized = str(engine or fallback).strip().lower()
    return normalized if normalized in valid else fallback


def is_tts_engine(engine: Optional[str]) -> bool:
    valid = list_tts_engines()
    return str(engine or "").strip().lower() in valid


def resolve_profile_engine(profile_name_or_id: Optional[str], fallback_engine: Optional[str] = None) -> str:
    fallback = normalize_tts_engine(fallback_engine, DEFAULT_PROFILE_ENGINE)
    if not profile_name_or_id:
        return fallback

    try:
        from .jobs.speaker import get_speaker_settings

        settings = get_speaker_settings(profile_name_or_id)
        return normalize_tts_engine(settings.get("engine"), fallback)
    except Exception:
        return fallback


def resolve_tts_engine_for_profiles(
    profile_names: Iterable[Optional[str]],
    default_profile: Optional[str] = None,
    fallback_engine: Optional[str] = None,
) -> tuple[str, bool]:
    fallback = resolve_profile_engine(default_profile, fallback_engine)
    resolved = {
        resolve_profile_engine(profile_name, fallback)
        for profile_name in profile_names
    }
    if not resolved:
        resolved = {fallback}
    return sorted(resolved)[0], len(resolved) > 1


def resolve_xtts_preview_inputs(
    profile_name_or_id: Optional[str],
) -> tuple[Optional[str], Optional[Path]]:
    """Resolve legacy XTTS preview inputs for a profile or speaker identifier."""

    if not profile_name_or_id:
        return None, None

    try:
        from .jobs.speaker import get_speaker_wavs, get_voice_profile_dir

        speaker_wav = get_speaker_wavs(profile_name_or_id)
        try:
            voice_profile_dir = get_voice_profile_dir(profile_name_or_id)
        except ValueError:
            voice_profile_dir = None
        return speaker_wav, voice_profile_dir
    except Exception:
        return None, None
