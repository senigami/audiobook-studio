import logging
import os
import re
from pathlib import Path
from typing import Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Body, File, UploadFile
from fastapi.responses import JSONResponse, FileResponse
from ...engines.bridge import create_voice_bridge
from ...utils.pathing import contained_path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/engines", tags=["engines"])

class GithubPreviewRequest(BaseModel):
    git_url: str

# ---------------------------------------------------------------------------
# Input-validation helpers
# ---------------------------------------------------------------------------

# Matches plugin folder suffixes like "tts_<name>" where <name> is 2–15
# lowercase alphanumeric chars (same rule as _PLUGIN_FOLDER_RE in plugin_loader).
_PLUGIN_FOLDER_RE = re.compile(r"^tts_[a-z][a-z0-9]{1,14}$")

# Broader engine-id regex for routes that accept engine ids that may come from
# the TTS Server registry (allows hyphens/underscores, up to 64 chars).
_ENGINE_ID_RE = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")


def _check_engine_id(engine_id: str) -> Optional[JSONResponse]:
    """Return a 400 JSONResponse if *engine_id* fails the strict format check.

    Returns None when the id is acceptable so callers can do::

        if err := _check_engine_id(engine_id):
            return err
    """
    if not _ENGINE_ID_RE.match(engine_id):
        return JSONResponse(
            {"status": "error", "message": "Invalid engine_id format"},
            status_code=400,
        )
    return None


def _safe_resolve_plugin_dir(
    *, engine_id: str, module_path: str
) -> "tuple[Optional[Path], Optional[JSONResponse]]":
    """Resolve the plugin directory and assert it stays inside PLUGINS_DIR.

    Returns ``(path, None)`` on success or ``(None, error_response)`` on failure.
    """
    from app.core.config import PLUGINS_DIR  # noqa: PLC0415

    plugin_dir = _resolve_plugin_dir(engine_id=engine_id, module_path=module_path)
    if plugin_dir is None:
        return None, JSONResponse(
            {"ok": False, "message": "Could not resolve plugin directory"},
            status_code=404,
        )

    try:
        plugin_dir = contained_path(PLUGINS_DIR, plugin_dir.name)
    except ValueError:
        logger.warning(
            "Plugin dir %s escapes PLUGINS_DIR %s for engine_id %r",
            plugin_dir,
            PLUGINS_DIR,
            engine_id,
        )
        return None, JSONResponse(
            {"ok": False, "message": "Could not resolve plugin directory"},
            status_code=404,
        )

    return plugin_dir, None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("")
def list_engines():
    """List all registered TTS engines and their health/manifests."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        return bridge.describe_registry()
    except EngineUnavailableError:
        logger.warning("TTS Server unavailable while listing engines", exc_info=True)
        return JSONResponse({"status": "error", "message": "TTS Server is unavailable"}, status_code=503)


@router.get("/registry")
def get_official_registry_list():
    """Return the official plugin registry."""
    from ...engines.official_registry import get_official_registry
    return JSONResponse(get_official_registry())


@router.put("/{engine_id}/settings")
def update_engine_settings(engine_id: str, settings: dict[str, Any] = Body(...)):
    """Update settings for a specific engine."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        result = bridge.update_engine_settings(engine_id, settings)
        return JSONResponse(result)
    except EngineUnavailableError:
        logger.warning("TTS Server unavailable while updating settings for %r", engine_id, exc_info=True)
        return JSONResponse({"status": "error", "message": "TTS Server is unavailable"}, status_code=503)
    except NotImplementedError:
        return JSONResponse({"status": "error", "message": "Feature not implemented"}, status_code=501)
    except Exception:
        logger.exception("Engine settings update failed for %r", engine_id)
        return JSONResponse({"status": "error", "message": "Failed to update engine settings"}, status_code=500)


