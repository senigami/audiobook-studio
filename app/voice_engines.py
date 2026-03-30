from typing import Iterable, Optional

from .db.speakers import DEFAULT_PROFILE_ENGINE, VALID_PROFILE_ENGINES

TTS_ENGINES = tuple(sorted(VALID_PROFILE_ENGINES))


def normalize_tts_engine(engine: Optional[str], fallback: str = DEFAULT_PROFILE_ENGINE) -> str:
    normalized = str(engine or fallback).strip().lower()
    return normalized if normalized in VALID_PROFILE_ENGINES else fallback


def is_tts_engine(engine: Optional[str]) -> bool:
    return str(engine or "").strip().lower() in VALID_PROFILE_ENGINES


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
