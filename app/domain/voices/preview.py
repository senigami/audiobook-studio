"""Voice preview and test helpers."""

from __future__ import annotations

from app.engines import create_voice_bridge

from .models import VoicePreviewRequestModel


def preview_voice_profile(request: VoicePreviewRequestModel) -> dict[str, object]:
    """Prepare and route a preview request through the voice bridge."""

    payload = _build_preview_payload(request=request)
    return _route_preview_to_engine_bridge(payload=payload)


def _build_preview_payload(*, request: VoicePreviewRequestModel) -> dict[str, object]:
    """Normalize preview request fields before bridge-level routing."""

    return {
        "voice_profile_id": request.voice_profile_id,
        "engine_id": request.engine_id,
        "script_text": request.script_text.strip(),
        "reference_text": request.reference_text,
        "reference_audio_path": request.reference_audio_path,
        "voice_asset_id": request.voice_asset_id,
        "output_format": request.output_format,
    }


def _route_preview_to_engine_bridge(*, payload: dict[str, object]) -> dict[str, object]:
    """Describe how preview payloads should enter the engine bridge."""

    bridge = create_voice_bridge()
    try:
        response = bridge.preview(payload)
    except RuntimeError as exc:
        return _build_preview_preflight_response(payload=payload, error=exc)
    except (KeyError, ValueError) as exc:
        return {
            "status": "error",
            "bridge": "voice-preview-bridge",
            "reason": "invalid_request",
            "message": str(exc),
            "ephemeral": True,
            "preview_request": payload,
        }

    if "bridge" not in response:
        response["bridge"] = "voice-preview-bridge"
    response.setdefault("ephemeral", True)
    response.setdefault("preview_request", payload)
    return response


def _build_preview_preflight_response(
    *, payload: dict[str, object], error: RuntimeError
) -> dict[str, object]:
    """Normalize readiness and availability failures for preview/test callers."""

    message = str(error)
    reason = "engine_preflight_failed"
    if " is unavailable:" in message:
        reason = "engine_unavailable"
    elif " is not ready:" in message:
        reason = "engine_not_ready"

    return {
        "status": "error",
        "bridge": "voice-preview-bridge",
        "reason": reason,
        "message": message,
        "ephemeral": True,
        "preview_request": payload,
    }
