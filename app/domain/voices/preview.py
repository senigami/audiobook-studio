"""Voice preview and test helpers."""

from __future__ import annotations

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

    return {
        "status": "ok",
        "bridge": "voice-preview-contract",
        "preview": payload,
    }
