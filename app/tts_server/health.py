"""Health aggregation for the TTS Server.

Builds the ``/health`` response by querying each loaded engine and
summarising the overall server status.
"""

from __future__ import annotations

import inspect
import logging
from pathlib import Path
from typing import Any, TYPE_CHECKING

from app.engines.enablement import can_enable_engine
from app.tts_server.settings_store import load_settings, redact_secret_settings, _load_settings_schema

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
        ok, msg = call_check_env(
            plugin.engine,
            getattr(plugin, "plugin_dir", None),
            settings=current_settings,
        )
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


def call_check_env(
    engine: Any,
    plugin_dir: Path | None,
    *,
    settings: dict[str, Any] | None = None,
) -> tuple[bool, Any]:
    """Call ``engine.check_env``, passing persisted settings when the engine accepts them.

    This is the single entry point for environment checks: it owns signature
    inspection and best-effort settings loading, so a settings-keyed engine
    (e.g. an API key stored in engine settings) is never checked "bare".

    Args:
        engine: Plugin engine instance exposing ``check_env``.
        plugin_dir: Plugin folder used to load persisted settings when no
            explicit ``settings`` override is supplied. May be ``None``.
        settings: Already-merged settings to pass instead of loading from disk.

    Returns:
        tuple[bool, Any]: The ``(ok, message)`` pair from ``check_env``.
    """
    check_env = engine.check_env
    if not _accepts_settings(check_env):
        return check_env()

    if settings is None:
        settings = {}
        if plugin_dir is not None:
            try:
                settings = load_settings(plugin_dir)
            except Exception:
                settings = {}
    return check_env(settings=settings)


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

    # Inject sanitize_overrides into the schema for engines that declare
    # sanitize_categories.  This is the single injection chokepoint — plugin
    # settings_schema.json files are NOT hand-edited.
    schema = _inject_sanitize_overrides_schema(schema, manifest)

    enabled = bool(current_settings.get("enabled"))
    setup_message = getattr(plugin, "setup_message", None)
    if status == STATUS_INVALID_CONFIG:
        setup_message = getattr(plugin, "load_error", None) or setup_message
    elif status != STATUS_NEEDS_SETUP:
        setup_message = None

    # Redact secret fields before embedding settings in the client-bound payload.
    # Load the schema from disk (the authoritative source for secret declarations)
    # rather than the injected schema above, which may have been augmented with
    # sanitize_overrides and should not affect secret detection.
    _fs_schema = _load_settings_schema(plugin.plugin_dir) if getattr(plugin, "plugin_dir", None) else {}
    redacted_settings = redact_secret_settings(current_settings, _fs_schema)

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
        "current_settings": redacted_settings,
        "dependencies_satisfied": plugin.dependencies_satisfied,
        "missing_dependencies": plugin.missing_dependencies,
        "dev": manifest.get("dev"),
        "logo_url": _resolve_logo_url(plugin),
        "built_in": manifest.get("built_in", False),
    }


_SANITIZE_CATEGORY_DESCRIPTIONS: dict[str, str] = {
    "quotes": "Convert curly/smart quotes to straight quotes and strip double quotes.",
    "acronyms": "Collapse dotted acronyms (e.g. A.B.C. -> A B C) to prevent TTS mis-pronunciation.",
    "fractions": "Expand digit fractions (e.g. 3/4 -> 3 out of 4).",
    "dashes": "Replace em-dashes with commas and ellipses with periods.",
    "punct_spacing": "Fix punctuation spacing artifacts and collapse duplicate punctuation.",
    "ascii": "Strip non-ASCII characters that can cause TTS hallucinations.",
    "terminal": "Ensure text ends with terminal punctuation.",
}

_SANITIZE_CATEGORY_TITLES: dict[str, str] = {
    "quotes": "Normalize Quotes",
    "acronyms": "Expand Acronyms",
    "fractions": "Expand Fractions",
    "dashes": "Normalize Dashes & Ellipses",
    "punct_spacing": "Fix Punctuation Spacing",
    "ascii": "Strip Non-ASCII Characters",
    "terminal": "Ensure Terminal Punctuation",
}


def _inject_sanitize_overrides_schema(schema: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of *schema* with a ``sanitize_overrides`` object property injected.

    The injection only happens when the engine's manifest declares
    ``behavior.sanitize_categories``.  Each declared category becomes a boolean
    sub-property (default ``true``).  The schema is never mutated in place.

    Non-declaring engines are returned unchanged.
    """
    behavior = manifest.get("behavior") or {}
    declared = behavior.get("sanitize_categories")
    if not declared or not isinstance(declared, list):
        return schema

    sub_props: dict[str, Any] = {}
    for cat in declared:
        cat_str = str(cat)
        sub_props[cat_str] = {
            "type": "boolean",
            "title": _SANITIZE_CATEGORY_TITLES.get(cat_str, cat_str.replace("_", " ").title()),
            "description": _SANITIZE_CATEGORY_DESCRIPTIONS.get(cat_str, ""),
            "default": True,
        }

    overrides_prop: dict[str, Any] = {
        "type": "object",
        "title": "Text Sanitization Overrides",
        "description": (
            "Enable or disable individual text sanitization categories for this engine. "
            "Disabled categories are skipped; all categories are enabled by default."
        ),
        "properties": sub_props,
        "default": {},
    }

    # Deep-copy schema to avoid mutating the original.
    import copy
    schema_copy = copy.deepcopy(schema) if schema else {}
    if not isinstance(schema_copy.get("properties"), dict):
        schema_copy["properties"] = {}
    schema_copy["properties"]["sanitize_overrides"] = overrides_prop
    return schema_copy


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
