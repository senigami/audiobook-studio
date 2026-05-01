import json
from typing import Dict, Any, Optional

from .voice_engines import normalize_tts_engine
from .state_helpers import _STATE_LOCK, _load_state_no_lock, _atomic_write_text, get_state_file


def _default_state() -> Dict[str, Any]:
    return {
        "jobs": {},
        "settings": {
            "safe_mode": True,
            "default_engine": "xtts",
            "enabled_plugins": {},
            "verified_plugins": {},
            "tts_api_enabled": False,
            "tts_api_key": "",
            "tts_api_rate_limit": 10,
            "lan_binding_enabled": False,
            "api_priority_mode": "studio_first",
        },
    }


def _normalize_settings(
    settings: Optional[Dict[str, Any]],
    *,
    incoming_updates: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    defaults = _default_state()["settings"].copy()
    normalized = defaults.copy()
    if settings:
        normalized.update(settings)
    incoming_updates = incoming_updates or {}

    normalized["safe_mode"] = bool(normalized.get("safe_mode", defaults["safe_mode"]))
    normalized.pop("make_mp3", None)
    normalized["default_engine"] = normalize_tts_engine(normalized.get("default_engine"), defaults["default_engine"])

    # (Removed hardcoded mistral_api_key cleanup, handled by generic logic below)

    # Enforce enabled_plugins as the source of truth for plugin enablement.
    # Legacy voxtral_enabled is used only for migration.
    enabled_plugins = normalized.get("enabled_plugins")
    if not isinstance(enabled_plugins, dict):
        enabled_plugins = {}

    # 1. Check for legacy flags and migrate them if not already in enabled_plugins
    legacy_map = {
        "voxtral_enabled": "voxtral",
    }
    if "xtts_speed" in normalized and "speed" not in normalized:
        normalized["speed"] = normalized.pop("xtts_speed")
    for legacy_flag, target_id in legacy_map.items():
        if legacy_flag in normalized and target_id not in enabled_plugins:
            enabled_plugins[target_id] = bool(normalized[legacy_flag])

    # 2. Check for explicit incoming updates to the plugin map
    if incoming_updates and isinstance(incoming_updates.get("enabled_plugins"), dict):
        enabled_plugins.update(incoming_updates["enabled_plugins"])

    # 3. Ensure required settings are respected for each enabled plugin
    from .engines.behavior import required_settings_for
    for engine_id, is_enabled in list(enabled_plugins.items()):
        if not is_enabled:
            continue
        requirements = required_settings_for(engine_id)
        for req in requirements:
            setting_name = req["name"]
            val = str(normalized.get(setting_name) or "").strip()
            if not val:
                import logging
                logging.getLogger(__name__).info("Disabling plugin %s due to missing required setting %s", engine_id, setting_name)
                enabled_plugins[engine_id] = False
                break
            else:
                # Cleanup: ensure it's a stripped string in the final settings
                normalized[setting_name] = val

    normalized["enabled_plugins"] = enabled_plugins
    normalized.pop("voxtral_enabled", None)

    verified_plugins = normalized.get("verified_plugins")
    if not isinstance(verified_plugins, dict):
        verified_plugins = {}
    normalized["verified_plugins"] = verified_plugins

    # 5. Check if default_engine is still enabled
    if not enabled_plugins.get(normalized["default_engine"], True):
        normalized["default_engine"] = defaults["default_engine"]

    default_speaker = str(normalized.get("default_speaker_profile") or "").strip()
    if default_speaker:
        normalized["default_speaker_profile"] = default_speaker
    else:
        normalized.pop("default_speaker_profile", None)

    # External TTS API settings
    normalized["tts_api_enabled"] = bool(normalized.get("tts_api_enabled", defaults["tts_api_enabled"]))
    normalized["tts_api_key"] = str(normalized.get("tts_api_key") or "").strip()
    normalized["tts_api_rate_limit"] = int(normalized.get("tts_api_rate_limit", defaults["tts_api_rate_limit"]))
    normalized["lan_binding_enabled"] = bool(normalized.get("lan_binding_enabled", defaults["lan_binding_enabled"]))

    priority_mode = str(normalized.get("api_priority_mode") or defaults["api_priority_mode"])
    if priority_mode not in ("studio_first", "equal", "api_first"):
        priority_mode = defaults["api_priority_mode"]
    normalized["api_priority_mode"] = priority_mode

    return normalized


def get_settings() -> Dict[str, Any]:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        raw_settings = state.get("settings", {})
        return _normalize_settings(raw_settings)


def update_settings(updates: dict = None, **kwargs) -> None:
    with _STATE_LOCK:
        state = _load_state_no_lock()
        state.setdefault("settings", {})
        merged_updates: Dict[str, Any] = {}
        if updates:
            merged_updates.update(updates)
        if kwargs:
            merged_updates.update(kwargs)
        state["settings"].update(merged_updates)
        state["settings"] = _normalize_settings(state["settings"], incoming_updates=merged_updates)
        _atomic_write_text(get_state_file(), json.dumps(state, indent=2))
