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

from collections.abc import Callable
from pathlib import Path
from typing import Any

from studio_plugin_sdk.engine import StudioTTSEngine
from app.engines.errors import EngineRequestError
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
    # These were duplicated verbatim (module differences only in the
    # error-message engine name) across XttsVoiceEngine and
    # VoxtralVoiceEngine in each plugin's studio/app_adapter.py. Lifted here
    # so future engine adapters get them for free; engine-specific behavior
    # is parameterized (engine_name), never branched on engine ID.

    @classmethod
    def normalize_output_format(
        cls,
        request: dict[str, object],
        *,
        engine_name: str,
        allow_mp3: bool = False,
    ) -> str:
        """Validate and normalize the requested output audio format.

        Args:
            request: Engine-ready request payload.
            engine_name: Human-readable engine name for error messages
                (e.g. "XTTS", "Voxtral").
            allow_mp3: Whether mp3 output is permitted for this call (typically
                True for synthesis, False for lightweight preview).
        """
        output_format = str(request.get("output_format") or "wav").strip().lower() or "wav"
        allowed_formats = {"wav", "mp3"} if allow_mp3 else {"wav"}
        if output_format not in allowed_formats:
            if allow_mp3:
                raise EngineRequestError(
                    f"{engine_name} bridge synthesis currently supports output_format='wav' or 'mp3' only."
                )
            raise EngineRequestError(
                f"{engine_name} bridge preview currently supports output_format='wav' only."
            )
        return output_format

    @staticmethod
    def resolve_output_path(request: dict[str, object], *, engine_name: str) -> Path:
        """Resolve and prepare the output path for a synthesis request."""
        output_path = str(request.get("output_path") or "").strip()
        if not output_path:
            raise EngineRequestError(f"{engine_name} synthesis requests must include output_path.")
        resolved = Path(output_path)
        resolved.parent.mkdir(parents=True, exist_ok=True)
        return resolved

    @staticmethod
    def resolve_on_output(request: dict[str, object], *, engine_name: str) -> Callable[[str], None]:
        """Resolve the request's on_output callback, defaulting to a no-op."""
        on_output = request.get("on_output")
        if on_output is None:
            return lambda _line: None
        if not callable(on_output):
            raise EngineRequestError(f"{engine_name} on_output callback must be callable.")
        return on_output

    @staticmethod
    def resolve_cancel_check(request: dict[str, object], *, engine_name: str) -> Callable[[], bool]:
        """Resolve the request's cancel_check callback, defaulting to never-cancel."""
        cancel_check = request.get("cancel_check")
        if cancel_check is None:
            return lambda: False
        if not callable(cancel_check):
            raise EngineRequestError(f"{engine_name} cancel_check callback must be callable.")
        return cancel_check