@router.delete("/{engine_id}/settings/{setting_key}")
def clear_engine_setting(engine_id: str, setting_key: str):
    """Clear a read-only computed setting for an engine."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        result = bridge.clear_engine_setting(engine_id, setting_key)
        return JSONResponse(result)
    except EngineUnavailableError:
        logger.warning("TTS Server unavailable while clearing setting for %r", engine_id, exc_info=True)
        return JSONResponse({"status": "error", "message": "TTS Server is unavailable"}, status_code=503)
    except Exception:
        logger.exception("Engine setting reset failed for %r", engine_id)
        return JSONResponse({"status": "error", "message": "Failed to reset engine setting"}, status_code=500)


@router.post("/refresh")
def refresh_plugins():
    """Trigger a plugin re-scan (TTS Server path only)."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        result = bridge.refresh_plugins()
        return JSONResponse(result)
    except EngineUnavailableError:
        logger.warning("TTS Server unavailable while refreshing plugins", exc_info=True)
        return JSONResponse({"status": "error", "message": "TTS Server is unavailable"}, status_code=503)
    except Exception:
        logger.exception("Plugin refresh failed")
        return JSONResponse({"status": "error", "message": "Failed to refresh plugins"}, status_code=500)


@router.post("/{engine_id}/verify")
def verify_engine(engine_id: str):
    """Trigger verification for an engine."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        return bridge.verify_engine(engine_id)
    except EngineUnavailableError:
        logger.warning("TTS Server unavailable while verifying %r", engine_id, exc_info=True)
        return JSONResponse({"status": "error", "message": "TTS Server is unavailable"}, status_code=503)


@router.get("/{engine_id}/test/audio")
def get_test_audio(engine_id: str):
    """Retrieve the latest test audio for an engine."""
    if err := _check_engine_id(engine_id):
        return err

    from ...engines.registry import load_engine_registry  # noqa: PLC0415
    registry = load_engine_registry()
    reg = registry.get(engine_id)
    if not reg:
        return JSONResponse({"ok": False, "message": "Engine not found"}, status_code=404)

    plugin_dir, err = _safe_resolve_plugin_dir(engine_id=engine_id, module_path=reg.manifest.module_path)
    if err:
        return err
    try:
        audio_path = contained_path(plugin_dir, "assets", "test_output.wav")
    except ValueError:
        return JSONResponse({"ok": False, "message": "Could not resolve plugin directory"}, status_code=404)

    if not audio_path.exists():
        return JSONResponse({"ok": False, "message": "No test audio found"}, status_code=404)
    return FileResponse(audio_path, media_type="audio/wav")


@router.post("/{engine_id}/test")
def test_engine(engine_id: str):
    """Run a self-contained synthesis test on the engine."""
    if err := _check_engine_id(engine_id):
        return err

    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()

    try:
        # 1. Trigger the self-contained test run on the TTS Server
        res = bridge.run_test(engine_id)
        if not res.get("ok"):
            return JSONResponse({"ok": False, "message": f"Test failed: {res.get('message')}"}, status_code=400)

        from ...engines.registry import load_engine_registry  # noqa: PLC0415
        registry = load_engine_registry()
        reg = registry.get(engine_id)
        if not reg:
             return JSONResponse({"ok": False, "message": "Engine not found"}, status_code=404)

        plugin_dir, err = _safe_resolve_plugin_dir(engine_id=engine_id, module_path=reg.manifest.module_path)
        if err:
            return err
        try:
            output_path = contained_path(plugin_dir, "assets", "test_output.wav")
            last_test_path = contained_path(plugin_dir, "assets", "last_test.json")
        except ValueError:
            return JSONResponse({"ok": False, "message": "Could not resolve plugin directory"}, status_code=404)

        if not output_path.exists():
             return JSONResponse({"ok": False, "message": "Test passed but output audio not found in plugin folder"}, status_code=404)

        import json
        import time

        last_test_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "ok": True,
            "audio_url": f"/api/engines/{engine_id}/test/audio",
            "generated_at": time.time(),
        }
        last_test_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

        return JSONResponse(payload)

    except EngineUnavailableError:
        logger.warning("TTS Server unavailable while testing %r", engine_id, exc_info=True)
        return JSONResponse({"ok": False, "message": "TTS Server is unavailable"}, status_code=503)
    except Exception:
        logger.exception("Engine test failed for %r", engine_id)
        return JSONResponse({"ok": False, "message": "Engine test failed"}, status_code=500)


@router.post("/{engine_id}/install")
def install_engine_dependencies(engine_id: str):
    """Trigger dependency installation for an engine."""
    from ...engines.errors import EngineUnavailableError
    from ...engines.tts_client import TtsServerError
    bridge = create_voice_bridge()
    try:
        return bridge.install_dependencies(engine_id)
    except EngineUnavailableError:
        logger.warning("TTS Server unavailable while installing deps for %r", engine_id, exc_info=True)
        return JSONResponse({"status": "error", "message": "TTS Server is unavailable"}, status_code=503)
    except TtsServerError:
        logger.exception("TTS Server error installing deps for %r", engine_id)
        return JSONResponse({"status": "error", "message": "Failed to install engine dependencies"}, status_code=500)
    except Exception:
        logger.exception("Engine dependency installation failed for %r", engine_id)
        return JSONResponse(
            {
                "status": "error",
                "message": "Failed to install engine dependencies",
            },
            status_code=500,
        )


@router.post("/import")
async def import_engine_plugin(file: UploadFile = File(...)):
    """Import an engine plugin from a .zip file."""
    from ...engines.tts_client import TtsServerError
    if not file.filename or not file.filename.lower().endswith(".zip"):
        return JSONResponse({"status": "error", "message": "Only .zip files are supported."}, status_code=400)

    # Filename safety: must be a plain basename with no path separators.
    safe_name = os.path.basename(file.filename)
    if safe_name != file.filename:
        return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=400)

    bridge = create_voice_bridge()
    try:
        content = await file.read()
        return bridge.import_plugin(content, safe_name)
    except TtsServerError:
        logger.exception("TTS Server error during plugin import")
        return JSONResponse({"status": "error", "message": "Plugin import failed"}, status_code=500)
    except Exception:
        logger.exception("Plugin import failed")
        return JSONResponse({"status": "error", "message": "Plugin import failed"}, status_code=500)


@router.post("/preview")
async def preview_engine_plugin(file: UploadFile = File(...)):
    """Stage a plugin zip and return manifest metadata without installing.

    Returns ``{ok, engine_id, display_name, version, requirements, staging_token}``.
    Call ``POST /plugins/confirm/{token}`` to complete the install or
    ``DELETE /plugins/staging/{token}`` to cancel.
    """
    from ...engines.errors import EngineUnavailableError
    from ...engines.tts_client import TtsServerError

    if not file.filename or not file.filename.lower().endswith(".zip"):
        return JSONResponse({"status": "error", "message": "Only .zip files are supported."}, status_code=400)

    safe_name = os.path.basename(file.filename)
    if safe_name != file.filename:
        return JSONResponse({"status": "error", "message": "Invalid filename"}, status_code=400)

    bridge = create_voice_bridge()
    try:
        content = await file.read()
        return bridge.preview_plugin(content, safe_name)
    except EngineUnavailableError:
        logger.warning("TTS Server unavailable during plugin preview", exc_info=True)
        return JSONResponse({"status": "error", "message": "TTS Server is unavailable"}, status_code=503)
    except TtsServerError:
        logger.exception("TTS Server error during plugin preview")
        return JSONResponse({"status": "error", "message": "Plugin preview failed"}, status_code=500)
    except Exception:
        logger.exception("Plugin preview failed")
        return JSONResponse({"status": "error", "message": "Plugin preview failed"}, status_code=500)


@router.post("/preview_github")
def preview_github_plugin(body: GithubPreviewRequest):
    """Stage a GitHub plugin repo and return manifest metadata without installing.

    Returns ``{ok, engine_id, display_name, version, requirements, staging_token}``.
    """
    from ...engines.errors import EngineUnavailableError
    from ...engines.tts_client import TtsServerError, TtsServerResponseError

    bridge = create_voice_bridge()
    try:
        return bridge.preview_github_plugin(body.git_url)
    except EngineUnavailableError:
        logger.warning("TTS Server unavailable during GitHub plugin preview", exc_info=True)
        return JSONResponse({"status": "error", "message": "TTS Server is unavailable"}, status_code=503)
    except TtsServerResponseError as exc:
        logger.warning("TTS Server rejected GitHub plugin preview: %s", exc)
        if exc.status_code in {400, 408, 409}:
            return JSONResponse(
                {"status": "error", "message": "GitHub plugin preview failed validation"},
                status_code=exc.status_code,
            )
        return JSONResponse({"status": "error", "message": "GitHub Plugin preview failed"}, status_code=500)
    except TtsServerError:
        logger.exception("TTS Server error during GitHub plugin preview")
        return JSONResponse({"status": "error", "message": "GitHub Plugin preview failed"}, status_code=500)
    except Exception:
        logger.exception("GitHub Plugin preview failed")
        return JSONResponse({"status": "error", "message": "GitHub Plugin preview failed"}, status_code=500)


@router.post("/confirm/{token}")
def confirm_engine_plugin(token: str):
    """Complete a staged plugin import identified by staging_token."""
    import re
    from ...engines.errors import EngineUnavailableError
    from ...engines.tts_client import TtsServerError

    if not re.fullmatch(r"[0-9a-f]{32}", token):
        return JSONResponse({"status": "error", "message": "Invalid staging token"}, status_code=400)

    bridge = create_voice_bridge()
    try:
        return bridge.confirm_plugin_import(token)
    except EngineUnavailableError:
        logger.warning("TTS Server unavailable during plugin confirm", exc_info=True)
        return JSONResponse({"status": "error", "message": "TTS Server is unavailable"}, status_code=503)
    except TtsServerError:
        logger.exception("TTS Server error during plugin confirm")
        return JSONResponse({"status": "error", "message": "Plugin install failed"}, status_code=500)
    except Exception:
        logger.exception("Plugin confirm failed")
        return JSONResponse({"status": "error", "message": "Plugin install failed"}, status_code=500)


@router.delete("/staging/{token}")
def cancel_engine_plugin_staging(token: str):
    """Cancel and clean up a staged plugin import."""
    import re
    from ...engines.errors import EngineUnavailableError
    from ...engines.tts_client import TtsServerError

    if not re.fullmatch(r"[0-9a-f]{32}", token):
        return JSONResponse({"status": "error", "message": "Invalid staging token"}, status_code=400)

    bridge = create_voice_bridge()
    try:
        return bridge.cancel_plugin_staging(token)
    except EngineUnavailableError:
        logger.warning("TTS Server unavailable during plugin staging cancel", exc_info=True)
        return JSONResponse({"status": "error", "message": "TTS Server is unavailable"}, status_code=503)
    except TtsServerError:
        logger.exception("TTS Server error during staging cancel")
        return JSONResponse({"status": "error", "message": "Failed to cancel staging"}, status_code=500)
    except Exception:
        logger.exception("Plugin staging cancel failed")
        return JSONResponse({"status": "error", "message": "Failed to cancel staging"}, status_code=500)


@router.get("/{engine_id}/requirements")
def get_engine_requirements(engine_id: str):
    """Return the requirements.txt lines for an installed engine."""
    if err := _check_engine_id(engine_id):
        return err

    from ...engines.errors import EngineUnavailableError
    from ...engines.tts_client import TtsServerError
    bridge = create_voice_bridge()
    try:
        return bridge.get_engine_requirements(engine_id)
    except EngineUnavailableError:
        logger.warning("TTS Server unavailable while fetching requirements for %r", engine_id, exc_info=True)
        return JSONResponse({"status": "error", "message": "TTS Server is unavailable"}, status_code=503)
    except TtsServerError:
        logger.exception("TTS Server error fetching requirements for %r", engine_id)
        return JSONResponse({"status": "error", "message": "Failed to fetch requirements"}, status_code=500)
    except Exception:
        logger.exception("Failed to fetch requirements for %r", engine_id)
        return JSONResponse({"status": "error", "message": "Failed to fetch requirements"}, status_code=500)


@router.delete("/{engine_id}")
def remove_engine_plugin(engine_id: str):
    """Remove an engine plugin."""
    bridge = create_voice_bridge()
    return bridge.remove_plugin(engine_id)


@router.get("/{engine_id}/logs")
def get_engine_logs(engine_id: str):
    """Fetch logs for an engine."""
    from ...engines.errors import EngineUnavailableError
    bridge = create_voice_bridge()
    try:
        return bridge.get_logs(engine_id)
    except EngineUnavailableError:
        logger.warning("TTS Server unavailable while fetching logs for %r", engine_id, exc_info=True)
        return JSONResponse({"status": "error", "message": "TTS Server is unavailable"}, status_code=503)


@router.get("/{engine_id}/dev/scenarios")
def get_engine_scenarios(engine_id: str):
    """Fetch developer scenario fixtures for an engine."""
    if err := _check_engine_id(engine_id):
        return err

    from ...engines.registry import load_engine_registry  # noqa: PLC0415
    registry = load_engine_registry()
    reg = registry.get(engine_id)
    if not reg:
        return JSONResponse({"ok": False, "message": "Engine not found"}, status_code=404)

    plugin_dir, err = _safe_resolve_plugin_dir(engine_id=engine_id, module_path=reg.manifest.module_path)
    if err:
        return err

    dev_config = getattr(reg.manifest, "dev", None)
    if dev_config is None:
        dev_config = getattr(reg.manifest, "raw", {}).get("dev", {})
    if not dev_config or not dev_config.get("enabled"):
        return JSONResponse({"ok": False, "message": "Developer mode is disabled for this engine"}, status_code=403)

    scenarios_path = dev_config.get("scenarios")
    if not scenarios_path:
        return JSONResponse({"ok": False, "message": "No dev scenarios declared in manifest"}, status_code=404)

    # Path safety check
    try:
        full_path = contained_path(plugin_dir, scenarios_path)
    except ValueError:
        return JSONResponse({"ok": False, "message": "Scenario path escapes plugin directory"}, status_code=403)

    if not full_path.is_file():
        return JSONResponse({"ok": False, "message": f"Scenarios file not found: {scenarios_path}"}, status_code=404)

    import json
    try:
        data = json.loads(full_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        logger.warning("Invalid JSON in scenarios file: %s", exc)
        return JSONResponse({"ok": False, "message": "Invalid JSON in scenarios file"}, status_code=400)

    if not isinstance(data, dict):
        return JSONResponse({"ok": False, "message": "Scenarios file must be a JSON object at the root"}, status_code=400)

    scenarios = data.get("scenarios")
    if scenarios is None:
        return JSONResponse({"ok": False, "message": "Missing 'scenarios' key in scenarios file"}, status_code=400)

    if not isinstance(scenarios, list):
        return JSONResponse({"ok": False, "message": "'scenarios' must be a list"}, status_code=400)

    for i, s in enumerate(scenarios):
        if not isinstance(s, dict):
            return JSONResponse({"ok": False, "message": f"Scenario at index {i} must be an object"}, status_code=400)
        required = ["id", "label", "engine_detail"]
        missing = [f for f in required if f not in s]
        if missing:
            return JSONResponse({"ok": False, "message": f"Scenario at index {i} is missing required fields: {', '.join(missing)}"}, status_code=400)
        if not isinstance(s["id"], str):
            return JSONResponse({"ok": False, "message": f"Scenario at index {i} id must be a string"}, status_code=400)
        if not isinstance(s["label"], str):
            return JSONResponse({"ok": False, "message": f"Scenario at index {i} label must be a string"}, status_code=400)
        if not isinstance(s["engine_detail"], dict):
            return JSONResponse({"ok": False, "message": f"Scenario at index {i} engine_detail must be an object"}, status_code=400)

    return JSONResponse(data)


@router.get("/{engine_id}/assets/{asset_path:path}")
def get_engine_asset(engine_id: str, asset_path: str):
    """Serve a static asset from a plugin's folder."""
    if err := _check_engine_id(engine_id):
        return err

    from ...engines.registry import load_engine_registry  # noqa: PLC0415
    registry = load_engine_registry()
    reg = registry.get(engine_id)
    if not reg:
        return JSONResponse({"ok": False, "message": "Engine not found"}, status_code=404)

    plugin_dir, err = _safe_resolve_plugin_dir(engine_id=engine_id, module_path=reg.manifest.module_path)
    if err:
        return err

    # Security: only allow files inside assets/ and with specific extensions
    if not asset_path.startswith("assets/"):
        return JSONResponse({"ok": False, "message": "Access denied: assets only"}, status_code=403)

    allowed_exts = {".svg", ".png", ".jpg", ".jpeg", ".webp"}
    if Path(asset_path).suffix.lower() not in allowed_exts:
        return JSONResponse({"ok": False, "message": "Unsupported asset type"}, status_code=403)

    try:
        full_path = contained_path(plugin_dir, asset_path)
    except ValueError:
        return JSONResponse({"ok": False, "message": "Asset path escapes plugin directory"}, status_code=403)

    if not full_path.is_file():
        return JSONResponse({"ok": False, "message": "Asset not found"}, status_code=404)

    media_types = {
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    media_type = media_types.get(Path(asset_path).suffix.lower(), "application/octet-stream")
    return FileResponse(full_path, media_type=media_type)


# Removed self-contained resolution helpers; they are now owned by the plugins.


def _is_generated_sample_name(sample_name: str) -> bool:
    sample_path = Path(sample_name)
    return sample_path.name == sample_name and sample_name in {"sample.wav", "sample.mp3"}


def _resolve_plugin_dir(*, engine_id: str, module_path: str) -> Optional[Path]:
    from app.core.config import PLUGINS_DIR  # noqa: PLC0415

    parts = module_path.split(".")
    if len(parts) > 1 and parts[0] == "plugins":
        folder = parts[1]
        # Validate folder name against the plugin folder convention before
        # using it to build a path.
        if not _PLUGIN_FOLDER_RE.match(folder):
            return None
        return PLUGINS_DIR / folder

    safe_engine_id = "".join(ch for ch in engine_id if ch.isalnum() or ch in ("-", "_"))
    if safe_engine_id:
        return PLUGINS_DIR / f"tts_{safe_engine_id}"

    return None


@router.post("/{engine_id}/calibrate/reset")
def reset_engine_calibration(engine_id: str, model: Optional[str] = None):
    """Reset calibration data (historical render samples and cached CPS) for an engine and optionally a model."""
    from app.db.performance import reset_engine_calibration_history
    from app.db.state_performance import clear_engine_cps_cache

    safe_engine_id = "".join(ch for ch in engine_id if ch.isalnum() or ch in ("-", "_"))
    if not safe_engine_id or safe_engine_id != engine_id:
        return JSONResponse({"status": "error", "message": "Invalid engine_id format"}, status_code=400)

    try:
        reset_engine_calibration_history(engine_id, model)
        clear_engine_cps_cache(engine_id)
        return JSONResponse({"status": "ok", "engine_id": engine_id})
    except Exception:
        logger.error("Failed to reset engine calibration for %r", engine_id, exc_info=True)
        return JSONResponse({"status": "error", "message": "Failed to reset calibration"}, status_code=500)
