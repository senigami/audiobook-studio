"""TTS Server FastAPI application.

This module is the HTTP boundary for the TTS Server subprocess.  It is the
only place that should import FastAPI, uvicorn, or HTTP-related machinery.

Callers from Studio should go through the VoiceBridge HTTP client
(``app.engines.bridge``) not import this module directly.
"""

from __future__ import annotations

import logging
import threading
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.core.config import PLUGINS_DIR
from app.tts_server.performance_settings import (
    COMPUTER_SPEED_MULTIPLIER_KEY,
    clear_engine_computer_speed_baseline,
)
from app.tts_server.health import (
    build_engine_detail,
    build_health_response,
    call_check_env,
    engine_status,
)
from app.engines.enablement import can_enable_engine
from app.tts_server.plugin_loader import LoadedPlugin, discover_plugins
from app.tts_server.settings_store import (
    load_settings,
    merge_settings,
    save_settings,
    redact_secret_settings,
    _load_settings_schema,
)
from app.tts_server.verification import verify_plugin
from app.tts_server import plugin_staging

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


def _is_task_cancelled(task_id: str) -> bool:
    """Thread-safe membership check; _cancelled_tasks is mutated under _state_lock."""
    with _state_lock:
        return task_id in _cancelled_tasks


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
    """Discover and load all plugins.

    Called by the entry point after the server configuration is applied.
    Thread-safe — writes to the shared plugin list under the lock. Verification
    synthesis is intentionally not run here; plugin ``run_test()`` may generate
    audio and must only run from the explicit engine verify action in Settings.

    Args:
        plugins_dir: Absolute path to the ``plugins/`` directory.
    """
    global _plugins, _plugins_dir
    discovered = discover_plugins(plugins_dir)

    # Update state immediately so discovery results are visible to Studio.
    with _state_lock:
        _plugins = discovered
        _plugins_dir = plugins_dir

    logger.info("Discovered %d plugin(s) from %s. Verification is manual.", len(discovered), plugins_dir)


@app.on_event("startup")
def _announce_ready() -> None:
    """Announce readiness only after the ASGI app has fully started."""
    plugin_staging.sweep_orphaned_staging_dirs(_plugins_dir)
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


class PreviewGithubRequest(BaseModel):
    git_url: str


class SettingsUpdateRequest(BaseModel):
    settings: dict[str, Any]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> JSONResponse:
    """Overall server health and per-engine status."""
    try:
        with _state_lock:
            plugins_snapshot = list(_plugins)
        payload = build_health_response(plugins_snapshot)
        status_code = 200 if payload["status"] == "ok" else 207
        return JSONResponse(content=payload, status_code=status_code)
    except Exception:
        logger.exception("Health check failed")
        return JSONResponse(content={"status": "error"}, status_code=500)


@app.get("/ready")
def ready() -> JSONResponse:
    """Cheap readiness probe used by the Studio watchdog."""
    return JSONResponse(content={"status": "ready"}, status_code=200)


@app.get("/engines")
def list_engines() -> list[dict[str, Any]]:
    """List all loaded engine plugins."""
    try:
        with _state_lock:
            plugins_snapshot = list(_plugins)
        result = []
        for plugin in plugins_snapshot:
            settings = load_settings(plugin.plugin_dir)
            result.append(build_engine_detail(plugin, settings))
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to list engines")
        raise HTTPException(status_code=500, detail="Failed to list engines.")


@app.get("/engines/{engine_id}")
def get_engine(engine_id: str) -> dict[str, Any]:
    """Get detail for a single engine."""
    try:
        plugin = _plugin_by_id(engine_id)
        settings = load_settings(plugin.plugin_dir)
        return build_engine_detail(plugin, settings)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to get engine %s", engine_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve engine detail.")


@app.get("/engines/{engine_id}/settings")
def get_engine_settings(engine_id: str) -> dict[str, Any]:
    """Get current persisted settings for an engine.

    Secret fields (marked ``"secret": true`` in ``settings_schema.json``) are
    masked as ``"***"`` so they never reach the client in plain text.
    """
    plugin = _plugin_by_id(engine_id)
    settings = load_settings(plugin.plugin_dir)
    schema = _load_settings_schema(plugin.plugin_dir)
    return redact_secret_settings(settings, schema)


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
        logger.exception("Could not save settings for engine %s", engine_id)
        raise HTTPException(status_code=500, detail="Could not save settings.")

    # NOTE: if logging is ever added for the merged dict, use
    # redact_secret_settings(merged, schema) before writing to logs.
    return {"ok": True, "settings": redact_secret_settings(merged, schema)}


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
                    ok, msg = call_check_env(plugin.engine, plugin.plugin_dir)
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
        raise HTTPException(status_code=500, detail="Internal engine error.") from exc


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
            detail="Failed to delete plugin directory.",
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


