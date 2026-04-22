"""TTS Server FastAPI application.

This module is the HTTP boundary for the TTS Server subprocess.  It is the
only place that should import FastAPI, uvicorn, or HTTP-related machinery.

Callers from Studio should go through the VoiceBridge HTTP client
(``app.engines.bridge``) not import this module directly.
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.tts_server.health import (
    build_engine_detail,
    build_health_response,
    engine_status,
)
from app.tts_server.plugin_loader import LoadedPlugin, discover_plugins
from app.tts_server.settings_store import load_settings, merge_settings, save_settings
from app.tts_server.verification import verify_all, verify_plugin

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Application state
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Studio TTS Server",
    description="Local speech synthesis API for Audiobook Studio.",
    version="2.0.0",
)

# Shared mutable state protected by a lock.
_state_lock = threading.Lock()
_plugins: list[LoadedPlugin] = []
_plugins_dir: Path = Path("plugins")


def _plugin_by_id(engine_id: str) -> LoadedPlugin:
    """Return a loaded plugin by engine_id or raise 404."""
    with _state_lock:
        for p in _plugins:
            if p.engine_id == engine_id:
                return p
    raise HTTPException(status_code=404, detail=f"Engine not found: {engine_id}")


# ---------------------------------------------------------------------------
# Startup / lifecycle helpers (called from tts_server.py entry point)
# ---------------------------------------------------------------------------

def load_plugins(plugins_dir: Path) -> None:
    """Discover, load, and verify all plugins.

    Called by the entry point after the server configuration is applied.
    Thread-safe — writes to the shared plugin list under the lock.

    Args:
        plugins_dir: Absolute path to the ``plugins/`` directory.
    """
    global _plugins, _plugins_dir
    discovered = discover_plugins(plugins_dir)
    verify_all(discovered)
    with _state_lock:
        _plugins = discovered
        _plugins_dir = plugins_dir
    logger.info("Loaded %d plugin(s) from %s", len(discovered), plugins_dir)


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class SynthesizeRequest(BaseModel):
    engine_id: str
    text: str
    output_path: str
    voice_ref: str | None = None
    settings: dict[str, Any] = {}
    language: str = "en"


class PreviewRequest(BaseModel):
    engine_id: str
    text: str
    output_path: str
    voice_ref: str | None = None
    settings: dict[str, Any] = {}
    language: str = "en"


class SettingsUpdateRequest(BaseModel):
    settings: dict[str, Any]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> JSONResponse:
    """Overall server health and per-engine status."""
    with _state_lock:
        plugins_snapshot = list(_plugins)
    payload = build_health_response(plugins_snapshot)
    status_code = 200 if payload["status"] == "ok" else 207
    return JSONResponse(content=payload, status_code=status_code)


@app.get("/engines")
def list_engines() -> list[dict[str, Any]]:
    """List all loaded engine plugins."""
    with _state_lock:
        plugins_snapshot = list(_plugins)

    result = []
    for plugin in plugins_snapshot:
        settings = load_settings(plugin.plugin_dir)
        result.append(build_engine_detail(plugin, settings))
    return result


@app.get("/engines/{engine_id}")
def get_engine(engine_id: str) -> dict[str, Any]:
    """Get detail for a single engine."""
    plugin = _plugin_by_id(engine_id)
    settings = load_settings(plugin.plugin_dir)
    return build_engine_detail(plugin, settings)


@app.get("/engines/{engine_id}/settings")
def get_engine_settings(engine_id: str) -> dict[str, Any]:
    """Get current persisted settings for an engine."""
    plugin = _plugin_by_id(engine_id)
    return load_settings(plugin.plugin_dir)


@app.put("/engines/{engine_id}/settings")
def update_engine_settings(
    engine_id: str, body: SettingsUpdateRequest
) -> dict[str, Any]:
    """Update and persist settings for an engine.

    Settings are validated against the engine's schema before saving.
    """
    plugin = _plugin_by_id(engine_id)

    try:
        schema = plugin.engine.settings_schema()
    except Exception as exc:
        schema = {}
    if not schema and getattr(plugin, "settings_schema", None):
        schema = plugin.settings_schema
    if not schema:
        raise HTTPException(
            status_code=500,
            detail="Could not retrieve settings schema: engine provides no settings_schema",
        )

    current = load_settings(plugin.plugin_dir)
    merged, errors = merge_settings(current, body.settings, schema)

    if errors:
        raise HTTPException(
            status_code=422,
            detail={"message": "Settings validation failed", "errors": errors},
        )

    try:
        save_settings(plugin.plugin_dir, merged)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not save settings: {exc}")

    return {"ok": True, "settings": merged}


@app.post("/engines/{engine_id}/verify")
def reverify_engine(engine_id: str) -> dict[str, Any]:
    """Re-run verification synthesis for an engine."""
    plugin = _plugin_by_id(engine_id)
    result = verify_plugin(plugin)
    return {
        "engine_id": engine_id,
        "ok": result.ok,
        "duration_sec": result.duration_sec,
        "error": result.error,
    }


@app.post("/synthesize")
def synthesize(body: SynthesizeRequest) -> dict[str, Any]:
    """Synthesize audio for a text request."""
    from app.engines.voice.sdk import TTSRequest  # noqa: PLC0415

    plugin = _plugin_by_id(body.engine_id)

    if not plugin.verified:
        status = engine_status(plugin)
        raise HTTPException(
            status_code=503,
            detail=f"Engine {body.engine_id} is not verified (status: {status})",
        )

    # Load persisted settings and merge with request overrides.
    persisted = load_settings(plugin.plugin_dir)
    merged_settings = {**persisted, **body.settings}

    req = TTSRequest(
        text=body.text,
        output_path=body.output_path,
        voice_ref=body.voice_ref,
        settings=merged_settings,
        language=body.language,
    )

    ok, msg = plugin.engine.check_request(req)
    if not ok:
        raise HTTPException(status_code=422, detail=f"Request validation failed: {msg}")

    result = plugin.engine.synthesize(req)

    if not result.ok:
        raise HTTPException(
            status_code=500,
            detail=f"Synthesis failed: {result.error}",
        )

    return {
        "ok": True,
        "engine_id": body.engine_id,
        "output_path": result.output_path,
        "duration_sec": result.duration_sec,
        "warnings": result.warnings,
    }


@app.post("/preview")
def preview(body: PreviewRequest) -> dict[str, Any]:
    """Run a lightweight preview synthesis."""
    from app.engines.voice.sdk import TTSRequest  # noqa: PLC0415

    plugin = _plugin_by_id(body.engine_id)

    persisted = load_settings(plugin.plugin_dir)
    merged_settings = {**persisted, **body.settings}

    req = TTSRequest(
        text=body.text,
        output_path=body.output_path,
        voice_ref=body.voice_ref,
        settings=merged_settings,
        language=body.language,
    )

    ok, msg = plugin.engine.check_request(req)
    if not ok:
        raise HTTPException(status_code=422, detail=f"Request validation failed: {msg}")

    result = plugin.engine.preview(req)

    if not result.ok:
        raise HTTPException(
            status_code=500,
            detail=f"Preview failed: {result.error}",
        )

    return {
        "ok": True,
        "engine_id": body.engine_id,
        "output_path": result.output_path,
        "duration_sec": result.duration_sec,
        "warnings": result.warnings,
    }


@app.post("/plugins/refresh")
def refresh_plugins() -> dict[str, Any]:
    """Re-scan the plugins directory without restarting the TTS Server.

    Newly added plugins are loaded and verified.  Removed plugins are
    unloaded.  Existing plugins that are already loaded are not reloaded
    unless their folder was removed and re-added.
    """
    with _state_lock:
        current_dir = _plugins_dir

    # Shutdown previously loaded plugins before reload.
    with _state_lock:
        old_plugins = list(_plugins)

    for plugin in old_plugins:
        try:
            plugin.engine.shutdown()
        except Exception:
            logger.debug("shutdown() raised for %s", plugin.folder_name)

    load_plugins(current_dir)

    with _state_lock:
        new_count = len(_plugins)

    return {
        "ok": True,
        "loaded_count": new_count,
    }
