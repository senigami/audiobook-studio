from pathlib import Path
from typing import Iterable, Optional
import threading

_DISCOVERY_LOCK = threading.Lock()
_IN_DISCOVERY = False

def get_default_profile_engine(settings: Optional[dict] = None) -> str:
    """Resolve the system-wide default engine ID from settings or discovery."""
    if settings == {}:
        # Rule 9: Safe schema default for initial boot before discovery is ready.
        # This prevents problematic discovery calls during early module import.
        return ""

    # 1. Verification list
    valid_engines = list_tts_engines()

    # 2. Use provided settings or try to fetch them
    if settings is None:
        try:
            from ..db.state_settings import get_settings
            settings = get_settings()
        except (ImportError, AttributeError, RecursionError):
            settings = {}

    # 3. Resolve from settings
    explicit = settings.get("default_engine")
    enabled_plugins = settings.get("enabled_plugins") or {}

    active_valid = [eid for eid in valid_engines if enabled_plugins.get(eid, True)]

    if explicit and not valid_engines:
        return str(explicit).strip().lower()

    if explicit and explicit in active_valid:
        return explicit

    # Find first enabled in registry
    if active_valid:
        return active_valid[0]

    # Rule 9: Generic placeholder if no engines are discovered yet.
    # This avoids hardcoding a specific engine name as a runtime default.
    return ""


def list_tts_engines() -> list[str]:
    global _IN_DISCOVERY
    if _IN_DISCOVERY:
        return []
    _IN_DISCOVERY = True
    try:
        import logging
        logger = logging.getLogger(__name__)
        from ..engines.bridge import create_voice_bridge
        bridge = create_voice_bridge()
        return [entry["engine_id"] for entry in bridge.describe_registry()]
    except Exception as e:
        # Fallback if bridge is not ready
        import logging
        logging.getLogger(__name__).debug("Registry discovery failed: %s", e)
        return []
    finally:
        _IN_DISCOVERY = False


def normalize_tts_engine(engine: Optional[str], fallback: Optional[str] = None, settings: Optional[dict] = None) -> str:
    """Normalize an engine ID, resolving to system default if invalid or empty."""
    valid = list_tts_engines()

    # 1. Load settings to check enablement
    if settings is None:
        try:
            from ..db.state_settings import get_settings
            settings = get_settings()
        except (ImportError, AttributeError, RecursionError):
            settings = {}

    enabled_plugins = settings.get("enabled_plugins") or {}
    active_valid = [eid for eid in valid if enabled_plugins.get(eid, True)]
    normalized = str(engine or fallback or "").strip().lower()

    if not active_valid:
        if not valid:
            return normalized
        return normalized if normalized in valid else (fallback or "")

    # If the engine is empty, invalid, or disabled, try to resolve the default active engine
    if not engine or normalized not in active_valid:
        resolved_default = get_default_profile_engine(settings=settings)
        if resolved_default in active_valid:
            return resolved_default
        if resolved_default:
            return resolved_default

    # Use provided engine if active/valid, or fallback to an active/valid default
    if normalized in active_valid:
        return normalized

    resolved_default = get_default_profile_engine(settings=settings)
    if resolved_default in active_valid:
        return resolved_default

    return active_valid[0]


def is_tts_engine(engine: Optional[str]) -> bool:
    valid = list_tts_engines()
    return str(engine or "").strip().lower() in valid


def resolve_profile_engine(profile_name_or_id: Optional[str], fallback_engine: Optional[str] = None) -> str:
    fallback = normalize_tts_engine(fallback_engine)
    if not profile_name_or_id:
        return fallback

    try:
        from ..db.speakers import get_profile_engine

        return get_profile_engine(profile_name_or_id, fallback)
    except Exception:
        return fallback


def resolve_tts_engine_for_profiles(
    profile_names: Iterable[Optional[str]],
    default_profile: Optional[str] = None,
    fallback_engine: Optional[str] = None,
) -> tuple[str, bool]:
    fallback = resolve_profile_engine(default_profile, fallback_engine)
    resolved = {
        engine_id
        for engine_id in (
            resolve_profile_engine(profile_name, fallback)
            for profile_name in profile_names
        )
        if engine_id
    }
    if not resolved:
        resolved = {fallback}
    return sorted(resolved)[0], len(resolved) > 1


def resolve_voice_preview_inputs(
    profile_name_or_id: Optional[str],
) -> tuple[Optional[str], Optional[Path]]:
    """Resolve preview inputs for a profile or speaker identifier."""

    if not profile_name_or_id:
        return None, None

    try:
        from ..db.speakers import get_profile_wavs, get_profile_dir

        speaker_wav = get_profile_wavs(profile_name_or_id)
        if speaker_wav and "," in speaker_wav:
            speaker_wav = speaker_wav.split(",")[0]

        try:
            voice_profile_dir = get_profile_dir(profile_name_or_id)
        except ValueError:
            voice_profile_dir = None
        return speaker_wav, voice_profile_dir
    except Exception:
        return None, None