def _engine_readiness_status(plugin) -> str:
    """Resolve engine status with the persisted settings, like /engines does.

    Settings-keyed engines (e.g. an API key stored in engine settings) report
    needs_setup when check_env runs without them.
    """
    try:
        current_settings = load_settings(plugin.plugin_dir)
    except Exception:
        current_settings = {}
    return engine_status(plugin, current_settings=current_settings)


@app.post("/synthesize")
async def synthesize(body: SynthesizeRequest) -> dict[str, Any]:
    """Synthesize audio for a text request."""
    from app.engines.voice.sdk import TTSRequest  # noqa: PLC0415
    from app.engines.voice.sdk import TTSResult  # noqa: PLC0415

    plugin = _plugin_by_id(body.engine_id)

    status = _engine_readiness_status(plugin)
    if status in {"needs_setup", "invalid_config"}:
        raise HTTPException(
            status_code=503,
            detail=f"Engine {body.engine_id} is not ready (status: {status})",
        )
    if getattr(plugin, "verification_error", None):
        logger.exception("Engine %s failed verification: %s", body.engine_id, plugin.verification_error)
        raise HTTPException(
            status_code=503,
            detail=f"Engine {body.engine_id} failed verification.",
        )
    if not plugin.verified:
        raise HTTPException(
            status_code=503,
            detail=f"Engine {body.engine_id} has not passed verification.",
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
        cancel_check=lambda: _is_task_cancelled(body.task_id) if body.task_id else False,
    )

    try:
        ok, msg = plugin.engine.check_request(req)
        if not ok:
            raise HTTPException(status_code=422, detail=f"Request validation failed: {msg}")

        # Offload the blocking engine call to a threadpool so the ASGI event loop
        # can service other requests concurrently.  Starlette's default anyio thread
        # limiter (40 threads) comfortably exceeds any realistic per-engine cap (≤8).
        result = await run_in_threadpool(plugin.engine.synthesize, req)
    finally:
        # Cleanup cancellation flag after synthesis attempt
        if body.task_id:
            with _state_lock:
                _cancelled_tasks.discard(body.task_id)

    if not result.ok:
        logger.exception("Synthesis failed for engine %s: %s", body.engine_id, result.error)
        raise HTTPException(
            status_code=500,
            detail="Synthesis failed.",
        )

    # 3. postprocess_audio
    if result.output_path:
        h.postprocess_audio(result.output_path, merged_settings)

    # 4. check_output QA hook — failure-isolated: a crashing hook logs + accepts.
    try:
        qa_ok, qa_reason = plugin.engine.check_output(req, result)
    except Exception:
        logger.warning(
            "check_output() raised for engine %s — treating as accepted",
            body.engine_id,
            exc_info=True,
        )
        qa_ok, qa_reason = True, "OK"

    if not qa_ok:
        # Delete the rejected artifact so it never enters the validated-artifact cache.
        if result.output_path:
            try:
                import os as _os
                _os.remove(result.output_path)
            except OSError:
                logger.warning(
                    "Could not delete rejected artifact %s for engine %s",
                    result.output_path,
                    body.engine_id,
                )
        logger.warning(
            "Engine %s rejected its own output: %s",
            body.engine_id,
            qa_reason,
        )
        return JSONResponse(
            content={"ok": False, "error": "output_rejected", "reason": qa_reason},
            status_code=422,
        )

    timing_dict = None
    if getattr(result, "timing", None) is not None:
        t = result.timing
        def get_val(obj, key):
            if isinstance(obj, dict):
                return obj.get(key)
            return getattr(obj, key, None)

        segments_raw = get_val(t, "segments")
        segments_list = None
        if segments_raw is not None:
            segments_list = []
            for s in segments_raw:
                segments_list.append({
                    "segment_id": get_val(s, "segment_id"),
                    "render_started_at": get_val(s, "render_started_at"),
                    "render_completed_at": get_val(s, "render_completed_at"),
                    "chars": get_val(s, "chars")
                })

        engine_activity_started_at = get_val(t, "engine_activity_started_at")
        chapter_render_started_at = get_val(t, "chapter_render_started_at")
        chapter_render_completed_at = get_val(t, "chapter_render_completed_at")
        model_load_seconds = None
        synthesis_duration_seconds = None
        sum_segment_render_seconds = None
        inter_group_overhead_seconds = None

        if chapter_render_started_at is not None and chapter_render_completed_at is not None:
            synthesis_duration_seconds = chapter_render_completed_at - chapter_render_started_at
            if engine_activity_started_at is not None:
                model_load_seconds = chapter_render_started_at - engine_activity_started_at

            if segments_list:
                valid_segments = [
                    s for s in segments_list
                    if s.get("render_started_at") is not None and s.get("render_completed_at") is not None
                ]
                if valid_segments:
                    sum_segment_render_seconds = sum(
                        max(0.0, float(s["render_completed_at"]) - float(s["render_started_at"]))
                        for s in valid_segments
                    )
                    first_segment_start = min(float(s["render_started_at"]) for s in valid_segments)
                    last_segment_end = max(float(s["render_completed_at"]) for s in valid_segments)
                    inter_group_overhead_seconds = max(
                        0.0,
                        (last_segment_end - first_segment_start) - sum_segment_render_seconds,
                    )
            if sum_segment_render_seconds is None:
                sum_segment_render_seconds = synthesis_duration_seconds
            if inter_group_overhead_seconds is None:
                inter_group_overhead_seconds = 0.0

        timing_dict = {
            "chapter_render_started_at": chapter_render_started_at,
            "chapter_render_completed_at": chapter_render_completed_at,
            "engine_activity_started_at": engine_activity_started_at,
            "segments": segments_list,
            "model_load_seconds": model_load_seconds,
            "synthesis_duration_seconds": synthesis_duration_seconds,
            "sum_segment_render_seconds": sum_segment_render_seconds,
            "inter_group_overhead_seconds": inter_group_overhead_seconds,
        }

    response_payload = {
        "ok": True,
        "engine_id": body.engine_id,
        "output_path": result.output_path,
        "duration_sec": result.duration_sec,
        "warnings": result.warnings,
    }
    if timing_dict is not None:
        response_payload["timing"] = timing_dict

    return response_payload


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
        logger.exception("Preview failed for engine %s: %s", body.engine_id, result.error)
        raise HTTPException(
            status_code=500,
            detail="Preview failed.",
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

    Newly added plugins are loaded with persisted verification state only.
    Removed plugins are unloaded. Existing plugins that are already loaded are
    not reloaded unless their folder was removed and re-added.
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
    content = await file.read()
    return plugin_staging.import_plugin_zip(content=content, filename=file.filename, plugins_dir=_plugins_dir)


@app.post("/plugins/preview")
async def preview_plugin(file: UploadFile = File(...)) -> dict[str, Any]:
    """Stage a plugin zip and return manifest metadata + requirements WITHOUT installing.

    Returns ``{ok, engine_id, display_name, version, requirements, staging_token}``
    where ``requirements`` is the list of non-comment lines from ``requirements.txt``
    (empty list if no requirements file is present).  The caller MUST either
    POST ``/plugins/confirm/{token}`` to complete the install or
    DELETE ``/plugins/staging/{token}`` to discard.
    """
    content = await file.read()
    return plugin_staging.preview_plugin_zip(content=content, filename=file.filename, plugins_dir=_plugins_dir)


@app.post("/plugins/preview_github")
def preview_github_plugin(body: PreviewGithubRequest) -> dict[str, Any]:
    """Stage a GitHub plugin repo and return manifest metadata + requirements WITHOUT installing.

    Returns ``{ok, engine_id, display_name, version, requirements, staging_token}``.
    The caller MUST either POST ``/plugins/confirm/{token}`` to complete the install or
    DELETE ``/plugins/staging/{token}`` to discard.
    """
    return plugin_staging.preview_github_repo(git_url=body.git_url, plugins_dir=_plugins_dir)


@app.post("/plugins/confirm/{token}")
def confirm_plugin_import(token: str) -> dict[str, Any]:
    """Complete a staged plugin import.

    Moves the staging directory to the final plugin location and loads the plugin.
    The staging entry is removed regardless of outcome.
    """
    return plugin_staging.confirm_staged_plugin(token=token, plugins_dir=_plugins_dir)


@app.delete("/plugins/staging/{token}")
def cancel_plugin_staging(token: str) -> dict[str, Any]:
    """Discard a staged plugin import and clean up the staging directory."""
    return plugin_staging.cancel_staged_plugin(token=token)


@app.get("/engines/{engine_id}/requirements")
def get_engine_requirements(engine_id: str) -> dict[str, Any]:
    """Return the requirements.txt lines for an installed engine.

    Returns ``{ok, engine_id, requirements: list[str]}`` where ``requirements``
    is the list of non-comment, non-empty lines.  Returns an empty list when
    no ``requirements.txt`` is present.
    """
    plugin = _plugin_by_id(engine_id)
    req_file = plugin.plugin_dir / "requirements.txt"
    if not req_file.is_file():
        return {"ok": True, "engine_id": engine_id, "requirements": []}

    try:
        req_text = req_file.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        logger.warning("Could not read requirements.txt for %s: %s", engine_id, exc)
        raise HTTPException(status_code=500, detail="Could not read requirements file.") from exc

    return {
        "ok": True,
        "engine_id": engine_id,
        "requirements": plugin_staging._parse_requirements(req_text),
    }
