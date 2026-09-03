"""Engine registry/discovery/settings/concurrency routes.

Split out of the former monolithic ``engines.py`` (Task 003 — API router
split).
"""
import logging
from typing import Any, Optional
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse
from ...engines.bridge import create_voice_bridge
from .engines_shared import ConcurrencyUpdateRequest, _check_engine_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/engines", tags=["engines"])


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


@router.get("/concurrency")
def get_engine_concurrency():
    """Return the global parallel cap and a per-engine concurrency snapshot.

    W-PAR task 014 — the engine-scoped counterpart of the manifest ceiling
    the caps UI reads. Sources: the manifest ceiling and engine class
    (``_manifest_resource_claim``, reused not reimplemented), the live
    effective cap (``resolve_effective_cap``, same function
    ``reserve_task_resources`` resolves fresh on every admission attempt),
    and each engine's per-engine-id semaphore ``active_count``. All
    in-process reads (one manifest.json read per registered engine), no new
    I/O against the TTS Server.
    """
    from ...orchestration.tasks.synthesis import _manifest_resource_claim  # noqa: PLC0415
    from ...orchestration.scheduler.cap_settings import (  # noqa: PLC0415
        get_engine_caps,
        get_global_parallel_cap,
        resolve_effective_cap,
    )
    from ...orchestration.scheduler.resources import get_engine_id_semaphore  # noqa: PLC0415
    from ...engines.registry import load_engine_registry  # noqa: PLC0415

    registry = load_engine_registry()
    engine_caps = get_engine_caps()
    global_cap = get_global_parallel_cap()

    engines = []
    for engine_id in sorted(registry.keys()):
        claim = _manifest_resource_claim(engine_id)
        engines.append(
            {
                "engine_id": engine_id,
                "engine_class": claim.engine_class,
                "manifest_max": claim.manifest_max,
                "requested_cap": engine_caps.get(engine_id, global_cap),
                "effective_cap": resolve_effective_cap(
                    engine_id=engine_id, manifest_max=claim.manifest_max
                ),
                "active_count": get_engine_id_semaphore(engine_id, claim.manifest_max).active_count,
            }
        )

    return JSONResponse({"global_cap": global_cap, "engines": engines})


@router.put("/{engine_id}/concurrency")
def update_engine_concurrency(engine_id: str, body: ConcurrencyUpdateRequest):
    """Set (or clear) a per-engine concurrency cap override.

    ``{"cap": <int>}`` sets an override, validated against the manifest
    ceiling server-side (rejects out-of-range with 422 rather than silently
    clamping — ``resolve_effective_cap``'s own clamp stays as the backstop
    for env-var edits or clients that bypass this endpoint).
    ``{"cap": null}`` clears the override back to the global cap.
    """
    if err := _check_engine_id(engine_id):
        return err

    from ...orchestration.tasks.synthesis import _manifest_resource_claim  # noqa: PLC0415
    from ...orchestration.scheduler.cap_settings import (  # noqa: PLC0415
        get_engine_caps,
        get_global_parallel_cap,
        resolve_effective_cap,
    )
    from ...orchestration.scheduler.resources import get_engine_id_semaphore  # noqa: PLC0415
    from ...db.state import set_engine_cap  # noqa: PLC0415

    claim = _manifest_resource_claim(engine_id)
    manifest_max = claim.manifest_max

    if body.cap is not None and not (1 <= body.cap <= manifest_max):
        return JSONResponse(
            {
                "status": "error",
                "message": f"cap must be between 1 and {manifest_max} (the manifest ceiling)",
                "manifest_max": manifest_max,
            },
            status_code=422,
        )

    set_engine_cap(engine_id, body.cap)

    engine_caps = get_engine_caps()
    global_cap = get_global_parallel_cap()
    return JSONResponse(
        {
            "engine_id": engine_id,
            "engine_class": claim.engine_class,
            "manifest_max": manifest_max,
            "requested_cap": engine_caps.get(engine_id, global_cap),
            "effective_cap": resolve_effective_cap(engine_id=engine_id, manifest_max=manifest_max),
            "active_count": get_engine_id_semaphore(engine_id, manifest_max).active_count,
        }
    )


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
