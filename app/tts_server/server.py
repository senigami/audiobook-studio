"""TTS Server FastAPI application.

This module is the HTTP boundary for the TTS Server subprocess.  It is the
only place that should import FastAPI, uvicorn, or HTTP-related machinery.

Callers from Studio should go through the VoiceBridge HTTP client
(``app.engines.bridge``) not import this module directly.
"""

from __future__ import annotations

import logging
import os
import re
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
    call_check_env,
    engine_status,
)
from app.engines.enablement import can_enable_engine
from app.tts_server.plugin_loader import LoadedPlugin, PluginLoadError, _validate_manifest, discover_plugins
from app.tts_server.settings_store import (
    load_settings,
    merge_settings,
    save_settings,
    redact_secret_settings,
    _load_settings_schema,
)
from app.tts_server.verification import verify_plugin

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
    _sweep_orphaned_staging_dirs()
    if _ready_port is not None:
        print(f"READY:{_ready_port}", flush=True)


def _sweep_orphaned_staging_dirs() -> None:
    """Remove leftover ``.preview_*`` staging dirs from prior runs.

    The in-memory ``_staging`` map does not survive a restart, so any staging
    dirs left on disk by an un-confirmed/un-cancelled preview would otherwise
    leak permanently with no token to clean them. Sweep them on startup to
    cap disk usage (defense against the preview disk-fill vector).
    """
    import shutil as _shutil

    try:
        if not _plugins_dir.exists():
            return
        for entry in _plugins_dir.iterdir():
            if entry.is_dir() and entry.name.startswith(".preview_"):
                try:
                    _shutil.rmtree(entry)
                    logger.info("Swept orphaned plugin staging dir: %s", entry.name)
                except OSError as exc:
                    logger.warning("Failed to sweep staging dir %s: %s", entry, exc)
    except OSError as exc:
        logger.warning("Failed to enumerate plugins dir for staging sweep: %s", exc)


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
def synthesize(body: SynthesizeRequest) -> dict[str, Any]:
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

        result = plugin.engine.synthesize(req)
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
            name = member.filename
            # Reject Windows-style backslash separators — PurePosixPath won't split these
            if "\\" in name:
                raise HTTPException(status_code=400, detail="Unsafe path in uploaded archive.")
            path = PurePosixPath(name)
            if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
                raise HTTPException(status_code=400, detail="Unsafe path in uploaded archive.")

        # 2. Check for manifest.json
        manifest_names = [m.filename for m in members if m.filename.lower() == "manifest.json"]
        if not manifest_names:
            raise HTTPException(status_code=400, detail="Plugin zip is missing manifest.json")

        try:
            manifest_data = json.loads(zf.read(manifest_names[0]).decode("utf-8"))
        except Exception as exc:
            logger.exception("Failed to parse manifest.json in plugin zip")
            raise HTTPException(status_code=400, detail="Invalid manifest.json.") from exc

        # 2b. Check for optional settings_schema.json
        schema_names = [m.filename for m in members if m.filename.lower() == "settings_schema.json"]
        if schema_names:
            try:
                schema_data = json.loads(zf.read(schema_names[0]).decode("utf-8"))
                if not isinstance(schema_data, dict):
                    raise ValueError("settings_schema.json must be a dictionary (object) at the root.")
            except Exception as exc:
                logger.exception("Failed to parse settings_schema.json in plugin zip")
                raise HTTPException(status_code=400, detail="Invalid settings_schema.json.") from exc

        # 3. Validate engine_id
        engine_id = manifest_data.get("engine_id")
        if not engine_id:
            raise HTTPException(status_code=400, detail="manifest.json missing engine_id")

        import re
        if not re.fullmatch(r"[a-z][a-z0-9_]{1,14}", engine_id):
            raise HTTPException(status_code=400, detail="Invalid engine_id in uploaded plugin manifest.")

        # 4. Check for conflicts
        target_folder = f"tts_{engine_id}"
        target_dir = _plugins_dir / target_folder
        if target_dir.exists():
            raise HTTPException(status_code=409, detail="A plugin with this engine_id is already installed.")

        # 5. Extract to staging
        import uuid
        staging_dir = _plugins_dir / f".import_{uuid.uuid4().hex}"
        try:
            staging_dir.mkdir(parents=True)
            zf.extractall(staging_dir)

            # 5b. Post-extract containment check — guard against zip implementations
            # that honour backslash separators on Windows or other bypass techniques.
            staging_resolved = staging_dir.resolve()
            for extracted in staging_dir.rglob("*"):
                if not extracted.resolve().is_relative_to(staging_resolved):
                    raise ValueError(f"Extracted path escapes staging dir: {extracted}")

            # 6. Atomic-ish move
            staging_dir.rename(target_dir)
        except (ValueError, OSError) as exc:
            if staging_dir.exists():
                shutil.rmtree(staging_dir)
            logger.exception("Failed to extract plugin zip to staging dir")
            raise HTTPException(status_code=500, detail="Failed to extract plugin.") from exc
        except Exception as exc:
            if staging_dir.exists():
                shutil.rmtree(staging_dir)
            logger.exception("Unexpected error during plugin extraction")
            raise HTTPException(status_code=500, detail="Failed to extract plugin.") from exc

    # 7. Refresh plugins in memory
    load_plugins(_plugins_dir)

    return {
        "ok": True,
        "message": f"Successfully imported plugin {engine_id}",
        "engine_id": engine_id,
    }


