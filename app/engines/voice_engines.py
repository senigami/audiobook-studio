from pathlib import Path
from typing import Iterable, Optional
import threading

_DISCOVERY_LOCK = threading.Lock()
# Thread-local guard: prevents same-thread re-entrant recursion (describe_registry
# can re-enter normalize paths), but does NOT block concurrent threads — each thread
# runs its own independent discovery so list_tts_engines() never transiently returns []
# due to another thread being mid-discovery.
_DISCOVERY_STATE = threading.local()
# Last successful describe_registry() result, served when a fresh discovery raises
# (e.g. TTS server restarting under the watchdog) so valid persisted engines don't
# transiently resolve to "" mid-render. Guarded by _DISCOVERY_LOCK; populated lazily
# on the first successful call (never at import time). Recursion-guard returns ([])
# never touch the cache.
_LAST_GOOD_MANIFESTS: Optional[list[dict]] = None

def _get_registry_manifests() -> list[dict]:
    """Helper to fetch engine registry manifests once without recursion."""
    global _LAST_GOOD_MANIFESTS
    if getattr(_DISCOVERY_STATE, 'in_discovery', False):
        return []
    _DISCOVERY_STATE.in_discovery = True
    try:
        from ..engines.bridge import create_voice_bridge
        bridge = create_voice_bridge()
        manifests = bridge.describe_registry()
        with _DISCOVERY_LOCK:
            _LAST_GOOD_MANIFESTS = manifests
        return manifests
    except Exception as e:
        import logging
        logging.getLogger(__name__).debug("Registry discovery failed: %s", e)
        with _DISCOVERY_LOCK:
            if _LAST_GOOD_MANIFESTS is not None:
                return _LAST_GOOD_MANIFESTS
        return []
    finally:
        _DISCOVERY_STATE.in_discovery = False


def select_runtime_engine_candidate(registry_entries: list[dict], settings: Optional[dict] = None) -> str:
    """Strictly return the configured `default_engine` from settings if it is valid (registered)
    and enabled in `enabled_plugins`. Otherwise return `""`."""
    if settings is None:
        try:
            from ..db.state_settings import get_settings
            settings = get_settings()
        except (ImportError, AttributeError, RecursionError):
            settings = {}

    enabled_plugins = settings.get("enabled_plugins") or {}
    explicit = settings.get("default_engine")
    if not explicit:
        return ""

    explicit_str = str(explicit).strip().lower()

    # Check if registered and enabled
    is_registered = any(entry.get("engine_id") == explicit_str for entry in registry_entries)
    if is_registered and enabled_plugins.get(explicit_str, True):
        return explicit_str

    return ""


def get_default_profile_engine(settings: Optional[dict] = None) -> str:
    """Resolve the system-wide default engine ID from settings or discovery."""
    if settings == {}:
        # Rule 9: Safe schema default for initial boot before discovery is ready.
        # This prevents problematic discovery calls during early module import.
        return ""

    # Use provided settings or try to fetch them
    if settings is None:
        try:
            from ..db.state_settings import get_settings
            settings = get_settings()
        except (ImportError, AttributeError, RecursionError):
            settings = {}

    manifests = _get_registry_manifests()
    return select_runtime_engine_candidate(manifests, settings)


def list_tts_engines() -> list[str]:
    return [entry["engine_id"] for entry in _get_registry_manifests() if entry.get("engine_id")]


def normalize_tts_engine(engine: Optional[str], fallback: Optional[str] = None, settings: Optional[dict] = None) -> str:
    """Normalize an engine ID, resolving to system default if invalid or empty."""
    valid = list_tts_engines()

    if settings is None:
        try:
            from ..db.state_settings import get_settings
            settings = get_settings()
        except (ImportError, AttributeError, RecursionError):
            settings = {}

    enabled_plugins = settings.get("enabled_plugins") or {}

    def is_valid_and_enabled(engine_id: Optional[str]) -> bool:
        if not engine_id:
            return False
        normalized = str(engine_id).strip().lower()
        return normalized in valid and enabled_plugins.get(normalized, True)

    # 1. Requested engine
    if is_valid_and_enabled(engine):
        return str(engine).strip().lower()

    # 2. Fallback engine
    if is_valid_and_enabled(fallback):
        return str(fallback).strip().lower()

    return ""


def is_tts_engine(engine: Optional[str]) -> bool:
    valid = list_tts_engines()
    return str(engine or "").strip().lower() in valid


def resolve_profile_engine(profile_name_or_id: Optional[str], fallback_engine: Optional[str] = None) -> str:
    if not profile_name_or_id:
        if not fallback_engine:
            return ""
        from ..engines.voice_engines import list_tts_engines
        try:
            from ..db.state_settings import get_settings
            settings = get_settings()
        except Exception:
            settings = {}
        enabled_plugins = settings.get("enabled_plugins") or {}
        normalized = str(fallback_engine).strip().lower()
        if normalized in list_tts_engines() and enabled_plugins.get(normalized, True):
            return normalized
        return ""
    try:
        from ..db.speakers import get_profile_engine
        return get_profile_engine(profile_name_or_id)
    except Exception:
        return ""


def resolve_tts_engine_for_profiles(
    profile_names: Iterable[Optional[str]],
    default_profile: Optional[str] = None,
    fallback_engine: Optional[str] = None,
) -> tuple[str, bool]:
    fallback = resolve_profile_engine(default_profile, fallback_engine)
    distinct_profiles = set(profile_names)
    resolved = {
        engine_id
        for engine_id in (
            resolve_profile_engine(profile_name, fallback)
            for profile_name in distinct_profiles
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
