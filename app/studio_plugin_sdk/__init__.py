"""Studio Plugin SDK — app-side re-export shim.

The real SDK lives in the top-level ``studio_plugin_sdk`` package at the
repo root; this namespace re-exports it (identical object identity) so
existing ``app.studio_plugin_sdk`` importers keep working.

It additionally exposes the app-adapter contract (``BaseVoiceEngine`` and
the engine data/error models) which is app-side only and deliberately NOT
part of the real SDK package.
"""

from __future__ import annotations

# Re-exported, never re-declared: a second literal here would drift from the
# real package on the next bump (issue #200).
from studio_plugin_sdk import SDK_VERSION

__version__ = SDK_VERSION

# Server-side contract — runs in the TTS Server subprocess
from studio_plugin_sdk import (
    JobResult,
    JobSpec,
    StudioPluginContext,
    StudioTTSEngine,
    SynthesisPlan,
    TimingEvent,
    TTSRequest,
    TTSResult,
    VerificationResult,
    VoiceProcessingHooks,
    get_plugin_ctx,
    load_settings_schema,
)

# App-side engine-adapter contract — the base class and data/error types a
# plugin's app_adapter.py subclasses/raises to register with the app's engine
# registry / VoiceBridge. Distinct from StudioTTSEngine (the server-side,
# per-job contract) — this is the reverse-direction "app calls into plugin"
# adapter surface. Stays app-side: not exported by the real SDK package.
from studio_plugin_sdk import VoiceEngineAdapter
from app.engines.voice.base import BaseVoiceEngine
from app.engines.models import EngineHealthModel, EngineManifestModel
from app.engines.errors import (
    EngineBridgeError,
    EngineExecutionError,
    EngineNotReadyError,
    EngineOutputRejectedError,
    EngineRequestError,
    EngineUnavailableError,
)

__all__ = [
    "__version__",
    # Server-side
    "StudioTTSEngine",
    "TTSRequest",
    "TTSResult",
    "TimingEvent",
    "VerificationResult",
    "VoiceProcessingHooks",
    "SynthesisPlan",
    # Studio-side
    "StudioPluginContext",
    "JobSpec",
    "JobResult",
    "get_plugin_ctx",
    "load_settings_schema",
    # App-adapter contract
    "VoiceEngineAdapter",
    "BaseVoiceEngine",
    "EngineHealthModel",
    "EngineManifestModel",
    "EngineBridgeError",
    "EngineExecutionError",
    "EngineNotReadyError",
    "EngineOutputRejectedError",
    "EngineRequestError",
    "EngineUnavailableError",
]
