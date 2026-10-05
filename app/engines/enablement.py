from __future__ import annotations

from typing import Any, Mapping

from app.engines.behavior import required_settings_for


def can_enable_engine(
    engine_id: str,
    *,
    current_settings: Mapping[str, Any] | None = None,
    built_in: bool = False,
    verified: bool = False,
    status: str | None = None,
    behavior: Mapping[str, Any] | None = None,
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

    for requirement in required_settings_for(normalized_engine_id, behavior=behavior):
        setting_name = requirement["name"]
        if not str(settings.get(setting_name) or "").strip():
            message = requirement.get("message") or f"Set {setting_name} before enabling this engine."
            return False, message

    return True, ""
