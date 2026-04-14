"""Base voice engine contracts.

This module contains two contracts that coexist during the Phase 5 migration
window:

- ``BaseVoiceEngine`` — the original internal contract used by the legacy
  in-process engine adapters (XTTS, Voxtral).  Preserved for backward
  compatibility until Phase 8 cleanup.

- ``StudioTTSEngine`` — the new public SDK contract that all plugin engines
  must implement.  Plugins run inside the TTS Server subprocess and are
  discovered via the ``plugins/tts_*/`` folder scanning mechanism.

New engines should implement ``StudioTTSEngine``.  Existing adapters continue
to use ``BaseVoiceEngine`` until they are migrated in Stream 3.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.engines.models import EngineHealthModel
from app.engines.voice.sdk import TTSRequest, TTSResult


class BaseVoiceEngine:
    """Placeholder base voice engine contract.

    Preserved for backward compatibility with the legacy in-process engine
    adapters (XTTS, Voxtral) during the Phase 5 migration.  New engines
    should implement ``StudioTTSEngine`` instead.
    """

    def describe_health(self) -> EngineHealthModel:
        """Summarize module readiness for discovery and diagnostics."""

        raise NotImplementedError

    def validate_environment(self) -> None:
        """Check whether the engine can run in the current environment.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError

    def validate_request(self, request: dict[str, object]) -> None:
        """Validate an engine-specific request before synthesis or preview.

        Args:
            request: Engine-ready request payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError

    def synthesize(self, request: dict[str, object]) -> dict[str, object]:
        """Synthesize audio for a canonical voice request.

        Args:
            request: Engine-ready synthesis payload.

        Returns:
            dict[str, object]: Placeholder synthesis result payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError

    def preview(self, request: dict[str, object]) -> dict[str, object]:
        """Run preview or test synthesis for a lightweight voice request.

        Args:
            request: Engine-ready preview payload.

        Returns:
            dict[str, object]: Placeholder preview result payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError

    def build_voice_asset(self, request: dict[str, object]) -> dict[str, object]:
        """Build or refresh engine-specific voice assets for a profile.

        Args:
            request: Engine-ready voice-asset build payload.

        Returns:
            dict[str, object]: Placeholder asset-build result payload.

        Raises:
            NotImplementedError: Phase 1 scaffold only.
        """
        raise NotImplementedError


class StudioTTSEngine(ABC):
    """Public SDK contract that all TTS plugin engines must implement.

    Plugins run inside the TTS Server subprocess and are discovered via the
    ``plugins/tts_*/`` folder scanning mechanism.  They must not import
    anything from ``app.*`` (Studio internals) — only from stdlib, their own
    declared dependencies, and the SDK types in ``app.engines.voice.sdk``.

    The TTS Server calls these methods in order::

        engine = MyEngine()
        ok, msg = engine.check_env()
        if ok:
            result = engine.synthesize(request)
    """

    # ------------------------------------------------------------------
    # Required methods
    # ------------------------------------------------------------------

    @abstractmethod
    def info(self) -> dict[str, Any]:
        """Return runtime metadata for registry display.

        Called once during plugin discovery.  The returned dict is merged with
        manifest data to build the full engine profile served by ``/engines``.

        Returns:
            dict[str, Any]: Any additional runtime metadata not already in the
            manifest (e.g. detected model paths, GPU device info).
        """
        ...

    @abstractmethod
    def check_env(self) -> tuple[bool, str]:
        """Check whether this engine can run in the current environment.

        Called during plugin discovery and re-verification.  Must not load
        model weights or allocate GPU memory — only inspect the environment.

        Returns:
            tuple[bool, str]: ``(True, 'OK')`` when the environment is valid;
            ``(False, reason)`` when setup is required.
        """
        ...

    @abstractmethod
    def check_request(self, req: TTSRequest) -> tuple[bool, str]:
        """Pre-flight validation before synthesis or preview.

        Called before every ``synthesize()`` and ``preview()`` call.  Should
        be fast — no I/O beyond path existence checks.

        Args:
            req: Immutable synthesis request to validate.

        Returns:
            tuple[bool, str]: ``(True, 'OK')`` when the request is valid;
            ``(False, reason)`` when it cannot be processed.
        """
        ...

    @abstractmethod
    def synthesize(self, req: TTSRequest) -> TTSResult:
        """Run TTS synthesis and write audio to ``req.output_path``.

        Must write a valid audio file to ``req.output_path`` on success.  On
        failure, return ``TTSResult(ok=False, error=...)`` — do not raise
        unhandled exceptions for normal failure cases.

        Args:
            req: Immutable synthesis request.

        Returns:
            TTSResult: Result including output path and duration on success, or
            error message on failure.
        """
        ...

    @abstractmethod
    def settings_schema(self) -> dict[str, Any]:
        """Return JSON Schema describing this engine's configurable settings.

        The TTS Server uses this schema to validate settings updates and expose
        them to the Studio Settings UI for form rendering.

        Returns:
            dict[str, Any]: JSON Schema (Draft 7+) object describing the
            engine's ``settings.json`` structure.
        """
        ...

    # ------------------------------------------------------------------
    # Optional overrides
    # ------------------------------------------------------------------

    def preview(self, req: TTSRequest) -> TTSResult:
        """Optional lightweight preview synthesis.

        Override when the engine supports a faster preview mode (e.g. shorter
        context, lower quality).  Defaults to calling ``synthesize()``.

        Args:
            req: Immutable synthesis request.

        Returns:
            TTSResult: Preview result.
        """
        return self.synthesize(req)

    def shutdown(self) -> None:
        """Optional cleanup when the engine is unloaded.

        Called by the TTS Server during graceful shutdown or before plugin
        reload.  Release GPU memory, close file handles, etc.
        """
        pass
