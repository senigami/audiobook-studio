"""Shared, non-route helpers used by the engines_* router modules.

Split out of the former monolithic ``engines.py`` (Task 003 — API router
split). Input-validation and plugin-directory-resolution helpers used across
the registry/plugin-management/dev-test route groups live here.
"""
import logging
import re
from pathlib import Path
from typing import Optional
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from ...utils.pathing import contained_path

logger = logging.getLogger(__name__)


class GithubPreviewRequest(BaseModel):
    git_url: str


class ConcurrencyUpdateRequest(BaseModel):
    """Body for ``PUT /{engine_id}/concurrency``. ``cap=None`` clears the override."""
    cap: Optional[int] = None

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
