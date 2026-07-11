"""Studio Plugin SDK — public namespace.

Plugin handlers running in the Studio process import from here:

    from studio_plugin_sdk import StudioPluginContext, JobSpec, JobResult
    from studio_plugin_sdk.errors import BridgeError

Engine implementations running in the TTS Server subprocess import the
SDK types (TTSRequest, TTSResult, etc.) from here:

    from studio_plugin_sdk import StudioTTSEngine, TTSRequest, TTSResult

Both halves are satisfied by this single package; ``plugin_loader.py``
registers it in ``sys.modules`` so it is resolvable in both processes.
"""

from __future__ import annotations

__version__ = "1.0"

# Server-side contract — runs in the TTS Server subprocess
from app.engines.voice.base import StudioTTSEngine
from app.engines.voice.sdk import (
    TTSRequest,
    TTSResult,
    TimingEvent,
    VerificationResult,
    VoiceProcessingHooks,
    SynthesisPlan,
)

# Studio-side contract — runs in the Studio (FastAPI) process
from app.studio_plugin_sdk.context import (
    StudioPluginContext,
    JobSpec,
    JobResult,
)
from app.studio_plugin_sdk.plugin_utils import get_plugin_ctx, load_settings_schema

# App-side engine-adapter contract — the base class and data/error types a
# plugin's app_adapter.py subclasses/raises to register with the app's engine
# registry / VoiceBridge. Distinct from StudioTTSEngine (the server-side,
# per-job contract) — this is the reverse-direction "app calls into plugin"
# adapter surface.
from app.engines.voice.base import BaseVoiceEngine
from app.engines.models import EngineHealthModel, EngineManifestModel
from app.engines.errors import EngineExecutionError, EngineRequestError

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
    "BaseVoiceEngine",
    "EngineHealthModel",
    "EngineManifestModel",
    "EngineExecutionError",
    "EngineRequestError",
]
