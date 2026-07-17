"""Studio TTS SDK engine contract.

``StudioTTSEngine`` is the public SDK contract that all TTS plugin engines
must implement.  Plugins run inside the TTS Server subprocess and are
discovered via the agnostic root ``tts_engines/`` bundle scan.
"""

from __future__ import annotations

import inspect
import json
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from .types import TTSRequest, TTSResult, VerificationResult, VoiceProcessingHooks


class StudioTTSEngine(ABC):
    """Public SDK contract that all TTS plugin engines must implement.

    Plugins run inside the TTS Server subprocess and are discovered via the
    ``tts_engines/tts_*/`` folder scanning mechanism.  They must not import
    anything from ``app.*`` (Studio internals) — only from stdlib, their own
    declared dependencies, and the SDK types in ``studio_plugin_sdk.types``.

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
