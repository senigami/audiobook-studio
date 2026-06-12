"""Engine registry for Studio 2.0."""

from __future__ import annotations

import json
import logging
import threading
import time
from functools import lru_cache
from pathlib import Path

from app.engines.models import (
    EngineHealthModel,
    EngineManifestModel,
    EngineRegistrationModel,
)
# TTS Server dependencies — imported at module level so they are patchable
# in tests. Both modules may be absent in minimal environments.
try:
    from app.engines.tts_client import TtsClient
    from app.engines.watchdog import get_watchdog
except ImportError:  # pragma: no cover
    TtsClient = None  # type: ignore[assignment,misc]

    def get_watchdog():  # type: ignore[misc]
        """Fallback watchdog accessor for minimal environments."""
        return None

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Remote registry short-TTL cache
# ---------------------------------------------------------------------------
_REMOTE_CACHE_TTL: float = 5.0  # seconds
_remote_cache: tuple[float, dict] | None = None  # (timestamp, registry)
_remote_cache_lock = threading.Lock()


def load_engine_registry() -> dict[str, EngineRegistrationModel]:
    global _remote_cache  # noqa: PLW0603

    # Check cache under lock
    with _remote_cache_lock:
        if _remote_cache is not None:
            ts, cached = _remote_cache
            if time.monotonic() - ts < _REMOTE_CACHE_TTL:
                # An empty cached result means the remote was unavailable;
                # apply the same local-manifest fallback as the fetch path.
                if cached:
                    return cached  # type: ignore[return-value]
                return _load_local_registry()

    # Fetch outside the lock — a duplicate concurrent fetch is acceptable
    remote = _load_tts_server_registry()

    # Store result under lock (even empty dict, so we don't hammer on failure)
    with _remote_cache_lock:
        _remote_cache = (time.monotonic(), remote)

    if remote:
        return remote
    return _load_local_registry()


@lru_cache(maxsize=1)
def _load_local_registry() -> dict[str, EngineRegistrationModel]:
    """Return empty registry — used as graceful fallback when TTS Server is unreachable."""
    return {}


def _refresh_registry_health(
    registry: dict[str, EngineRegistrationModel]
) -> dict[str, EngineRegistrationModel]:
    """Clone cached registrations with current engine health."""
    from app.db.state import get_settings  # noqa: PLC0415
    verified_plugins = get_settings().get("verified_plugins") or {}

    refreshed: dict[str, EngineRegistrationModel] = {}
    for engine_id, registration in registry.items():
        # Apply persistent verified flag if it exists in settings
        if verified_plugins.get(engine_id):
            object.__setattr__(registration.manifest, "verified", True)
        refreshed[engine_id] = EngineRegistrationModel(
            manifest=registration.manifest,
            engine=registration.engine,
            health=registration.engine.describe_health(),
        )
    return refreshed


# ---------------------------------------------------------------------------
# TTS Server registry path
# ---------------------------------------------------------------------------

def _load_tts_server_registry() -> dict[str, EngineRegistrationModel]:
    """Build a registry backed by the running TTS Server's /engines endpoint.

    Each engine reported by the server is wrapped in a lightweight
    ``_TtsServerEngineProxy`` so callers see the same ``EngineRegistrationModel``
    interface regardless of which path is active.

    Returns an empty dict (with a logged warning) if the TTS Server is
    unreachable, rather than raising — the Studio should degrade gracefully.
    """
    if TtsClient is None:
        logger.warning("TTS Server registry: tts_client not available.")
        return {}

    watchdog = get_watchdog()
    if watchdog is None:
        logger.debug("TTS Server registry: watchdog not yet initialized. Discovery deferred.")
        return {}

    if not watchdog.is_healthy():
        # If the circuit is open, we've failed definitively.
        if watchdog.is_circuit_open():
            logger.error("TTS Server registry: circuit breaker is OPEN. Discovery disabled.")
        else:
            logger.debug("TTS Server registry: watchdog is booting or heartbeat failed. Discovery deferred.")
        return {}

    server_url = watchdog.get_url()
    client = TtsClient(server_url)

    try:
        engines_payload = client.get_engines()
        health_payload = client.health()
    except Exception as exc:
        import httpx
        from app.engines.tts_client import TtsServerConnectionError

        # Silence connection errors during startup/deferral
        is_conn_error = isinstance(exc, (TtsServerConnectionError, httpx.ConnectError))
        if not is_conn_error and "connection refused" in str(exc).lower():
            is_conn_error = True

        if is_conn_error:
            logger.debug(
                "TTS Server registry: server unreachable at %s (discovery deferred): %s",
                server_url,
                exc,
            )
        else:
            logger.warning(
                "TTS Server registry: failed to fetch engines from %s: %s",
                server_url,
                exc,
            )
        return {}

    # Build a health lookup by engine_id for O(1) access.
    engine_health_by_id: dict[str, dict] = {}
    for entry in health_payload.get("engines", []):
        eid = entry.get("engine_id")
        if eid:
            engine_health_by_id[eid] = entry

    registry: dict[str, EngineRegistrationModel] = {}

    for engine_data in engines_payload:
        engine_id = str(engine_data.get("engine_id") or "").strip()
        if not engine_id:
            continue

        manifest = _manifest_from_tts_server_payload(engine_data)
        engine_health_data = engine_health_by_id.get(engine_id, {})
        health = _health_from_tts_server_payload(engine_id, engine_health_data)
        proxy = _TtsServerEngineProxy(engine_id=engine_id, server_url=server_url)

        registry[engine_id] = EngineRegistrationModel(
            manifest=manifest,
            engine=proxy,  # type: ignore[arg-type]
            health=health,
        )
        logger.debug("TTS Server registry: loaded engine %s from server.", engine_id)

    logger.info(
        "TTS Server registry: loaded %d engine(s) from %s.",
        len(registry),
        server_url,
    )
    return registry


