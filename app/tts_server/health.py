"""Health aggregation for the TTS Server.

Builds the ``/health`` response by querying each loaded engine and
summarising the overall server status.
"""

from __future__ import annotations

import inspect
import logging
from typing import Any, TYPE_CHECKING

from app.engines.enablement import can_enable_engine
from app.tts_server.settings_store import load_settings

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from app.tts_server.plugin_loader import LoadedPlugin


# Engine status strings exposed on the API.
STATUS_READY = "ready"
STATUS_NEEDS_SETUP = "needs_setup"
STATUS_UNVERIFIED = "unverified"
STATUS_NOT_LOADED = "not_loaded"
STATUS_INVALID_CONFIG = "invalid_config"


def engine_status(
    plugin: "LoadedPlugin",
    current_settings: dict[str, Any] | None = None,
) -> str:
    """Return the canonical status string for a loaded plugin.

    Args:
        plugin: A loaded plugin (may have failed env check or verification).
        current_settings: Current persisted settings for this engine.

    Returns:
        str: One of ``"ready"``, ``"needs_setup"``, ``"unverified"``, or ``"invalid_config"``.
    """
    if getattr(plugin, "load_error", None):
        return STATUS_INVALID_CONFIG

    try:
        check_env = plugin.engine.check_env
        if _accepts_settings(check_env):
            ok, msg = check_env(settings=current_settings or {})
        else:
            ok, msg = check_env()
    except Exception as exc:
        logger.exception("Plugin %s check_env() crashed", plugin.engine_id)
        plugin.setup_message = "check_env() crashed (see server logs)."
        return STATUS_NEEDS_SETUP

    if not ok:
        plugin.setup_message = str(msg or "Resolve engine setup before enabling this plugin.")
        return STATUS_NEEDS_SETUP

    if not plugin.dependencies_satisfied:
        return STATUS_NEEDS_SETUP

    if not plugin.verified:
        return STATUS_UNVERIFIED

    return STATUS_READY


def _accepts_settings(callable_obj: Any) -> bool:
    """Return True when a plugin method supports a settings keyword."""
    try:
        signature = inspect.signature(callable_obj)
    except (TypeError, ValueError):
        return False

    return any(
        param.kind == inspect.Parameter.VAR_KEYWORD or name == "settings"
        for name, param in signature.parameters.items()
    )


def build_health_response(plugins: "list[LoadedPlugin]") -> dict[str, Any]:
    """Build the ``/health`` endpoint response payload.

    Args:
        plugins: All loaded plugins.

    Returns:
        dict[str, Any]: Health payload ready to be serialised as JSON.
    """
    engine_summaries = []
    for plugin in plugins:
        # Settings-keyed engines (e.g. an API key in engine settings) report
        # needs_setup unless check_env sees the persisted settings.
        try:
            current_settings = load_settings(plugin.plugin_dir)
        except Exception:
            current_settings = {}
        status = engine_status(plugin, current_settings=current_settings)
        engine_summaries.append(
            {
                "engine_id": plugin.engine_id,
                "display_name": plugin.display_name,
                "status": status,
                "verified": plugin.verified,
                # load_error carries controlled diagnostics only (manifest
                # validation messages; crash details require dev.enabled) and
                # the TTS server is a localhost-only subprocess — surfacing it
                # to the local operator is the designed contract.
                "verification_error": plugin.load_error or plugin.verification_error,  # lgtm[py/stack-trace-exposure]
            }
        )

    overall = "ok"
    if any(
        e["status"] in {STATUS_NEEDS_SETUP, STATUS_INVALID_CONFIG}
        for e in engine_summaries
    ):
        overall = "degraded"

    return {
        "status": overall,
        "engines": engine_summaries,
    }


def build_engine_detail(
    plugin: "LoadedPlugin",
    current_settings: dict[str, Any],
) -> dict[str, Any]:
    """Build a single engine detail payload for ``/engines/{id}``.

    Args:
        plugin: The loaded plugin.
        current_settings: Current persisted settings for this engine.

    Returns:
        dict[str, Any]: Engine detail payload ready for JSON serialisation.
    """
    manifest = plugin.manifest
    status = engine_status(plugin, current_settings=current_settings)
    can_enable, enablement_message = can_enable_engine(
        plugin.engine_id,
        current_settings=current_settings,
        built_in=bool(manifest.get("built_in", False)),
        verified=bool(plugin.verified),
        status=status,
        behavior=manifest.get("behavior"),
    )

    info_extra = {}
    schema = {}
    if getattr(plugin, "engine", None) is not None:
        try:
            info_extra = plugin.engine.info()
        except Exception:
            info_extra = {}

        try:
            schema = plugin.engine.settings_schema()
        except Exception:
            schema = {}
    if not schema and getattr(plugin, "settings_schema", None):
        schema = plugin.settings_schema

    enabled = bool(current_settings.get("enabled"))
    setup_message = getattr(plugin, "setup_message", None)
    if status == STATUS_INVALID_CONFIG:
        setup_message = getattr(plugin, "load_error", None) or setup_message
    elif status != STATUS_NEEDS_SETUP:
        setup_message = None

    return {
        **info_extra,
        "engine_id": plugin.engine_id,
        "display_name": plugin.display_name,
        "status": status,
        "verified": plugin.verified,
        "enabled": enabled,
        "version": manifest.get("version", ""),
        "local": manifest.get("local", True),
        "cloud": manifest.get("cloud", False),
        "network": manifest.get("network", False),
        "languages": manifest.get("languages", ["en"]),
        "capabilities": manifest.get("capabilities", ["synthesis"]),
        "behavior": manifest.get("behavior", {}),
        "resource": manifest.get("resource", {}),
        "author": manifest.get("author", ""),
        "homepage": manifest.get("homepage", ""),
        "test_sample": manifest.get("test_sample"),
        "test_text": manifest.get("test_text", "This is a verification test."),
        "can_enable": can_enable,
        "enablement_message": enablement_message or setup_message,
        "setup_message": setup_message,
        "health_message": setup_message,
        "verification_error": getattr(plugin, "load_error", None) or getattr(plugin, "verification_error", None),
        "settings_schema": schema,
        "current_settings": current_settings,
        "dependencies_satisfied": plugin.dependencies_satisfied,
        "missing_dependencies": plugin.missing_dependencies,
        "dev": manifest.get("dev"),
        "logo_url": _resolve_logo_url(plugin),
        "built_in": manifest.get("built_in", False),
    }


def _resolve_logo_url(plugin: "LoadedPlugin") -> str | None:
    manifest = plugin.manifest
    logo_config = manifest.get("logo")
    if not logo_config:
        return None

    # Prefer SVG
    svg_path = logo_config.get("svg")
    if svg_path:
        full_svg = plugin.plugin_dir / svg_path
        if full_svg.is_file():
            return f"/api/engines/{plugin.engine_id}/assets/{svg_path}"

    # Fallback to PNG
    png_path = logo_config.get("png")
    if png_path:
        full_png = plugin.plugin_dir / png_path
        if full_png.is_file():
            return f"/api/engines/{plugin.engine_id}/assets/{png_path}"

    return None