# ---------------------------------------------------------------------------
# Plugin staging store — keyed by opaque UUID token
# ---------------------------------------------------------------------------

_staging_lock = threading.Lock()
# token -> {"staging_dir": Path, "engine_id": str, "display_name": str,
#           "version": str|None, "requirements": list[str]}
_staging: dict[str, dict] = {}


_GITHUB_REPO_RE = re.compile(r"^/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?/?$")


def _normalize_github_repo_url(raw_url: str) -> str:
    """Return a canonical GitHub repository URL or raise ``HTTPException``."""
    from urllib.parse import urlparse

    parsed = urlparse(raw_url.strip())
    if parsed.scheme != "https" or parsed.netloc.lower() != "github.com":
        raise HTTPException(status_code=400, detail="Only https://github.com/<owner>/<repo> URLs are supported.")
    if parsed.username or parsed.password or parsed.params or parsed.query or parsed.fragment:
        raise HTTPException(status_code=400, detail="GitHub repository URL must not include credentials, query, or fragment.")
    if not _GITHUB_REPO_RE.fullmatch(parsed.path):
        raise HTTPException(status_code=400, detail="GitHub repository URL must be https://github.com/<owner>/<repo>.")
    return f"https://github.com{parsed.path.rstrip('/')}"


def _reject_staging_symlinks(staging_dir: Path) -> None:
    """Reject cloned plugin repos that contain symlinks before trust confirmation."""
    for entry in staging_dir.rglob("*"):
        if entry.is_symlink():
            raise HTTPException(status_code=400, detail="Plugin repository must not contain symlinks.")


def _parse_requirements(req_text: str) -> list[str]:
    """Return non-empty, non-comment requirement lines."""
    lines = []
    for line in req_text.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            lines.append(stripped)
    return lines


