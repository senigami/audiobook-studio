"""Health aggregation for the TTS Server.

Builds the ``/health`` response by querying each loaded engine and
summarising the overall server status.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

from app.engines.enablement import can_enable_engine

if TYPE_CHECKING:
    from app.tts_server.plugin_loader import LoadedPlugin


# Engine status strings exposed on the API.
STATUS_READY = "ready"
STATUS_NEEDS_SETUP = "needs_setup"
STATUS_UNVERIFIED = "unverified"
STATUS_NOT_LOADED = "not_loaded"


def engine_status(plugin: "LoadedPlugin") -> str:
    """Return the canonical status string for a loaded plugin.

    Args:
        plugin: A loaded plugin (may have failed env check or verification).

    Returns:
        str: One of ``"ready"``, ``"needs_setup"``, or ``"unverified"``.
    """
    try:
        ok, _msg = plugin.engine.check_env()
    except Exception:
        return STATUS_NEEDS_SETUP

    if not ok:
        return STATUS_NEEDS_SETUP

    if not plugin.dependencies_satisfied:
        return STATUS_NEEDS_SETUP

    if not plugin.verified:
        return STATUS_UNVERIFIED

    return STATUS_READY


def build_health_response(plugins: "list[LoadedPlugin]") -> dict[str, Any]:
    """Build the ``/health`` endpoint response payload.

    Args:
        plugins: All loaded plugins.

    Returns:
        dict[str, Any]: Health payload ready to be serialised as JSON.
    """
    engine_summaries = []
    for plugin in plugins:
        status = engine_status(plugin)
        engine_summaries.append(
            {
                "engine_id": plugin.engine_id,
                "display_name": plugin.display_name,
                "status": status,
                "verified": plugin.verified,
                "verification_error": plugin.verification_error,
            }
        )

    overall = "ok"
    if any(e["status"] == STATUS_NEEDS_SETUP for e in engine_summaries):
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
    status = engine_status(plugin)
    can_enable, enablement_message = can_enable_engine(
        plugin.engine_id,
        current_settings=current_settings,
        built_in=bool(manifest.get("built_in", False)),
        verified=bool(plugin.verified),
        status=status,
    )

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

    return {
        "engine_id": plugin.engine_id,
        "display_name": plugin.display_name,
        "status": status,
        "verified": plugin.verified,
        "version": manifest.get("version", ""),
        "local": manifest.get("local", True),
        "cloud": manifest.get("cloud", False),
        "network": manifest.get("network", False),
        "languages": manifest.get("languages", ["en"]),
        "capabilities": manifest.get("capabilities", ["synthesis"]),
        "resource": manifest.get("resource", {}),
        "author": manifest.get("author", ""),
        "homepage": manifest.get("homepage", ""),
        "can_enable": can_enable,
        "enablement_message": enablement_message or getattr(plugin, "setup_message", None),
        "setup_message": getattr(plugin, "setup_message", None),
        "health_message": getattr(plugin, "setup_message", None),
        "settings_schema": schema,
        "current_settings": current_settings,
        "dependencies_satisfied": plugin.dependencies_satisfied,
        "missing_dependencies": plugin.missing_dependencies,
        **info_extra,
    }
