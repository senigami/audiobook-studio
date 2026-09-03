"""Studio Plugin SDK — the real, top-level package.

This is the published contract between Audiobook Studio and its TTS plugin
bundles.  Plugins import from here directly:

    from studio_plugin_sdk import StudioTTSEngine, TTSRequest, TTSResult
    from studio_plugin_sdk import StudioPluginContext, JobSpec, JobResult
    from studio_plugin_sdk.errors import BridgeError

The app-side modules (``app.engines.voice.sdk``, ``app.studio_plugin_sdk``)
are thin re-export shims over this package, so both import paths resolve to
the identical objects.

Importing this package has zero side effects (no threads, no listeners, no
``sys.modules`` mutation) — required by ``modular_architecture.md``.
"""

from __future__ import annotations

# Server-side contract — runs in the TTS Server subprocess
from .engine import StudioTTSEngine
from .types import (
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

# Studio-side contract — runs in the Studio (FastAPI) host process
from .context import JobResult, JobSpec, StudioPluginContext
from .errors import BridgeError, StudioException, ValidationError
from .engine_models import EngineHealthModel, EngineManifestModel, ResourceProfile
from .engine_adapter import (
    VoiceEngineAdapter,
    normalize_output_format,
    resolve_cancel_check,
    resolve_on_output,
    resolve_output_path,
)
from .engine_errors import (
    EngineBridgeError,
    EngineExecutionError,
    EngineNotReadyError,
    EngineOutputRejectedError,
    EngineRequestError,
    EngineUnavailableError,
)
from .plugin_utils import get_plugin_ctx, load_settings_schema, make_segment_output_handler

SDK_VERSION = "1.2"
__version__ = SDK_VERSION

__all__ = [
    "SDK_VERSION",
    "__version__",
    # Server-side
    "StudioTTSEngine",
    "TTSRequest",
    "TTSResult",
    "TTSTimingResult",
    "SegmentTimingResult",
    "TimingEvent",
    "TimingEventName",
    "VerificationResult",
    "VoiceProcessingHooks",
    "SynthesisPlan",
    # Studio-side
    "StudioPluginContext",
    "JobSpec",
    "JobResult",
    "get_plugin_ctx",
    "load_settings_schema",
    "make_segment_output_handler",
    # Errors
    "StudioException",
    "BridgeError",
    "ValidationError",
    # App-adapter contract (the class the Studio host calls into)
    "VoiceEngineAdapter",
    "normalize_output_format",
    "resolve_output_path",
    "resolve_on_output",
    "resolve_cancel_check",
    # Engine discovery models (accepted and returned by app-side plugin adapters)
    "ResourceProfile",
    "EngineManifestModel",
    "EngineHealthModel",
    # Engine bridge errors (raised and caught by app-side plugin adapters)
    "EngineBridgeError",
    "EngineExecutionError",
    "EngineNotReadyError",
    "EngineOutputRejectedError",
    "EngineRequestError",
    "EngineUnavailableError",
]
