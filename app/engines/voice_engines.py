from pathlib import Path
from typing import Iterable, Optional
import threading

_DISCOVERY_LOCK = threading.Lock()
_IN_DISCOVERY = False

def _get_registry_manifests() -> list[dict]:
    """Helper to fetch engine registry manifests once without recursion."""
    global _IN_DISCOVERY
    if _IN_DISCOVERY:
        return []
    _IN_DISCOVERY = True
    try:
        from ..engines.bridge import create_voice_bridge
        bridge = create_voice_bridge()
        return bridge.describe_registry()
    except Exception as e:
        import logging
        logging.getLogger(__name__).debug("Registry discovery failed: %s", e)
        return []
    finally:
        _IN_DISCOVERY = False


def select_runtime_engine_candidate(registry_entries: list[dict], settings: Optional[dict] = None) -> str:
    """Ranks active/enabled engines based on ranking guidelines to select a runtime candidate:
    1. Explicit default engine (if enabled) wins.
    2. Enabled local non-cloud, non-network engine is preferred.
    3. Enabled local engine is preferred.
    4. Stable registry order fallback.
    """
    if settings is None:
        try:
            from ..db.state_settings import get_settings
            settings = get_settings()
        except (ImportError, AttributeError, RecursionError):
            settings = {}

    enabled_plugins = settings.get("enabled_plugins") or {}
    explicit = settings.get("default_engine")

    if not registry_entries:
        return str(explicit).strip().lower() if explicit else ""

    # Map manifest payload representation to dict
    active_entries = []
    for entry in registry_entries:
        eid = entry.get("engine_id")
        if not eid:
            continue
        if enabled_plugins.get(eid, True):
            active_entries.append(entry)

    active_ids = {entry["engine_id"] for entry in active_entries}

    if explicit:
        explicit_str = str(explicit).strip().lower()
        if explicit_str in active_ids:
            return explicit_str

    if not active_entries:
        return ""

    # Helper function to rank active engines.
    # Lower number = higher priority.
    def rank_key(e):
        # Retrieve properties from manifest representation.
        manifest = e.get("manifest") or {}

        is_local = e.get("local")
        if is_local is None:
            is_local = manifest.get("local", True)

        is_cloud = e.get("cloud")
        if is_cloud is None:
            is_cloud = manifest.get("cloud", False)

        is_network = e.get("network")
        if is_network is None:
            is_network = manifest.get("network", False)

        is_local = bool(is_local)
        is_cloud = bool(is_cloud)
        is_network = bool(is_network)

        if is_local and not is_cloud and not is_network:
            return 0
        elif is_local:
            return 1
        else:
            return 2

    # Timsort is stable, so we preserve the original/registry ordering for equal ranks.
    sorted_active = sorted(active_entries, key=rank_key)
    return sorted_active[0]["engine_id"]


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
            explicit = settings.get("default_engine")
            if explicit and normalized == str(explicit).strip().lower():
                return normalized
            if fallback and normalized == str(fallback).strip().lower():
                return normalized
            return ""
        return ""

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
    fallback = normalize_tts_engine(fallback_engine, fallback=fallback_engine)
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
