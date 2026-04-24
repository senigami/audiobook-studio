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

    if not built_in and not verified:
        return False, "Verify this engine before activating the plugin."

    if normalized_status and normalized_status not in {"ready", "unverified"} and not built_in:
        return False, "Resolve the engine setup before enabling it."

    if normalized_engine_id == "voxtral":
        api_key = str(settings.get("mistral_api_key") or "").strip()
        if not api_key:
            return False, "Add a Mistral API key before enabling Voxtral."

    return True, ""
