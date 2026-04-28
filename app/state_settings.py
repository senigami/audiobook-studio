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
            "voxtral_enabled": False,
            "voxtral_model": "voxtral-mini-tts-2603",
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

    mistral_api_key = str(normalized.get("mistral_api_key") or "").strip()
    if mistral_api_key:
        normalized["mistral_api_key"] = mistral_api_key
    else:
        normalized.pop("mistral_api_key", None)

    explicit_voxtral_flag = "voxtral_enabled" in incoming_updates
    explicit_enabled_plugins = isinstance(incoming_updates.get("enabled_plugins"), dict) and "voxtral" in incoming_updates.get("enabled_plugins", {})

    if explicit_voxtral_flag:
        voxtral_enabled = bool(normalized.get("voxtral_enabled"))
    elif explicit_enabled_plugins:
        voxtral_enabled = bool((incoming_updates.get("enabled_plugins") or {}).get("voxtral"))
    elif incoming_updates:
        # Fresh write without an explicit toggle: keep legacy compatibility by
        # backfilling Voxtral on when the API key is present, even if the
        # persisted state was previously disabled.
        voxtral_enabled = bool(mistral_api_key)
    else:
        # Pure read / normalization of persisted state.
        voxtral_enabled = bool(normalized.get("voxtral_enabled"))
        if not voxtral_enabled:
            voxtral_enabled = bool(mistral_api_key)

    # Sync with enabled_plugins map
    enabled_plugins = normalized.get("enabled_plugins")
    if not isinstance(enabled_plugins, dict):
        enabled_plugins = {}

    # Prefer enabled_plugins["voxtral"] if it exists, otherwise fallback to voxtral_enabled
    if explicit_enabled_plugins:
        enabled_plugins["voxtral"] = bool((incoming_updates.get("enabled_plugins") or {}).get("voxtral"))
    elif explicit_voxtral_flag:
        enabled_plugins["voxtral"] = bool(voxtral_enabled)
    elif incoming_updates:
        enabled_plugins["voxtral"] = voxtral_enabled
    elif "voxtral" in enabled_plugins:
        # Preserve a previously explicit generic toggle on reads.
        voxtral_enabled = bool(enabled_plugins["voxtral"])
    else:
        enabled_plugins["voxtral"] = voxtral_enabled

    # Ensure mistral_api_key requirement is respected
    if not mistral_api_key:
        voxtral_enabled = False
        enabled_plugins["voxtral"] = False

    normalized["voxtral_enabled"] = voxtral_enabled
    normalized["enabled_plugins"] = enabled_plugins

    verified_plugins = normalized.get("verified_plugins")
    if not isinstance(verified_plugins, dict):
        verified_plugins = {}
    normalized["verified_plugins"] = verified_plugins

    voxtral_model = str(normalized.get("voxtral_model") or "").strip() or defaults["voxtral_model"]
    if voxtral_model == "voxtral-tts":
        voxtral_model = defaults["voxtral_model"]
    normalized["voxtral_model"] = voxtral_model

    if normalized["default_engine"] == "voxtral" and not normalized.get("mistral_api_key"):
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
