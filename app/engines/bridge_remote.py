"""TTS Server (remote) voice bridge handler."""

from __future__ import annotations
import logging
from typing import Any, Callable

from app.engines.errors import EngineUnavailableError
from app.engines.bridge_utils import (
    extract_engine_id,
    extract_synthesis_settings,
    infer_audio_format,
)

logger = logging.getLogger(__name__)


class RemoteBridgeHandler:
    """Handles voice requests via TTS Server HTTP client."""

    def __init__(self, tts_client_factory: Callable[[], Any] | None = None):
        self._tts_client_factory = tts_client_factory

    def synthesize(self, request: dict[str, Any]) -> dict[str, Any]:
        """Route synthesis to TTS Server."""
        from app.engines.tts_client import TtsServerError
        engine_id = extract_engine_id(request)
        client = self._get_tts_client()

        try:
            result = client.synthesize(
                engine_id=engine_id,
                text=str(request.get("script_text", "")),
                output_path=str(request.get("output_path", "")),
                voice_ref=request.get("reference_audio_path") or None,
                settings=extract_synthesis_settings(request),
                language=str(request.get("language", "en")),
                script=request.get("script"),
            )
        except TtsServerError as exc:
            raise EngineUnavailableError(f"TTS Server synthesis failed: {exc}") from exc

        return {
            "status": "ok",
            "bridge": "tts-server-bridge",
            "engine_id": engine_id,
            "ephemeral": False,
            "audio_path": result.get("output_path"),
            "audio_format": infer_audio_format(str(request.get("output_path", ""))),
            "request_fingerprint": request.get("request_fingerprint"),
            "synthesis_request": {
                "engine_id": engine_id,
                "script_text": request.get("script_text"),
                "output_path": request.get("output_path"),
            },
            "tts_server_result": result,
        }

    def preview(self, request: dict[str, Any]) -> dict[str, Any]:
        """Route preview to TTS Server."""
        from app.engines.tts_client import TtsServerError
        engine_id = extract_engine_id(request)
        client = self._get_tts_client()

        try:
            result = client.preview(
                engine_id=engine_id,
                text=str(request.get("script_text", "")),
                output_path=str(request.get("output_path", "")),
                voice_ref=request.get("reference_audio_path") or None,
                settings=extract_synthesis_settings(request),
                language=str(request.get("language", "en")),
            )
        except TtsServerError as exc:
            raise EngineUnavailableError(f"TTS Server preview failed: {exc}") from exc

        return {
            "status": "ok",
            "bridge": "tts-server-preview-bridge",
            "engine_id": engine_id,
            "ephemeral": True,
            "audio_path": result.get("output_path"),
            "audio_format": "wav",
            "tts_server_result": result,
        }

    def get_synthesis_plan(self, request: dict[str, Any]) -> Any:
        """Fetch synthesis plan from TTS Server."""
        try:
            client = self._get_tts_client()
            engine_id = extract_engine_id(request)
            payload = client.plan_synthesis(
                engine_id=engine_id,
                text=str(request.get("script_text", "")),
                output_path=str(request.get("output_path", "")),
                voice_ref=request.get("reference_audio_path") or None,
                settings=extract_synthesis_settings(request),
                language=str(request.get("language", "en")),
                script=request.get("script"),
            )
            from app.engines.voice.sdk import SynthesisPlan
            return SynthesisPlan(**payload)
        except Exception as exc:
            logger.warning("Failed to fetch synthesis plan from TTS Server: %s", exc)
            from app.engines.voice.sdk import SynthesisPlan
            return SynthesisPlan()

    def describe_registry(self) -> list[dict[str, Any]]:
        """Fetch engine list from TTS Server."""
        from app.engines.tts_client import TtsServerError

        try:
            client = self._get_tts_client()
            return client.get_engines()
        except EngineUnavailableError as exc:
            # Re-raise so the API layer can decide how to handle it (e.g. 503)
            raise exc
        except TtsServerError as exc:
            raise EngineUnavailableError(f"Could not retrieve engine list from TTS Server: {exc}") from exc

    def update_settings(self, engine_id: str, settings: dict[str, Any]) -> dict[str, Any]:
        """Update settings via TTS Server."""
        return self._get_tts_client().update_settings(engine_id, settings)

    def refresh_plugins(self) -> dict[str, Any]:
        """Refresh plugins via TTS Server."""
        return self._get_tts_client().refresh_plugins()

    def verify_engine(self, engine_id: str) -> dict[str, Any]:
        """Verify engine via TTS Server."""
        return self._get_tts_client().verify_engine(engine_id)

    def install_dependencies(self, engine_id: str) -> dict[str, Any]:
        """Install dependencies via TTS Server."""
        return self._get_tts_client().install_dependencies(engine_id)

    def _get_tts_client(self) -> Any:
        """Connect to global watchdog client."""
        if self._tts_client_factory is not None:
            return self._tts_client_factory()
        from app.engines.watchdog import _global_watchdog
        if _global_watchdog is None:
            raise EngineUnavailableError("TTS Server is starting up... please wait a few seconds and try again.")

        if not _global_watchdog.is_healthy():
            if _global_watchdog.is_circuit_open():
                raise EngineUnavailableError("TTS Server circuit breaker is OPEN. Synthesis unavailable.")
            raise EngineUnavailableError("TTS Server is currently unhealthy or restarting.")

        return _global_watchdog.get_client()