def _manifest_from_tts_server_payload(data: dict) -> EngineManifestModel:
    """Build an EngineManifestModel from a /engines entry."""
    engine_id = str(data.get("engine_id") or "").strip()
    display_name = str(data.get("display_name") or engine_id).strip() or engine_id
    capabilities = tuple(
        str(c).strip()
        for c in data.get("capabilities", [])
        if str(c).strip()
    )
    return EngineManifestModel(
        engine_id=engine_id,
        display_name=display_name,
        phase="11",
        module_path=f"tts_server.plugin.{engine_id}",
        capabilities=capabilities,
        built_in=False,
        verified=bool(data.get("verified", False)),
        version=str(data.get("version", "0.0.0")),
        local=bool(data.get("local", True)),
        cloud=bool(data.get("cloud", False)),
        network=bool(data.get("network", False)),
        test_text=str(data.get("test_text", "This is a verification test.")),
        test_sample=data.get("test_sample"),
        behavior=dict(data.get("behavior") or {}),
        dev=dict(data.get("dev") or {}),
        logo=dict(data.get("logo") or {}),
    )


def _health_from_tts_server_payload(
    engine_id: str, data: dict
) -> EngineHealthModel:
    """Build an EngineHealthModel from a /health engines entry."""
    from datetime import datetime, timezone  # noqa: PLC0415

    status = str(data.get("status", "unknown"))
    available = status in {"ready", "unverified"}
    ready = status == "ready"
    return EngineHealthModel(
        engine_id=engine_id,
        available=available,
        ready=ready,
        status=status,
        message=data.get("verification_error") or None,
        checked_at=datetime.now(timezone.utc),
    )


class _TtsServerEngineProxy:
    """Minimal engine proxy that wraps the TTS Server HTTP path.

    Satisfies the shape expected by ``EngineRegistrationModel.engine`` so
    route handlers can call ``describe_health()`` without knowing whether
    they are talking to an in-process adapter or the TTS Server.

    Synthesis and preview are NOT routed through this proxy — those go
    through ``VoiceBridge``, which handles the TTS Server path centrally.
    The proxy exists purely for registry introspection (``/api/engines``).
    """

    def __init__(self, *, engine_id: str, server_url: str) -> None:
        self.engine_id = engine_id
        self._server_url = server_url

    def describe_health(self) -> EngineHealthModel:
        """Fetch fresh health from the TTS Server."""
        try:
            client = TtsClient(self._server_url)
            health_data = client.health()
            for entry in health_data.get("engines", []):
                if entry.get("engine_id") == self.engine_id:
                    return _health_from_tts_server_payload(self.engine_id, entry)
        except Exception as exc:
            logger.debug(
                "TTS Server health probe for %s failed: %s", self.engine_id, exc
            )

        # Fallback — report unavailable without raising.
        from datetime import datetime, timezone  # noqa: PLC0415

        return EngineHealthModel(
            engine_id=self.engine_id,
            available=False,
            ready=False,
            status="unavailable",
            message="TTS Server health check failed.",
            checked_at=datetime.now(timezone.utc),
        )

    # Synthesis intentionally NOT implemented here — VoiceBridge owns that.
    def synthesize(self, request: dict) -> dict:
        raise NotImplementedError(
            "Synthesis must route through VoiceBridge, not the engine proxy."
        )

    def preview(self, request: dict) -> dict:
        raise NotImplementedError(
            "Preview must route through VoiceBridge, not the engine proxy."
        )


def _manifest_module_path(manifest_path: Path) -> str:
    """Infer the module path for a manifest discovered on disk."""
    engine_dir = manifest_path.parent
    return f"plugins.{engine_dir.name}.app_adapter"


def _cache_clear() -> None:
    """Invalidate both the remote TTL cache and the local LRU cache."""
    global _remote_cache  # noqa: PLW0603
    with _remote_cache_lock:
        _remote_cache = None
    _load_local_registry.cache_clear()


load_engine_registry.cache_clear = _cache_clear
