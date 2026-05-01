"""Low-level HTTP client for TTS Server communication.

This module provides synchronous and async-compatible methods for calling the
TTS Server's HTTP endpoints.  All Studio code that needs to talk to the TTS
Server should go through this client, not construct raw HTTP requests.

The client uses ``httpx`` (already in requirements.txt) for transport.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Default connect and read timeouts used for regular requests.
_CONNECT_TIMEOUT = 5.0   # seconds
_READ_TIMEOUT    = 60.0  # seconds — synthesis can be slow

# Tighter timeout for heartbeat checks.
_HEARTBEAT_TIMEOUT = 3.0


class TtsServerError(RuntimeError):
    """Base error for TTS Server HTTP client failures."""


class TtsServerConnectionError(TtsServerError):
    """The TTS Server is unreachable or refused the connection."""


class TtsServerResponseError(TtsServerError):
    """The TTS Server returned an unexpected HTTP status code."""


class TtsClient:
    """Synchronous HTTP client for the TTS Server.

    Args:
        base_url: E.g. ``"http://127.0.0.1:7862"`` — no trailing slash.
    """

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    def health(self) -> dict[str, Any]:
        """GET /health — overall server health.

        Returns:
            dict[str, Any]: Health payload from the TTS Server.

        Raises:
            TtsServerConnectionError: If the server is unreachable.
            TtsServerResponseError: If the server returns a non-2xx/207 status.
        """
        return self._get("/health", timeout=_HEARTBEAT_TIMEOUT)

    def ping(self) -> bool:
        """Return True if the TTS Server responds to /health within timeout.

        Does not raise — intended for watchdog heartbeat checks.
        """
        try:
            resp = httpx.get(
                f"{self.base_url}/health",
                timeout=_HEARTBEAT_TIMEOUT,
            )
            return resp.status_code in (200, 207)
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Engine registry
    # ------------------------------------------------------------------

    def get_engines(self) -> list[dict[str, Any]]:
        """GET /engines — list all loaded engine plugins.

        Returns:
            list[dict[str, Any]]: Engine detail payloads.
        """
        result = self._get("/engines")
        if isinstance(result, list):
            return result
        return []

    def get_engine(self, engine_id: str) -> dict[str, Any]:
        """GET /engines/{engine_id} — single engine detail."""
        return self._get(f"/engines/{_safe_id(engine_id)}")

    # ------------------------------------------------------------------
    # Settings
    # ------------------------------------------------------------------

    def get_settings(self, engine_id: str) -> dict[str, Any]:
        """GET /engines/{engine_id}/settings."""
        return self._get(f"/engines/{_safe_id(engine_id)}/settings")

    def update_settings(
        self, engine_id: str, settings: dict[str, Any]
    ) -> dict[str, Any]:
        """PUT /engines/{engine_id}/settings."""
        return self._put(
            f"/engines/{_safe_id(engine_id)}/settings",
            payload={"settings": settings},
        )

    # ------------------------------------------------------------------
    # Synthesis
    # ------------------------------------------------------------------

    def synthesize(
        self,
        *,
        engine_id: str,
        text: str,
        output_path: str,
        voice_ref: str | None = None,
        settings: dict[str, Any] | None = None,
        language: str = "en",
        script: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """POST /synthesize — run TTS synthesis.

        Args:
            engine_id: Target engine identifier.
            text: Text to synthesize.
            output_path: Absolute path where the engine should write the audio.
            voice_ref: Optional path to a reference audio file.
            settings: Optional per-request settings overrides.
            language: BCP-47 language code.
            script: Optional list of segments for script-based synthesis.

        Returns:
            dict[str, Any]: Synthesis result payload.
        """
        return self._post(
            "/synthesize",
            payload={
                "engine_id": engine_id,
                "text": text,
                "output_path": output_path,
                "voice_ref": voice_ref,
                "settings": settings or {},
                "language": language,
                "script": script,
            },
            timeout=_READ_TIMEOUT,
        )

    def plan_synthesis(
        self,
        *,
        engine_id: str,
        text: str,
        output_path: str,
        voice_ref: str | None = None,
        settings: dict[str, Any] | None = None,
        language: str = "en",
        script: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """POST /engines/{engine_id}/plan — query preferred synthesis plan.

        Returns:
            dict[str, Any]: SynthesisPlan payload from the engine.
        """
        return self._post(
            f"/engines/{_safe_id(engine_id)}/plan",
            payload={
                "engine_id": engine_id,
                "text": text,
                "output_path": output_path,
                "voice_ref": voice_ref,
                "settings": settings or {},
                "language": language,
                "script": script,
            },
        )

    def preview(
        self,
        *,
        engine_id: str,
        text: str,
        output_path: str,
        voice_ref: str | None = None,
        settings: dict[str, Any] | None = None,
        language: str = "en",
    ) -> dict[str, Any]:
        """POST /preview — run lightweight preview synthesis."""
        return self._post(
            "/preview",
            payload={
                "engine_id": engine_id,
                "text": text,
                "output_path": output_path,
                "voice_ref": voice_ref,
                "settings": settings or {},
                "language": language,
            },
            timeout=_READ_TIMEOUT,
        )

    # ------------------------------------------------------------------
    # Plugin management
    # ------------------------------------------------------------------

    def refresh_plugins(self) -> dict[str, Any]:
        """POST /plugins/refresh — re-scan the plugins directory."""
        return self._post("/plugins/refresh", payload={})

    def verify_engine(self, engine_id: str) -> dict[str, Any]:
        """POST /engines/{engine_id}/verify — re-run verification synthesis."""
        return self._post(
            f"/engines/{_safe_id(engine_id)}/verify",
            payload={},
        )

    def install_dependencies(self, engine_id: str) -> dict[str, Any]:
        """POST /engines/{engine_id}/install — trigger dependency installation."""
        return self._post(
            f"/engines/{_safe_id(engine_id)}/install",
            payload={},
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get(self, path: str, *, timeout: float = _CONNECT_TIMEOUT) -> Any:
        url = f"{self.base_url}{path}"
        try:
            resp = httpx.get(url, timeout=timeout)
        except httpx.ConnectError as exc:
            raise TtsServerConnectionError(
                f"Could not connect to TTS Server at {url}: {exc}"
            ) from exc
        except httpx.TimeoutException as exc:
            raise TtsServerConnectionError(
                f"TTS Server request timed out: {url}: {exc}"
            ) from exc
        _raise_for_status(resp, url)
        return resp.json()

    def _post(
        self, path: str, *, payload: dict[str, Any], timeout: float = _READ_TIMEOUT
    ) -> Any:
        url = f"{self.base_url}{path}"
        try:
            resp = httpx.post(url, json=payload, timeout=timeout)
        except httpx.ConnectError as exc:
            raise TtsServerConnectionError(
                f"Could not connect to TTS Server at {url}: {exc}"
            ) from exc
        except httpx.TimeoutException as exc:
            raise TtsServerConnectionError(
                f"TTS Server request timed out: {url}: {exc}"
            ) from exc
        _raise_for_status(resp, url)
        return resp.json()

    def _put(
        self, path: str, *, payload: dict[str, Any], timeout: float = _CONNECT_TIMEOUT
    ) -> Any:
        url = f"{self.base_url}{path}"
        try:
            resp = httpx.put(url, json=payload, timeout=timeout)
        except httpx.ConnectError as exc:
            raise TtsServerConnectionError(
                f"Could not connect to TTS Server at {url}: {exc}"
            ) from exc
        except httpx.TimeoutException as exc:
            raise TtsServerConnectionError(
                f"TTS Server request timed out: {url}: {exc}"
            ) from exc
        _raise_for_status(resp, url)
        return resp.json()


def _raise_for_status(resp: httpx.Response, url: str) -> None:
    """Raise TtsServerResponseError for non-success status codes."""
    if resp.status_code not in (200, 201, 207):
        raise TtsServerResponseError(
            f"TTS Server returned {resp.status_code} for {url}: {resp.text[:200]}"
        )


def _safe_id(engine_id: str) -> str:
    """Sanitize an engine_id before embedding in a URL path."""
    safe = "".join(c for c in engine_id if c.isalnum() or c in "-_")
    if not safe:
        raise ValueError(f"engine_id {engine_id!r} is not safe for URL embedding")
    return safe
