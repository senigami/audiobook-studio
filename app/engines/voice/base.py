"""Base voice engine contracts (app side).

- ``BaseVoiceEngine`` - preserved for app-side bridge compatibility;
  engine-specific implementation is strictly owned by plugin bundles.

- ``StudioTTSEngine`` - the public SDK contract; its definition moved to the
  real top-level SDK package (``studio_plugin_sdk.engine``) and is re-exported
  here with identical object identity for existing importers.  Plugins run
  inside the TTS Server subprocess and are discovered via the agnostic root
  ``tts_engines/`` bundle scan.

New engines should implement ``studio_plugin_sdk.StudioTTSEngine``.
"""

from __future__ import annotations

from typing import Any

from studio_plugin_sdk.engine import StudioTTSEngine
from studio_plugin_sdk.engine_adapter import (
    normalize_output_format,
    resolve_cancel_check,
    resolve_on_output,
    resolve_output_path,
)
from app.engines.models import EngineHealthModel
from app.engines.voice.sdk import (  # noqa: F401 — re-exported for back-compat
    TTSRequest,
    TTSResult,
    VerificationResult,
    VoiceProcessingHooks,
)

__all__ = [
    "BaseVoiceEngine",
    "StudioTTSEngine",
    "TTSRequest",
    "TTSResult",
    "VerificationResult",
    "VoiceProcessingHooks",
]


class BaseVoiceEngine:
    """Shared voice engine contract.

    Provides app-side bridge compatibility with engine adapters while
    the plugin bundles strictly own the synthesis logic.
    """

    def hooks(self) -> VoiceProcessingHooks:
        """Return processing hooks for this engine.

        Defaults to a no-op implementation.
        """
        return VoiceProcessingHooks()

    def describe_health(self) -> EngineHealthModel:
        """Summarize module readiness for discovery and diagnostics."""

        raise NotImplementedError

    def validate_environment(self) -> None:
        """Check whether the engine can run in the current environment."""
        raise NotImplementedError("Subclasses must implement validate_environment")

    def validate_request(self, request: dict[str, object]) -> None:
        """Validate an engine-specific request before synthesis or preview.

        Args:
            request: Engine-ready request payload.
        """
        raise NotImplementedError("Subclasses must implement validate_request")

    def synthesize(self, request: dict[str, object]) -> dict[str, object]:
        """Synthesize audio for a canonical voice request.

        Args:
            request: Engine-ready synthesis payload.

        Returns:
            dict[str, object]: Synthesis result payload.
        """
        raise NotImplementedError("Subclasses must implement synthesize")

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Run preview or test synthesis for a lightweight voice request.

        Args:
            request: Engine-ready preview payload.

        Returns:
            dict[str, object]: Preview result payload.
        """
        raise NotImplementedError("Subclasses must implement preview")

    def settings_schema(self) -> dict[str, Any]:
        """Return engine-specific configuration schema.

        Plugin-based engines may not expose configurable settings yet, so
        the default implementation returns an empty schema.
        """
        return {}

    def current_settings(self) -> dict[str, Any]:
        """Return the engine's current persisted settings snapshot."""
        return {}

    def build_voice_asset(self, request: dict[str, object]) -> dict[str, object]:
        """Build or refresh engine-specific voice assets for a profile.

        Args:
            request: Engine-ready voice-asset build payload.

        Returns:
            dict[str, object]: Asset-build result payload.
        """
        raise NotImplementedError("Subclasses must implement build_voice_asset")

    # ------------------------------------------------------------------
    # Shared request-adapter helpers (PL-3)
    # ------------------------------------------------------------------
    #
    # These are the SDK's own functions, bound here rather than reimplemented,
    # so `self.normalize_output_format(...)` and
    # `studio_plugin_sdk.normalize_output_format(...)` cannot drift apart
    # (issue #200 Stage C). They were classmethod/staticmethod and never used
    # `cls`, so the `self.`-prefixed call shape in existing adapters is
    # unchanged. `tests/engines/test_sdk_engine_adapter.py` asserts the
    # identity.

    normalize_output_format = staticmethod(normalize_output_format)
    resolve_output_path = staticmethod(resolve_output_path)
    resolve_on_output = staticmethod(resolve_on_output)
    resolve_cancel_check = staticmethod(resolve_cancel_check)
