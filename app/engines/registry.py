"""Engine registry for Studio 2.0."""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

from app.engines.models import (
    EngineHealthModel,
    EngineManifestModel,
    EngineRegistrationModel,
)
from app.engines.voice.base import BaseVoiceEngine
from app.engines.voice.voxtral.engine import VoxtralVoiceEngine
from app.engines.voice.xtts.engine import XttsVoiceEngine

# TTS Server dependencies — imported at module level so they are patchable
# in tests.  Both modules may be absent in minimal environments; the
# try/except keeps the in-process path working unconditionally.
try:
    from app.engines.tts_client import TtsClient
    from app.engines.watchdog import get_watchdog
except ImportError:  # pragma: no cover
    TtsClient = None  # type: ignore[assignment,misc]

    def get_watchdog():  # type: ignore[misc]
        """Fallback watchdog accessor for minimal environments."""
        return None

logger = logging.getLogger(__name__)


def load_engine_registry() -> dict[str, EngineRegistrationModel]:
    from app.core.feature_flags import use_tts_server  # noqa: PLC0415
    if use_tts_server():
        return _load_tts_server_registry()

    # Fallback to legacy local discovery (Tests/Dev ONLY)
    return _refresh_registry_health(_load_legacy_local_registry())


@lru_cache(maxsize=1)
def _load_legacy_local_registry() -> dict[str, EngineRegistrationModel]:
    """Load discovery metadata plus adapter instances (Legacy in-process path).

    This path is deprecated in Phase 11 and remains only for test isolation
    and minimal development environments.
    """
    registry = _load_builtin_engines()
    registry.update(_load_plugin_engines())
    return registry


def _refresh_registry_health(
    registry: dict[str, EngineRegistrationModel]
) -> dict[str, EngineRegistrationModel]:
    """Clone cached registrations with current engine health."""
    from app.state import get_settings  # noqa: PLC0415
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
        phase="5",
        module_path=f"tts_server.plugin.{engine_id}",
        capabilities=capabilities,
        built_in=False,
        verified=bool(data.get("verified", False)),
        version=str(data.get("version", "0.0.0")),
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


# ---------------------------------------------------------------------------
# In-process registry path (unchanged)
# ---------------------------------------------------------------------------

def _load_builtin_engines() -> dict[str, EngineRegistrationModel]:
    """Discover built-in engine adapters shipped with the app."""
    registry: dict[str, EngineRegistrationModel] = {}
    for manifest_path, engine_cls in _builtin_engine_specs():
        manifest = _load_engine_manifest(manifest_path=manifest_path)
        engine = engine_cls(manifest=manifest)
        health = engine.describe_health()
        registry[manifest.engine_id] = EngineRegistrationModel(
            manifest=manifest,
            engine=engine,
            health=health,
        )
    return registry


def _load_plugin_engines() -> dict[str, EngineRegistrationModel]:
    """Discover optional plugin-provided engine adapters.

    .. note::

       **Current state (Phase 5)**: Returns an empty dict.  Plugin engines
       are loaded by the TTS Server subprocess, not the in-process registry.
       The ``_load_tts_server_registry()`` path covers the TTS Server case.
    """
    return {}


def _load_engine_manifest(*, manifest_path: Path) -> EngineManifestModel:
    """Load and parse a built-in engine manifest."""
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    engine_id = str(payload.get("engine_id") or "").strip()
    display_name = str(payload.get("display_name") or engine_id).strip() or engine_id
    phase = str(payload.get("phase") or "unknown").strip()
    if not engine_id:
        raise ValueError(f"Engine manifest is missing engine_id: {manifest_path}")
    return EngineManifestModel(
        engine_id=engine_id,
        display_name=display_name,
        phase=phase,
        module_path=_manifest_module_path(manifest_path),
        notes=tuple(str(note).strip() for note in payload.get("notes", []) if str(note).strip()),
        capabilities=tuple(
            str(capability).strip()
            for capability in payload.get("capabilities", [])
            if str(capability).strip()
        ),
        built_in=True,
        verified=True,
    )


def _builtin_engine_specs() -> list[tuple[Path, type[BaseVoiceEngine]]]:
    """Return the built-in engine manifests and adapter classes."""
    base_dir = Path(__file__).resolve().parent / "voice"
    return [
        (base_dir / "xtts" / "manifest.json", XttsVoiceEngine),
        (base_dir / "voxtral" / "manifest.json", VoxtralVoiceEngine),
    ]


def _manifest_module_path(manifest_path: Path) -> str:
    """Infer the module path for a manifest discovered on disk."""
    engine_dir = manifest_path.parent
    return f"app.engines.voice.{engine_dir.name}.engine"


load_engine_registry.cache_clear = _load_legacy_local_registry.cache_clear
