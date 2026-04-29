from __future__ import annotations

from typing import Any, Mapping


def can_enable_engine(
    engine_id: str,
    *,
    current_settings: Mapping[str, Any] | None = None,
    built_in: bool = False,
    verified: bool = False,
    status: str | None = None,
) -> tuple[bool, str]:
    """Return whether an engine can be toggled on.

    The Studio UI uses this to decide whether the enable switch should be
    interactive and the backend uses it to reject enablement requests that
    would leave the engine in a known-bad state.
    """
    normalized_engine_id = str(engine_id or "").strip().lower()
    settings = current_settings or {}
    normalized_status = str(status or "").strip().lower()

    # Status constants are imported here to avoid circular dependencies if needed,
    # but we can also use literals since they are stable.
    STATUS_READY = "ready"
    STATUS_UNVERIFIED = "unverified"

    # Built-in engines are always toggleable if their setup is ready
    if built_in:
        if normalized_status == STATUS_READY:
            return True, ""
        return False, "Complete the built-in engine setup before enabling."

    # Verification is required for all non-built-in plugins
    if not verified:
        return False, "Verify this engine before activating the plugin."

    # Status check
    if normalized_status and normalized_status not in {STATUS_READY, STATUS_UNVERIFIED}:
        return False, "Resolve the engine setup before enabling it."

    # Voxtral specific requirement: Mistral API key
    if normalized_engine_id == "voxtral":
        # Check both global settings and plugin-specific settings
        api_key = str(settings.get("mistral_api_key") or "").strip()
        if not api_key:
            # Try to load from plugin settings as a fallback if the UI saved it there
            from app.tts_server.settings_store import load_settings # noqa: PLC0415
            from app.tts_server.plugin_loader import get_plugin_dir # noqa: PLC0415
            try:
                p_dir = get_plugin_dir(normalized_engine_id)
                if p_dir:
                    p_settings = load_settings(p_dir)
                    api_key = str(p_settings.get("mistral_api_key") or "").strip()
            except Exception:
                pass

        if not api_key:
            return False, "Add a Mistral API key in engine settings before enabling Voxtral."

    return True, ""
