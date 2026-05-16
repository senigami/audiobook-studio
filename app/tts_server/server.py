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
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.config import PLUGINS_DIR
from app.tts_server.performance_settings import (
    COMPUTER_SPEED_MULTIPLIER_KEY,
    clear_engine_computer_speed_baseline,
)
from app.tts_server.health import (
    build_engine_detail,
    build_health_response,
    engine_status,
)
from app.engines.enablement import can_enable_engine
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
_plugins_dir: Path = PLUGINS_DIR
_cancelled_tasks: set[str] = set()
_ready_port: int | None = None


def set_ready_port(port: int) -> None:
    """Configure the port announced by the startup readiness hook."""
    global _ready_port
    _ready_port = port


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
    Verification runs in a background thread to avoid blocking startup.

    Args:
        plugins_dir: Absolute path to the ``plugins/`` directory.
    """
    global _plugins, _plugins_dir
    discovered = discover_plugins(plugins_dir)

    # Update state immediately so discovery results are visible to Studio.
    with _state_lock:
        _plugins = discovered
        _plugins_dir = plugins_dir

    def _bg_verify():
        try:
            verify_all(discovered)
        except Exception:
            logger.exception("Unexpected error during background plugin verification")

    threading.Thread(target=_bg_verify, name="TtsPluginVerification", daemon=True).start()
    logger.info("Discovered %d plugin(s) from %s. Verification started in background.", len(discovered), plugins_dir)


@app.on_event("startup")
def _announce_ready() -> None:
    """Announce readiness only after the ASGI app has fully started."""
    if _ready_port is not None:
        print(f"READY:{_ready_port}", flush=True)


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
    script: Optional[list[dict[str, Any]]] = None
    task_id: Optional[str] = None


class PreviewRequest(BaseModel):
    engine_id: str
    text: str
    output_path: str
    voice_ref: str | None = None
    settings: dict[str, Any] = {}
    language: str = "en"
    task_id: Optional[str] = None


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


@app.get("/ready")
def ready() -> JSONResponse:
    """Cheap readiness probe used by the Studio watchdog."""
    return JSONResponse(content={"status": "ready"}, status_code=200)


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

    # Filter out 'enabled' which is handled at the registry level, not engine settings level
    settings_to_merge = {k: v for k, v in body.settings.items() if k != "enabled"}
    merged, errors = merge_settings(current, settings_to_merge, schema)

    # Re-inject 'enabled' so can_enable_engine sees it
    if "enabled" in body.settings:
        merged["enabled"] = body.settings["enabled"]

    if errors:
        raise HTTPException(
            status_code=422,
            detail={"message": "Settings validation failed", "errors": errors},
        )

    enabled_val = merged.get("enabled")
    if bool(enabled_val):
        can_enable, reason = can_enable_engine(
            plugin.engine_id,
            current_settings=merged,
            built_in=bool(getattr(plugin.manifest, "built_in", False)),
            verified=bool(getattr(plugin, "verified", False)),
            status=engine_status(plugin, current_settings=merged),
            behavior=plugin.manifest.get("behavior"),
        )
        if not can_enable:
            raise HTTPException(status_code=400, detail=reason or "Engine cannot be enabled yet.")

    try:
        # Check if settings changed (excluding enabled state)
        sensitive_changed = False
        for k, v in merged.items():
            if k == "enabled":
                continue
            if current.get(k) != v:
                sensitive_changed = True
                break

        save_settings(plugin.plugin_dir, merged)

        if sensitive_changed:
            logger.info("Settings changed for %s, clearing verification state", engine_id)
            plugin.verified = False
            plugin.verification_error = "Settings changed. Please re-verify."

            # Update state.json
            from app.tts_server.settings_store import save_state, calculate_verification_metadata  # noqa: PLC0415
            state = {
                "verified": False,
                "verification_error": plugin.verification_error,
                "last_verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "metadata": calculate_verification_metadata(plugin.plugin_dir, plugin.manifest),
            }
            save_state(plugin.plugin_dir, state)

    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not save settings: {exc}")

    return {"ok": True, "settings": merged}


@app.delete("/engines/{engine_id}/settings/{setting_key}")
def clear_engine_setting(engine_id: str, setting_key: str) -> dict[str, Any]:
    """Clear a read-only computed engine setting.

    Read-only computed values are excluded from verification hashes, so this
    reset does not invalidate plugin verification.
    """
    plugin = _plugin_by_id(engine_id)

    try:
        schema = plugin.engine.settings_schema()
    except Exception:
        schema = {}
    if not schema and getattr(plugin, "settings_schema", None):
        schema = plugin.settings_schema
    if not schema:
        raise HTTPException(
            status_code=500,
            detail="Could not retrieve settings schema: engine provides no settings_schema",
        )

    properties = schema.get("properties", {})
    prop = properties.get(setting_key) if isinstance(properties, dict) else None
    if not prop:
        raise HTTPException(status_code=404, detail=f"Unknown setting: {setting_key}")
    if not prop.get("readOnly"):
        raise HTTPException(
            status_code=400,
            detail="Only read-only computed settings can be reset.",
        )

    if setting_key == COMPUTER_SPEED_MULTIPLIER_KEY:
        result = clear_engine_computer_speed_baseline(engine_id)
        return {
            "status": "ok",
            "engine_id": engine_id,
            "setting": setting_key,
            "cleared": True,
            "value": None,
            **result,
        }

    current = load_settings(plugin.plugin_dir)
    if setting_key in current:
        current.pop(setting_key, None)
        save_settings(plugin.plugin_dir, current)

    return {
        "status": "ok",
        "engine_id": engine_id,
        "setting": setting_key,
        "cleared": True,
        "value": None,
    }


@app.post("/engines/{engine_id}/install")
def install_dependencies(engine_id: str) -> dict[str, Any]:
    """Trigger dependency installation for an engine."""
    plugin = _plugin_by_id(engine_id)
    req_file = plugin.plugin_dir / "requirements.txt"
    if not req_file.is_file():
        return {"ok": True, "message": "No requirements.txt found for this engine."}

    import subprocess
    import sys
    from app.tts_server.plugin_loader import _check_dependencies

    logger.info("Installing dependencies for %s from %s", engine_id, req_file)
    try:
        # Use sys.executable to ensure we use the same venv.
        cmd = [sys.executable, "-m", "pip", "install", "-r", str(req_file)]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            output = "\n".join(
                part.strip()
                for part in (result.stderr, result.stdout)
                if part and part.strip()
            )
            output = output[-4000:]
            detail = (
                f"Dependency installation failed for {engine_id} "
                f"(exit {result.returncode})."
            )
            if output:
                detail = f"{detail}\n{output}"
            logger.error("Pip install failed for %s: %s", engine_id, detail)
            raise HTTPException(status_code=500, detail=detail)

        # Re-check dependencies and update plugin state.
        deps_ok, missing = _check_dependencies(plugin.plugin_dir)
        plugin.dependencies_satisfied = deps_ok
        plugin.missing_dependencies = missing

        # If dependencies are now satisfied, try to recover the plugin state.
        if deps_ok:
            if plugin.engine is not None:
                # Re-run check_env to update setup_message.
                try:
                    ok, msg = plugin.engine.check_env()
                    if ok:
                        plugin.setup_message = None
                    else:
                        plugin.setup_message = str(msg or "Setup required.")
                except Exception as exc:
                    plugin.setup_message = f"check_env() crashed: {exc}"
            elif plugin.load_error:
                # Attempt to reload the plugin entirely.
                from app.tts_server.plugin_loader import _load_plugin  # noqa: PLC0415
                try:
                    new_plugin = _load_plugin(plugin_dir=plugin.plugin_dir, folder_name=plugin.folder_name)
                    # Update our shared state with the new loaded plugin.
                    with _state_lock:
                        for i, p in enumerate(_plugins):
                            if p.engine_id == engine_id:
                                _plugins[i] = new_plugin
                                plugin = new_plugin
                                break
                except Exception as exc:
                    logger.debug("Reload after install failed for %s: %s", engine_id, exc)

        return {
            "ok": True,
            "message": f"Successfully installed dependencies for {engine_id}",
            "dependencies_satisfied": deps_ok,
            "missing_dependencies": missing,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error installing dependencies for %s", engine_id)
        raise HTTPException(status_code=500, detail=f"Unexpected error: {exc}") from exc


@app.delete("/engines/{engine_id}")
def delete_engine(engine_id: str) -> dict[str, Any]:
    """Uninstall a plugin by shutting it down and deleting its directory."""
    plugin = _plugin_by_id(engine_id)

    # Protect built-in plugins from deletion.
    if plugin.manifest.get("built_in"):
        raise HTTPException(
            status_code=403,
            detail="Built-in plugins cannot be uninstalled.",
        )

    # 1. Shutdown the engine.
    if plugin.engine is not None:
        try:
            plugin.engine.shutdown()
        except Exception as exc:
            logger.warning("Shutdown failed during deletion for %s: %s", engine_id, exc)

    # 2. Delete the directory.
    import shutil
    try:
        if plugin.plugin_dir.exists():
            shutil.rmtree(plugin.plugin_dir)
            logger.info("Deleted plugin directory: %s", plugin.plugin_dir)
    except OSError as exc:
        logger.error("Failed to delete plugin directory %s: %s", plugin.plugin_dir, exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete plugin directory: {exc}",
        ) from exc

    # 3. Remove from memory.
    with _state_lock:
        global _plugins
        _plugins = [p for p in _plugins if p.engine_id != engine_id]

    return {"ok": True, "message": f"Successfully uninstalled plugin {engine_id}"}


@app.post("/engines/{engine_id}/verify")
def reverify_engine(engine_id: str) -> dict[str, Any]:
    """Re-run verification synthesis for an engine."""
    plugin = _plugin_by_id(engine_id)
    result = verify_plugin(plugin)
    plugin.verified = bool(result.ok)
    plugin.verification_error = None if result.ok else result.error
    return {
        "engine_id": engine_id,
        "ok": result.ok,
        "duration_sec": result.duration_sec,
        "error": result.error,
    }


@app.post("/tasks/{task_id}/cancel")
def cancel_task(task_id: str) -> dict[str, Any]:
    """Mark a task as cancelled so the synthesis loop can terminate it."""
    with _state_lock:
        _cancelled_tasks.add(task_id)
    logger.info("Task %s marked for cancellation", task_id)
    return {"ok": True, "task_id": task_id}


@app.post("/synthesize")
def synthesize(body: SynthesizeRequest) -> dict[str, Any]:
    """Synthesize audio for a text request."""
    from app.engines.voice.sdk import TTSRequest  # noqa: PLC0415
    from app.engines.voice.sdk import TTSResult  # noqa: PLC0415

    plugin = _plugin_by_id(body.engine_id)

    status = engine_status(plugin)
    if status in {"needs_setup", "invalid_config"}:
        raise HTTPException(
            status_code=503,
            detail=f"Engine {body.engine_id} is not ready (status: {status})",
        )
    if getattr(plugin, "verification_error", None):
        raise HTTPException(
            status_code=503,
            detail=f"Engine {body.engine_id} failed verification: {plugin.verification_error}",
        )
    if not plugin.verified:
        logger.warning(
            "Engine %s is synthesizing while verification is still pending.",
            body.engine_id,
        )

    # Load persisted settings and merge with request overrides.
    persisted = load_settings(plugin.plugin_dir)
    merged_settings = {**persisted, **body.settings}

    # Internal hook dispatch
    h = plugin.engine.hooks()

    # 1. preprocess_request (operates on a mutable dict)
    request_dict = {
        "engine_id": body.engine_id,
        "script_text": body.text,
        "output_path": body.output_path,
        "reference_audio_path": body.voice_ref,
        "settings": merged_settings,
        "language": body.language,
        "script": body.script,
    }
    h.preprocess_request(request_dict)

    # 2. select_voice
    profile_id = str(merged_settings.get("voice_profile_id") or "").strip()
    if profile_id:
        resolved = h.select_voice(profile_id, merged_settings)
        if resolved:
            request_dict["voice_id"] = resolved

    # Convert back to immutable TTSRequest
    req = TTSRequest(
        text=str(request_dict.get("script_text", body.text)),
        output_path=str(request_dict.get("output_path", body.output_path)),
        voice_ref=request_dict.get("reference_audio_path") or body.voice_ref,  # type: ignore[arg-type]
        settings=request_dict.get("settings", merged_settings),  # type: ignore[arg-type]
        language=str(request_dict.get("language", body.language)),
        script=request_dict.get("script") or body.script,  # type: ignore[arg-type]
        task_id=body.task_id,
        cancel_check=lambda: (body.task_id in _cancelled_tasks) if body.task_id else False,
    )

    try:
        ok, msg = plugin.engine.check_request(req)
        if not ok:
            raise HTTPException(status_code=422, detail=f"Request validation failed: {msg}")

        result = plugin.engine.synthesize(req)
    finally:
        # Cleanup cancellation flag after synthesis attempt
        if body.task_id:
            with _state_lock:
                _cancelled_tasks.discard(body.task_id)

    if not result.ok:
        raise HTTPException(
            status_code=500,
            detail=f"Synthesis failed: {result.error}",
        )

    # 3. postprocess_audio
    if result.output_path:
        h.postprocess_audio(result.output_path, merged_settings)

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

    # Internal hook dispatch
    h = plugin.engine.hooks()

    # 1. preprocess_request
    request_dict = {
        "engine_id": body.engine_id,
        "script_text": body.text,
        "output_path": body.output_path,
        "reference_audio_path": body.voice_ref,
        "settings": merged_settings,
        "language": body.language,
    }
    h.preprocess_request(request_dict)

    # 2. select_voice
    profile_id = str(merged_settings.get("voice_profile_id") or "").strip()
    if profile_id:
        resolved = h.select_voice(profile_id, merged_settings)
        if resolved:
            request_dict["voice_id"] = resolved

    # Convert back to immutable TTSRequest
    req = TTSRequest(
        text=str(request_dict.get("script_text", body.text)),
        output_path=str(request_dict.get("output_path", body.output_path)),
        voice_ref=request_dict.get("reference_audio_path") or body.voice_ref,  # type: ignore[arg-type]
        settings=request_dict.get("settings", merged_settings),  # type: ignore[arg-type]
        language=str(request_dict.get("language", body.language)),
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

    # 3. postprocess_audio
    if result.output_path:
        h.postprocess_audio(result.output_path, merged_settings)

    return {
        "ok": True,
        "engine_id": body.engine_id,
        "output_path": result.output_path,
        "duration_sec": result.duration_sec,
        "warnings": result.warnings,
    }


@app.post("/engines/{engine_id}/plan")
def plan_synthesis(engine_id: str, body: SynthesizeRequest) -> dict[str, Any]:
    """Query an engine for its preferred synthesis plan."""
    from app.engines.voice.sdk import TTSRequest  # noqa: PLC0415
    from dataclasses import asdict  # noqa: PLC0415

    plugin = _plugin_by_id(engine_id)
    persisted = load_settings(plugin.plugin_dir)
    merged_settings = {**persisted, **body.settings}

    req = TTSRequest(
        text=body.text,
        output_path=body.output_path,
        voice_ref=body.voice_ref,
        settings=merged_settings,
        language=body.language,
        script=body.script,
    )

    plan = plugin.engine.hooks().plan_synthesis(req)
    return asdict(plan)


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


@app.post("/plugins/import")
async def import_plugin(file: UploadFile = File(...)) -> dict[str, Any]:
    """Import a plugin from a .zip file."""
    import io
    import json
    import zipfile
    import shutil
    from pathlib import PurePosixPath

    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported.")

    content = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Invalid zip file.") from exc

    with zf:
        # 1. Path safety and member list
        members = zf.infolist()
        for member in members:
            path = PurePosixPath(member.filename)
            if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
                raise HTTPException(status_code=400, detail=f"Unsafe path in zip: {member.filename}")

        # 2. Check for manifest.json
        manifest_names = [m.filename for m in members if m.filename.lower() == "manifest.json"]
        if not manifest_names:
            raise HTTPException(status_code=400, detail="Plugin zip is missing manifest.json")

        try:
            manifest_data = json.loads(zf.read(manifest_names[0]).decode("utf-8"))
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid manifest.json: {exc}") from exc

        # 2b. Check for optional settings_schema.json
        schema_names = [m.filename for m in members if m.filename.lower() == "settings_schema.json"]
        if schema_names:
            try:
                schema_data = json.loads(zf.read(schema_names[0]).decode("utf-8"))
                if not isinstance(schema_data, dict):
                    raise ValueError("settings_schema.json must be a dictionary (object) at the root.")
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Invalid settings_schema.json: {exc}") from exc

        # 3. Validate engine_id
        engine_id = manifest_data.get("engine_id")
        if not engine_id:
            raise HTTPException(status_code=400, detail="manifest.json missing engine_id")

        import re
        if not re.fullmatch(r"[a-z][a-z0-9_]{1,14}", engine_id):
            raise HTTPException(status_code=400, detail=f"Invalid engine_id: {engine_id}")

        # 4. Check for conflicts
        target_folder = f"tts_{engine_id}"
        target_dir = _plugins_dir / target_folder
        if target_dir.exists():
            raise HTTPException(status_code=409, detail=f"Plugin folder {target_folder} already exists.")

        # 5. Extract to staging
        import uuid
        staging_dir = _plugins_dir / f".import_{uuid.uuid4().hex}"
        try:
            staging_dir.mkdir(parents=True)
            zf.extractall(staging_dir)

            # 6. Atomic-ish move
            staging_dir.rename(target_dir)
        except Exception as exc:
            if staging_dir.exists():
                shutil.rmtree(staging_dir)
            raise HTTPException(status_code=500, detail=f"Failed to extract plugin: {exc}") from exc

    # 7. Refresh plugins in memory
    load_plugins(_plugins_dir)

    return {
        "ok": True,
        "message": f"Successfully imported plugin {engine_id}",
        "engine_id": engine_id,
    }
