import json
from typing import Dict, Any, Optional

from ..engines.voice_engines import normalize_tts_engine, get_default_profile_engine
from .state_helpers import _STATE_LOCK, _load_state_no_lock, _atomic_write_text, get_state_file


def _default_state() -> Dict[str, Any]:
    return {
        "jobs": {},
        "settings": {
            "safe_mode": True,
            "default_engine": get_default_profile_engine(settings={}),
            "enabled_plugins": {},
            "verified_plugins": {},
            "tts_api_enabled": False,
            "tts_api_key": "",
            "tts_api_rate_limit": 10,
            "lan_binding_enabled": False,
            "api_priority_mode": "studio_first",
            "huggingface_token": "",
            "tts_parallel_cap": 1,
            "tts_engine_caps": {},
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
    normalized["default_engine"] = normalize_tts_engine(normalized.get("default_engine"), settings=normalized)

    # Plugin-specific keys are preserved for plugin discovery logic.

    # Enforce enabled_plugins as the source of truth for plugin enablement.

    # 2. Enforce enabled_plugins as the source of truth for plugin enablement.
    enabled_plugins = normalized.get("enabled_plugins")
    if not isinstance(enabled_plugins, dict):
        enabled_plugins = {}

    # 3. Check for explicit incoming updates to the plugin map
    if incoming_updates and isinstance(incoming_updates.get("enabled_plugins"), dict):
        enabled_plugins.update(incoming_updates["enabled_plugins"])

    # 4. Ensure required settings are respected for each enabled plugin
    from ..engines.behavior import required_settings_for
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

    verified_plugins = normalized.get("verified_plugins")
    if not isinstance(verified_plugins, dict):
        verified_plugins = {}
    normalized["verified_plugins"] = verified_plugins

    # 5. Check if default_engine is still enabled
    if not enabled_plugins.get(normalized["default_engine"], True):
        normalized["default_engine"] = ""

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
    normalized["huggingface_token"] = str(normalized.get("huggingface_token") or "").strip()

    priority_mode = str(normalized.get("api_priority_mode") or defaults["api_priority_mode"])
    if priority_mode not in ("studio_first", "equal", "api_first"):
        priority_mode = defaults["api_priority_mode"]
    normalized["api_priority_mode"] = priority_mode

    # W-PAR task 007: cap-default-1 toggle surfaced as a real setting.
    # Default 1 preserves INV-1 "ships dark" — no behavior change until an
    # operator explicitly raises this. Effective cap is further clamped to
    # each engine's manifest max_concurrent_workers at claim-build time
    # (app.orchestration.scheduler.cap_settings.resolve_effective_cap).
    try:
        normalized["tts_parallel_cap"] = max(1, int(normalized.get("tts_parallel_cap", 1)))
    except (TypeError, ValueError):
        normalized["tts_parallel_cap"] = defaults["tts_parallel_cap"]

    engine_caps = normalized.get("tts_engine_caps")
    if not isinstance(engine_caps, dict):
        engine_caps = {}
    coerced_caps: Dict[str, int] = {}
    for engine_id, cap_value in engine_caps.items():
        try:
            coerced_caps[str(engine_id)] = max(1, int(cap_value))
        except (TypeError, ValueError):
            continue
    normalized["tts_engine_caps"] = coerced_caps

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

        orig_settings = state["settings"].copy()
        orig_default_engine_present = "default_engine" in orig_settings
        orig_default_engine_val = orig_settings.get("default_engine")

        merged_updates: Dict[str, Any] = {}
        if updates:
            merged_updates.update(updates)
        if kwargs:
            merged_updates.update(kwargs)

        state["settings"].update(merged_updates)
        normalized = _normalize_settings(state["settings"], incoming_updates=merged_updates)

        save_settings = normalized.copy()
        if "default_engine" in merged_updates:
            # User explicitly updated default_engine, so we save the exact new value
            save_settings["default_engine"] = merged_updates["default_engine"]
        elif orig_default_engine_present:
            # Preserve the exact original default_engine value on disk
            save_settings["default_engine"] = orig_default_engine_val
        else:
            # Omit default_engine to prevent persisting inferred default settings
            save_settings.pop("default_engine", None)

        state["settings"] = save_settings
        _atomic_write_text(get_state_file(), json.dumps(state, indent=2))
