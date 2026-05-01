"""Shared utilities for the voice bridge."""

from __future__ import annotations
from typing import Any
from app.engines.behavior import extract_engine_settings
from app.engines.errors import EngineRequestError

INTENDED_UPSTREAM_CALLERS = (
    "app.domain.voices.preview",
    "app.orchestration.scheduler.orchestrator",
    "app.orchestration.tasks",
)
INTENDED_DOWNSTREAM_DEPENDENCIES = (
    "app.engines.registry.load_engine_registry",
    "app.engines.voice.base.BaseVoiceEngine",
    "app.engines.tts_client.TtsClient",
)
FORBIDDEN_DIRECT_IMPORTS = (
    "app.api.routers",
    "app.db",
    "app.jobs",
)


def extract_engine_id(request: dict[str, Any]) -> str:
    """Extract and validate engine_id from a request dictionary."""
    engine_id = str(request.get("engine_id") or "").strip()
    if not engine_id:
        raise EngineRequestError("Voice requests must include engine_id.")
    return engine_id


def extract_synthesis_settings(request: dict[str, Any]) -> dict[str, Any]:
    """Extract per-request synthesis settings for the TTS Server path."""
    return extract_engine_settings(extract_engine_id(request), request)


def infer_audio_format(output_path: str) -> str:
    """Infer audio format from output path extension."""
    return "mp3" if output_path.lower().endswith(".mp3") else "wav"