@app.post("/plugins/preview")
async def preview_plugin(file: UploadFile = File(...)) -> dict[str, Any]:
    """Stage a plugin zip and return manifest metadata + requirements WITHOUT installing.

    Returns ``{ok, engine_id, display_name, version, requirements, staging_token}``
    where ``requirements`` is the list of non-comment lines from ``requirements.txt``
    (empty list if no requirements file is present).  The caller MUST either
    POST ``/plugins/confirm/{token}`` to complete the install or
    DELETE ``/plugins/staging/{token}`` to discard.
    """
    import io
    import json
    import zipfile
    import shutil
    import re
    import uuid
    from pathlib import PurePosixPath

    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported.")

    content = await file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Invalid zip file.") from exc

    with zf:
        members = zf.infolist()
        for member in members:
            name = member.filename
            if "\\" in name:
                raise HTTPException(status_code=400, detail="Unsafe path in uploaded archive.")
            path = PurePosixPath(name)
            if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
                raise HTTPException(status_code=400, detail="Unsafe path in uploaded archive.")

        manifest_names = [m.filename for m in members if m.filename.lower() == "manifest.json"]
        if not manifest_names:
            raise HTTPException(status_code=400, detail="Plugin zip is missing manifest.json")

        try:
            manifest_data = json.loads(zf.read(manifest_names[0]).decode("utf-8"))
        except Exception as exc:
            logger.exception("Failed to parse manifest.json in plugin zip")
            raise HTTPException(status_code=400, detail="Invalid manifest.json.") from exc

        schema_names = [m.filename for m in members if m.filename.lower() == "settings_schema.json"]
        if schema_names:
            try:
                schema_data = json.loads(zf.read(schema_names[0]).decode("utf-8"))
                if not isinstance(schema_data, dict):
                    raise ValueError("settings_schema.json must be a dictionary (object) at the root.")
            except Exception as exc:
                logger.exception("Failed to parse settings_schema.json in plugin zip")
                raise HTTPException(status_code=400, detail="Invalid settings_schema.json.") from exc

        engine_id = manifest_data.get("engine_id")
        if not engine_id:
            raise HTTPException(status_code=400, detail="manifest.json missing engine_id")

        if not re.fullmatch(r"[a-z][a-z0-9_]{1,14}", engine_id):
            raise HTTPException(status_code=400, detail="Invalid engine_id in uploaded plugin manifest.")

        target_folder = f"tts_{engine_id}"
        target_dir = _plugins_dir / target_folder
        if target_dir.exists():
            raise HTTPException(status_code=409, detail="A plugin with this engine_id is already installed.")

        # Read requirements before extraction — we only need the text content.
        req_text = ""
        req_names = [m.filename for m in members if m.filename.lower() == "requirements.txt"]
        if req_names:
            try:
                req_text = zf.read(req_names[0]).decode("utf-8", errors="replace")
            except Exception:
                pass

        requirements = _parse_requirements(req_text)

        # Extract to staging but do NOT rename to final location yet.
        token = uuid.uuid4().hex
        staging_dir = _plugins_dir / f".preview_{token}"
        try:
            staging_dir.mkdir(parents=True)
            zf.extractall(staging_dir)

            staging_resolved = staging_dir.resolve()
            for extracted in staging_dir.rglob("*"):
                if not extracted.resolve().is_relative_to(staging_resolved):
                    raise ValueError(f"Extracted path escapes staging dir: {extracted}")
        except (ValueError, OSError) as exc:
            if staging_dir.exists():
                shutil.rmtree(staging_dir)
            logger.exception("Failed to extract plugin zip to staging dir (preview)")
            raise HTTPException(status_code=500, detail="Failed to stage plugin.") from exc
        except Exception as exc:
            if staging_dir.exists():
                shutil.rmtree(staging_dir)
            logger.exception("Unexpected error during plugin preview extraction")
            raise HTTPException(status_code=500, detail="Failed to stage plugin.") from exc

    display_name = manifest_data.get("display_name") or engine_id
    version = manifest_data.get("version") or None

    with _staging_lock:
        _staging[token] = {
            "staging_dir": staging_dir,
            "engine_id": engine_id,
            "display_name": display_name,
            "version": version,
            "requirements": requirements,
        }

    return {
        "ok": True,
        "engine_id": engine_id,
        "display_name": display_name,
        "version": version,
        "requirements": requirements,
        "staging_token": token,
    }


