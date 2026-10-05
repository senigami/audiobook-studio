"""Plugin-local render performance calibration settings."""

from __future__ import annotations

import logging
from typing import Any

from ..engines.behavior import DEFAULT_BASELINE_ENGINE_CPS
from app.tts_server.settings_store import load_settings, save_settings, validate_engine_id, _contained_path

logger = logging.getLogger(__name__)

COMPUTER_SPEED_MULTIPLIER_KEY = "computer_speed_multiplier"


def computer_speed_multiplier_from_cps(cps: float) -> float:
    """Convert measured characters-per-second into a user-facing speed multiplier."""
    try:
        measured_cps = float(cps)
    except (TypeError, ValueError):
        measured_cps = DEFAULT_BASELINE_ENGINE_CPS

    multiplier = max(0.01, measured_cps / max(0.01, DEFAULT_BASELINE_ENGINE_CPS))
    return round(multiplier, 2)


def save_engine_computer_speed_multiplier(engine_id: str, cps: float) -> None:
    """Persist computed render speed to the owning plugin's settings.json.

    The active plugin directory must already exist. Unknown or synthetic
    engines, such as non-TTS orchestration helpers, are ignored.
    """
    validate_engine_id(engine_id)
    from app.tts_server.plugin_loader import get_plugin_dir  # noqa: PLC0415

    plugin_dir = get_plugin_dir(engine_id)
    if not plugin_dir.is_dir():
        logger.debug("Skipping speed calibration for missing plugin directory: %s", plugin_dir)
        return

    settings: dict[str, Any] = load_settings(plugin_dir)
    settings[COMPUTER_SPEED_MULTIPLIER_KEY] = computer_speed_multiplier_from_cps(cps)
    save_settings(plugin_dir, settings)


def clear_engine_computer_speed_multiplier(engine_id: str) -> None:
    """Remove the persisted render speed calibration from plugin settings."""
    validate_engine_id(engine_id)
    from app.tts_server.plugin_loader import get_plugin_dir  # noqa: PLC0415

    plugin_dir = get_plugin_dir(engine_id)
    if not plugin_dir.is_dir():  # lgtm[py/path-injection]
        logger.debug("Skipping speed calibration reset for missing plugin directory: %s", plugin_dir)
        return

    settings: dict[str, Any] = load_settings(plugin_dir)
    if COMPUTER_SPEED_MULTIPLIER_KEY in settings:
        settings.pop(COMPUTER_SPEED_MULTIPLIER_KEY, None)
        save_settings(plugin_dir, settings)


def clear_engine_computer_speed_baseline(engine_id: str) -> dict[str, Any]:
    """Clear all persisted calibration data so the next render starts from baseline."""
    validate_engine_id(engine_id)
    clear_engine_computer_speed_multiplier(engine_id)

    samples_deleted = 0
    cache_cleared = False

    try:
        from app.db.performance import delete_render_samples_for_engine

        samples_deleted = delete_render_samples_for_engine(engine_id)
    except Exception:
        logger.debug("Failed to clear render samples for %s", engine_id, exc_info=True)

    try:
        from app.db.state_performance import clear_engine_cps_cache

        cache_cleared = clear_engine_cps_cache(engine_id)
    except Exception:
        logger.debug("Failed to clear cached CPS for %s", engine_id, exc_info=True)

    return {
        "engine_id": engine_id,
        "samples_deleted": samples_deleted,
        "cache_cleared": cache_cleared,
        "value": None,
    }


def get_engine_computer_speed_multiplier(engine_id: str) -> float:
    """Read the plugin-local render speed multiplier, defaulting to neutral speed."""
    validate_engine_id(engine_id)
    from app.tts_server.plugin_loader import get_plugin_dir  # noqa: PLC0415

    plugin_dir = get_plugin_dir(engine_id)
    if not plugin_dir.is_dir():
        return 1.0

    settings = load_settings(plugin_dir)
    try:
        multiplier = float(settings.get(COMPUTER_SPEED_MULTIPLIER_KEY, 1.0))
    except (TypeError, ValueError):
        return 1.0

    return max(0.01, multiplier)


def resolve_engine_settings_model(engine_id: str) -> str | None:
    """Return the plugin's configured model identifier when it has one."""
    validate_engine_id(engine_id)
    from app.tts_server.plugin_loader import get_plugin_dir  # noqa: PLC0415

    plugin_dir = get_plugin_dir(engine_id)
    if not plugin_dir.is_dir():  # lgtm[py/path-injection]
        return None

    settings = load_settings(plugin_dir)
    val = settings.get("model")
    if val is not None:
        return normalize_tts_model(val)

    # Fall back to settings_schema.json default
    try:
        schema_path = _contained_path(plugin_dir, "settings_schema.json")  # lgtm[py/path-injection]
    except ValueError:
        return None
    if schema_path.is_file():
        try:
            import json
            schema = json.loads(schema_path.read_text(encoding="utf-8"))  # lgtm[py/path-injection]
            default_val = schema.get("properties", {}).get("model", {}).get("default")
            if default_val is not None:
                return normalize_tts_model(default_val)
        except Exception:
            pass
    return None


def normalize_tts_model(tts_model: Any) -> str | None:
    if tts_model is None:
        return None
    normalized = str(tts_model).strip()
    return normalized or None


def filter_history_for_engine_model(
    history: list[dict[str, Any]],
    engine_id: str,
    tts_model: str | None,
) -> list[dict[str, Any]]:
    """Select history for the same engine and, when known, the same TTS model."""
    validate_engine_id(engine_id)
    engine_history = [sample for sample in history if sample.get("engine") == engine_id]

    # Resolve default model from settings schema to handle missing/historical model fields
    default_model = None
    from app.tts_server.plugin_loader import get_plugin_dir  # noqa: PLC0415
    try:
        plugin_dir = get_plugin_dir(engine_id)
        if plugin_dir.is_dir():  # lgtm[py/path-injection]
            schema_path = _contained_path(plugin_dir, "settings_schema.json")  # lgtm[py/path-injection]
            if schema_path.is_file():
                import json
                schema = json.loads(schema_path.read_text(encoding="utf-8"))  # lgtm[py/path-injection]
                default_model = schema.get("properties", {}).get("model", {}).get("default")
    except Exception:
        pass

    normalized_target = normalize_tts_model(tts_model)
    normalized_default = normalize_tts_model(default_model)

    res = []
    for sample in engine_history:
        sample_model = normalize_tts_model(sample.get("tts_model"))
        if sample_model == normalized_target:
            res.append(sample)
        elif normalized_target and normalized_target == normalized_default and sample_model is None:
            res.append(sample)
        elif normalized_target is None and sample_model == normalized_default:
            res.append(sample)

    return res
