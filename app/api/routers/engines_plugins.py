"""Plugin install/import/staging management routes.

Split out of the former monolithic ``engines.py`` (Task 003 — API router
split).
"""
import logging
import os
from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse
from ...engines.bridge import create_voice_bridge
from .engines_shared import GithubPreviewRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/engines", tags=["engines"])


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
