"""Re-export shim — the SDK contract types moved to ``studio_plugin_sdk.types``.

Kept so every existing ``app.engines.voice.sdk`` importer keeps working with
identical object identity (plan 010 invariant 1). New code should import from
``studio_plugin_sdk`` directly.
"""

from __future__ import annotations

from studio_plugin_sdk.types import (
    SegmentTimingResult,
    SynthesisPlan,
    TimingEvent,
    TimingEventName,
    TTSRequest,
    TTSResult,
    TTSTimingResult,
    VerificationResult,
    VoiceProcessingHooks,
)

__all__ = [
    "TimingEventName",
    "TimingEvent",
    "SegmentTimingResult",
    "TTSTimingResult",
    "TTSRequest",
    "TTSResult",
    "VerificationResult",
    "SynthesisPlan",
    "VoiceProcessingHooks",
]