@app.post("/plugins/preview_github")
def preview_github_plugin(body: PreviewGithubRequest) -> dict[str, Any]:
    """Stage a GitHub plugin repo and return manifest metadata + requirements WITHOUT installing.

    Returns ``{ok, engine_id, display_name, version, requirements, staging_token}``.
    The caller MUST either POST ``/plugins/confirm/{token}`` to complete the install or
    DELETE ``/plugins/staging/{token}`` to discard.
    """
    import json
    import shutil
    import uuid
    import subprocess

    git_url = _normalize_github_repo_url(body.git_url)

    token = uuid.uuid4().hex
    staging_dir = _plugins_dir / f".preview_{token}"

    try:
        # 1. Clone the repository into the staging directory
        staging_dir.mkdir(parents=True)
        # Using depth=1 for shallow clone to be faster and save disk space
        cmd = ["git", "clone", "--depth", "1", git_url, str(staging_dir)]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=120)
        if result.returncode != 0:
            output = "\n".join(part.strip() for part in (result.stderr, result.stdout) if part and part.strip())
            logger.error("Git clone failed for %s: %s", git_url, output[-4000:])
            raise HTTPException(status_code=400, detail="Failed to clone GitHub repository.")

        _reject_staging_symlinks(staging_dir)

        # 2. Check for manifest.json
        manifest_path = staging_dir / "manifest.json"
        if not manifest_path.is_file():
            raise HTTPException(status_code=400, detail="Repository is missing manifest.json")

        try:
            manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.exception("Failed to parse manifest.json from GitHub repo")
            raise HTTPException(status_code=400, detail="Invalid manifest.json.") from exc

        # 2b. Check for optional settings_schema.json
        schema_path = staging_dir / "settings_schema.json"
        if schema_path.is_file():
            try:
                schema_data = json.loads(schema_path.read_text(encoding="utf-8"))
                if not isinstance(schema_data, dict):
                    raise ValueError("settings_schema.json must be a dictionary (object) at the root.")
            except Exception as exc:
                logger.exception("Failed to parse settings_schema.json from GitHub repo")
                raise HTTPException(status_code=400, detail="Invalid settings_schema.json.") from exc

        preview_engine_id = str(manifest_data.get("engine_id") or "").strip()
        preview_folder_name = f"tts_{preview_engine_id}" if preview_engine_id else staging_dir.name
        try:
            _validate_manifest(manifest=manifest_data, folder_name=preview_folder_name)
        except PluginLoadError as exc:
            logger.warning("GitHub plugin manifest validation failed: %s", exc)
            raise HTTPException(status_code=400, detail="Plugin manifest failed validation.") from exc

        engine_id = preview_engine_id

        target_folder = f"tts_{engine_id}"
        target_dir = _plugins_dir / target_folder
        if target_dir.exists():
            raise HTTPException(status_code=409, detail="A plugin with this engine_id is already installed.")

        # 4. Parse requirements
        req_text = ""
        req_path = staging_dir / "requirements.txt"
        if req_path.is_file():
            try:
                req_text = req_path.read_text(encoding="utf-8", errors="replace")
            except Exception:
                pass

        requirements = _parse_requirements(req_text)

    except HTTPException:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        raise
    except subprocess.TimeoutExpired as exc:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        logger.warning("Git clone timed out for %s", git_url)
        raise HTTPException(status_code=408, detail="Timed out while cloning GitHub repository.") from exc
    except Exception as exc:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        logger.exception("Unexpected error during GitHub plugin preview clone")
        raise HTTPException(status_code=500, detail="Failed to stage GitHub plugin.") from exc

    display_name = manifest_data.get("display_name") or engine_id
    version = manifest_data.get("version") or None

    with _staging_lock:
        _staging[token] = {
            "staging_dir": staging_dir,
            "engine_id": engine_id,
            "display_name": display_name,
            "version": version,
            "requirements": requirements,
        }

    return {
        "ok": True,
        "engine_id": engine_id,
        "display_name": display_name,
        "version": version,
        "requirements": requirements,
        "staging_token": token,
    }


@app.post("/plugins/confirm/{token}")
def confirm_plugin_import(token: str) -> dict[str, Any]:
    """Complete a staged plugin import.

    Moves the staging directory to the final plugin location and loads the plugin.
    The staging entry is removed regardless of outcome.
    """
    import re
    import shutil

    if not re.fullmatch(r"[0-9a-f]{32}", token):
        raise HTTPException(status_code=400, detail="Invalid staging token.")

    with _staging_lock:
        entry = _staging.pop(token, None)

    if entry is None:
        raise HTTPException(status_code=404, detail="Staging token not found or already used.")

    staging_dir: Path = entry["staging_dir"]
    engine_id: str = entry["engine_id"]
    target_dir = _plugins_dir / f"tts_{engine_id}"

    if target_dir.exists():
        if staging_dir.exists():
            shutil.rmtree(staging_dir)
        raise HTTPException(status_code=409, detail="A plugin with this engine_id is already installed.")

    try:
        staging_dir.rename(target_dir)
    except OSError as exc:
        if staging_dir.exists():
            shutil.rmtree(staging_dir)
        logger.exception("Failed to move staging dir to target for engine %s", engine_id)
        raise HTTPException(status_code=500, detail="Failed to install plugin.") from exc

    load_plugins(_plugins_dir)

    return {
        "ok": True,
        "message": f"Successfully imported plugin {engine_id}",
        "engine_id": engine_id,
    }


@app.delete("/plugins/staging/{token}")
def cancel_plugin_staging(token: str) -> dict[str, Any]:
    """Discard a staged plugin import and clean up the staging directory."""
    import re
    import shutil

    if not re.fullmatch(r"[0-9a-f]{32}", token):
        raise HTTPException(status_code=400, detail="Invalid staging token.")

    with _staging_lock:
        entry = _staging.pop(token, None)

    if entry is None:
        # Already consumed or never existed — treat as success (idempotent cancel).
        return {"ok": True, "message": "Staging token not found (already cancelled or consumed)."}

    staging_dir: Path = entry["staging_dir"]
    if staging_dir.exists():
        try:
            import shutil as _shutil
            _shutil.rmtree(staging_dir)
        except OSError as exc:
            logger.warning("Failed to remove staging dir %s: %s", staging_dir, exc)

    return {"ok": True, "message": "Staging cancelled."}


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
        "requirements": _parse_requirements(req_text),
    }
