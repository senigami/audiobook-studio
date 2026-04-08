"""Voice preview and test helpers.

This module is intentionally separate from project rendering so preview/test
flows can stay lightweight and isolated.
"""

from app.engines.bridge import create_voice_bridge

from .models import VoicePreviewRequestModel


def preview_voice_profile(request: VoicePreviewRequestModel) -> dict[str, object]:
    """Prepare and route a preview request through the voice bridge.

    Args:
        request: Preview request containing profile, script, and optional
            engine-specific references.

    Returns:
        dict[str, object]: Placeholder preview result payload.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    payload = _build_preview_payload(request=request)
    _ = _route_preview_to_engine_bridge(payload=payload)
    raise NotImplementedError


def _build_preview_payload(*, request: VoicePreviewRequestModel) -> dict[str, object]:
    """Normalize preview request fields before bridge-level routing.

    Args:
        request: Preview request contract from the voice domain service.

    Returns:
        dict[str, object]: Bridge-ready preview payload.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    raise NotImplementedError


def _route_preview_to_engine_bridge(*, payload: dict[str, object]) -> dict[str, object]:
    """Describe how preview payloads should enter the engine bridge.

    Args:
        payload: Bridge-ready preview payload.

    Returns:
        dict[str, object]: Placeholder preview routing result.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = create_voice_bridge
    raise NotImplementedError
