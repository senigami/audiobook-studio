"""Reference plugin engine for Studio TTS plugin authors.

This file is intentionally small and readable. Copy it into a real plugin
folder, then replace the placeholder synthesis logic with your engine code.
"""

from __future__ import annotations

import math
import wave
from pathlib import Path
from typing import Any

try:
    # In a packaged plugin, this would typically come from the published SDK.
    from studio_tts_sdk import SynthesisPlan, TTSRequest, TTSResult, VoiceProcessingHooks, StudioTTSEngine
except ImportError:  # pragma: no cover - convenience path for Studio source tree copies
    from app.engines.voice.sdk import SynthesisPlan, TTSRequest, TTSResult, VoiceProcessingHooks
    from app.engines.voice.base import StudioTTSEngine


class ExampleProcessingHooks(VoiceProcessingHooks):
    """Optional hook implementation used by the template engine."""

    def plan_synthesis(self, req: TTSRequest) -> SynthesisPlan:
        settings = req.settings or {}
        return SynthesisPlan(
            chunk_size=int(settings.get("chunk_size", 220)),
            speed_factor=float(settings.get("speed_factor", 1.0)),
            emotion=str(settings.get("emotion") or "") or None,
            metadata={"template": True},
        )

    def preprocess_request(self, request: dict[str, Any]) -> None:
        request.setdefault("speed", 1.0)
        request.setdefault("voice_id", request.get("settings", {}).get("voice_id", "default"))

    def select_voice(self, profile_id: str, settings: dict[str, Any]) -> str | None:
        return settings.get("voice_id") or None

    def postprocess_audio(self, output_path: str, settings: dict[str, Any]) -> None:
        # Template hook: no-op. Real plugins can normalize, tag, or clean up audio here.
        return None

    def check_readiness(self, profile_id: str, settings: dict[str, Any], profile_dir: str | None) -> tuple[bool, str]:
        """Check if a voice profile is ready for synthesis.
        
        Template implementation requires at least one .wav file in the profile.
        """
        import os
        if profile_dir and os.path.isdir(profile_dir):
            wavs = [f for f in os.listdir(profile_dir) if f.lower().endswith(".wav") and f != "sample.wav"]
            if wavs:
                return True, "OK"
        return False, "Add at least one sample before using this voice."


class ExampleTTSEngine(StudioTTSEngine):
    """Tiny example engine that writes silence so the plugin loads cleanly."""

    def hooks(self) -> VoiceProcessingHooks:
        return ExampleProcessingHooks()

    def info(self) -> dict[str, Any]:
        return {
            "engine_family": "example",
            "runtime": "template",
            "supports_preview": True,
        }

    def check_env(self) -> tuple[bool, str]:
        return True, "OK"

    def check_request(self, req: TTSRequest) -> tuple[bool, str]:
        if not req.text.strip():
            return False, "Text is required"
        if not req.output_path:
            return False, "Output path is required"
        return True, "OK"

    def synthesize(self, req: TTSRequest) -> TTSResult:
        output_path = Path(req.output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        settings = req.settings or {}
        sample_rate = int(settings.get("sample_rate", 22050))
        speed_factor = float(settings.get("speed_factor", 1.0))
        seconds = max(0.25, min(3.0, len(req.text) / 80.0))
        if speed_factor > 0:
            seconds /= speed_factor
        frame_count = max(1, math.floor(sample_rate * seconds))

        with wave.open(str(output_path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(b"\x00\x00" * frame_count)

        return TTSResult(
            ok=True,
            output_path=str(output_path),
            duration_sec=seconds,
            warnings=[],
        )

    def settings_schema(self) -> dict[str, Any]:
        return {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
                "sample_rate": {
                    "type": "integer",
                    "title": "Sample Rate",
                    "default": 22050,
                    "minimum": 8000,
                    "maximum": 48000,
                },
                "speed_factor": {
                    "type": "number",
                    "title": "Speed Factor",
                    "default": 1.0,
                    "minimum": 0.5,
                    "maximum": 2.0,
                },
                "voice_id": {
                    "type": "string",
                    "title": "Default Voice ID",
                    "description": "Optional engine-specific voice identifier.",
                },
            },
            "required": [],
        }

    def preview(self, req: TTSRequest) -> TTSResult:
        # Template preview just uses the same simple synthesis path.
        return self.synthesize(req)

    def shutdown(self) -> None:
        return None
