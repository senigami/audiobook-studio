"""Base voice engine contracts.

This module contains the shared voice contracts used by the job layer and the
plugin engines:

- ``BaseVoiceEngine`` - preserved for app-side bridge compatibility;
  engine-specific implementation is now strictly owned by plugin bundles.

- ``StudioTTSEngine`` - the public SDK contract that all plugin engines must
  implement.  Plugins run inside the TTS Server subprocess and are discovered
  via the agnostic root ``plugins/`` bundle scan.

New engines should implement ``StudioTTSEngine``.
"""

from __future__ import annotations

import inspect
import json
from abc import ABC, abstractmethod
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.engines.errors import EngineRequestError
from app.engines.models import EngineHealthModel
from app.engines.voice.sdk import TTSRequest, TTSResult, VerificationResult, VoiceProcessingHooks


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


class StudioTTSEngine(ABC):
    """Public SDK contract that all TTS plugin engines must implement.

    Plugins run inside the TTS Server subprocess and are discovered via the
    ``plugins/tts_*/`` folder scanning mechanism.  They must not import
    anything from ``app.*`` (Studio internals) — only from stdlib, their own
    declared dependencies, and the SDK types in ``app.engines.voice.sdk``.

    The TTS Server calls these methods in order, passing the engine's
    persisted settings to ``check_env`` when its signature accepts a
    ``settings`` keyword::

        engine = MyEngine()
        ok, msg = engine.check_env(settings=persisted_settings)
        if ok:
            result = engine.synthesize(request)
    """

    # ------------------------------------------------------------------
    # Optional hooks
    # ------------------------------------------------------------------

    def hooks(self) -> VoiceProcessingHooks:
        """Return processing hooks for this engine.

        Override to customize request planning, voice selection, or postprocessing.
        """
        return VoiceProcessingHooks()

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

    def verify(self, req: TTSRequest) -> VerificationResult:
        """Perform a fast readiness check without rendering audio.

        By default, engines that do not implement this method are considered
        unverified but potentially usable via the legacy synthesize path.
        """
        return VerificationResult(
            ok=False,
            message="This engine does not implement non-rendering verification.",
        )

    def run_test(
        self,
        *,
        asset_search_order: list[str] | None = None,
        default_text: str | None = None,
        settings: dict[str, Any] | None = None,
    ) -> VerificationResult:
        """Perform a full end-to-end synthesis test using bundled assets.

        Shared implementation (PL-3) of the ~25-line asset-resolution +
        synth-test boilerplate that was duplicated across every plugin's
        ``server/engine.py``. Concrete engines call this via
        ``super().run_test(asset_search_order=[...], default_text="...")``
        from their own ``run_test`` override, which is what
        ``app.tts_server.verification._accepts_settings`` introspects to
        decide whether to pass ``settings=`` — keep that override's own
        signature (with or without ``settings``) as the plugin's public
        contract; this method just does the shared work.

        When ``asset_search_order`` is omitted (the base default, used by
        engines that have not opted into the shared test flow), preserves
        the original "not implemented" behavior.

        Args:
            asset_search_order: Candidate filenames (relative to the
                plugin's ``assets/`` folder) to search for a reference
                voice asset, in priority order. The first existing file wins.
            default_text: Fallback verification text used when the plugin's
                ``manifest.json`` does not define ``test_text``.
            settings: Optional engine settings, forwarded to ``check_env``
                when the concrete engine's ``check_env`` accepts a
                ``settings`` keyword.
        """
        if not asset_search_order:
            return VerificationResult(
                ok=False,
                message="This engine does not implement a self-contained synthesis test.",
            )

        settings = settings or {}
        check_env = self.check_env
        try:
            check_env_params = inspect.signature(check_env).parameters
            accepts_settings = any(
                param.kind == inspect.Parameter.VAR_KEYWORD or name == "settings"
                for name, param in check_env_params.items()
            )
        except (TypeError, ValueError):
            accepts_settings = False
        ok, msg = check_env(settings=settings) if accepts_settings else check_env()
        if not ok:
            return VerificationResult(ok=False, message=msg)

        plugin_dir = Path(inspect.getfile(type(self))).parents[2]
        assets_dir = plugin_dir / "assets"
        assets_dir.mkdir(exist_ok=True)

        voice_ref = None
        for name in asset_search_order:
            candidate = assets_dir / name
            if candidate.is_file():
                voice_ref = str(candidate)
                break

        if not voice_ref:
            return VerificationResult(ok=False, message="No test assets found in assets/ folder.")

        output_path = assets_dir / "test_output.wav"

        manifest_path = plugin_dir / "manifest.json"
        test_text = default_text or "This is an internal verification test."
        try:
            if manifest_path.exists():
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                test_text = manifest.get("test_text") or test_text
        except Exception:
            pass

        req = TTSRequest(
            text=test_text,
            output_path=str(output_path),
            voice_ref=voice_ref,
            settings=settings,
        )

        result = self.synthesize(req)
        if result.ok:
            return VerificationResult(ok=True, message=f"Test passed. Output: {output_path.name}")
        return VerificationResult(ok=False, message=f"Test failed: {result.error}")

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

    def check_output(self, req: TTSRequest, result: TTSResult) -> tuple[bool, str]:
        """Validate rendered artifact quality after synthesis.

        Called by the TTS Server immediately after synthesize() returns ok=True.
        The engine may inspect the written file (e.g. check duration, silence
        ratio, or expected speaker fingerprint).

        Args:
            req:    The original TTSRequest that produced this result.
            result: The TTSResult returned by synthesize().

        Returns:
            tuple[bool, str]: (True, 'OK') when the artifact passes QA;
            (False, reason) when it must be discarded.
        """
        return True, "OK"  # default: accept all

    def shutdown(self) -> None:
        """Optional cleanup when the engine is unloaded.

        Called by the TTS Server during graceful shutdown or before plugin
        reload.  Release GPU memory, close file handles, etc.
        """
        pass
