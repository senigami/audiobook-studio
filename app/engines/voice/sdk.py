"""Studio TTS SDK contract types.

These dataclasses form the published interface between the TTS Server and
plugin engine implementations.  Plugin authors import from this module only —
they must not import anything from the rest of ``app``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class TTSRequest:
    """Immutable synthesis request passed from the TTS Server to an engine.

    The TTS Server constructs this from the incoming HTTP request and passes it
    directly to the engine's ``synthesize()`` or ``preview()`` method.

    Attributes:
        text: The text to synthesize.  Already pre-cleaned by the caller.
        output_path: Absolute filesystem path where the engine must write the
            output audio file.  Created by the TTS Server; the engine only
            writes to it.
        voice_ref: Optional absolute path to a reference audio WAV file used
            for voice cloning or speaker conditioning.
        settings: Engine-specific settings dict loaded from the engine's
            ``settings.json``.  Keys and value types match the engine's own
            ``settings_schema.json``.
        language: BCP-47 language code, e.g. ``"en"``, ``"es"``.
        script: Optional structured multi-segment script for batch synthesis.
    """

    text: str
    output_path: str
    voice_ref: str | None = None
    settings: dict[str, Any] = field(default_factory=dict)
    language: str = "en"
    script: list[dict[str, Any]] | None = None


@dataclass
class TTSResult:
    """Result returned by an engine after synthesis or preview.

    Engines must return this from ``synthesize()`` and ``preview()``.  On
    failure, set ``ok=False`` and populate ``error``; do not raise.

    Attributes:
        ok: ``True`` when synthesis completed and a valid audio file was
            written to ``output_path``.
        output_path: Absolute path to the written audio file, or ``None`` when
            ``ok`` is ``False``.
        duration_sec: Duration of the generated audio in seconds, or ``None``
            when unavailable.
        warnings: Non-fatal messages the engine wants to surface to the user.
        error: Human-readable error message when ``ok`` is ``False``.
    """

    ok: bool
    output_path: str | None = None
    duration_sec: float | None = None
    warnings: list[str] = field(default_factory=list)
    error: str | None = None


@dataclass(frozen=True)
class VerificationResult:
    """Result returned by an engine after a fast readiness check (verify).

    Attributes:
        ok: True when the engine is fully ready for production.
        message: Human-readable status message or error details.
        details: Optional additional metadata (e.g. GPU info, model version).
    """

    ok: bool
    message: str = "OK"
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SynthesisPlan:
    """A processing plan returned by a plugin hook to influence generation.

    Attributes:
        chunk_size: Suggested maximum character count per synthesis chunk.
        speed_factor: Relative speed adjustment (1.0 = normal).
        requires_cleanup: Whether the caller should scrub artifacts after completion.
        metadata: Any engine-specific context to carry forward to synthesis.
    """
    chunk_size: int | None = None
    speed_factor: float = 1.0
    emotion: str | None = None
    requires_cleanup: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


class VoiceProcessingHooks:
    """Optional hooks for customizing the audio generation lifecycle.

    Plugins can implement these hooks to influence how Studio prepares,
    executes, and finalizes voice synthesis.
    """

    def plan_synthesis(self, req: TTSRequest) -> SynthesisPlan:
        """Called before synthesis to determine chunking and scaling policy.

        Default implementation returns a standard plan with no overrides.
        """
        return SynthesisPlan()

    def preprocess_request(self, request: dict[str, Any]) -> None:
        """Optional hook to modify the raw request dictionary before dispatch.

        Use this to resolve engine-specific paths, apply defaults, or transform
        request parameters before validation.
        """
        pass

    def select_voice(self, profile_id: str, settings: dict[str, Any]) -> str | None:
        """Resolve a speaker profile into an engine-specific voice identifier.

        Returns None to use the default voice.
        """
        return None

    def postprocess_audio(self, output_path: str, settings: dict[str, Any]) -> None:
        """Called after synthesis to apply engine-specific cleanup or effects."""
        pass

    def check_readiness(self, profile_id: str, settings: dict[str, Any], profile_dir: str | None) -> tuple[bool, str]:
        """Check if a voice profile has sufficient material for synthesis.

        Returns (True, "OK") if ready, or (False, "Error message") otherwise.
        Default implementation checks for raw samples in the profile directory.
        """
        import os
        if profile_dir and os.path.isdir(profile_dir):
            wavs = [f for f in os.listdir(profile_dir) if f.lower().endswith(".wav") and f != "sample.wav"]
            if wavs:
                return True, "OK"
        return False, "No samples found in profile."
