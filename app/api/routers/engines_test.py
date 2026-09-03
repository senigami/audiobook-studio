"""Engine verify/self-test/dev-scenario/asset routes.

Split out of the former monolithic ``engines.py`` (Task 003 — API router
split).
"""
import logging
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import JSONResponse, FileResponse
from ...engines.bridge import create_voice_bridge
from ...utils.pathing import contained_path
from .engines_shared import _check_engine_id, _safe_resolve_plugin_dir

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/engines", tags=["engines"])


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
