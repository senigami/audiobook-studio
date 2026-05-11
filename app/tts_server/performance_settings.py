"""Plugin-local render performance calibration settings."""

from __future__ import annotations

import logging
from typing import Any

from app.config import BASELINE_ENGINE_CPS
from app.tts_server.settings_store import load_settings, save_settings

logger = logging.getLogger(__name__)

COMPUTER_SPEED_MULTIPLIER_KEY = "computer_speed_multiplier"


def computer_speed_multiplier_from_cps(cps: float) -> float:
    """Convert measured characters-per-second into a user-facing speed multiplier."""
    try:
        measured_cps = float(cps)
    except (TypeError, ValueError):
        measured_cps = BASELINE_ENGINE_CPS

    multiplier = max(0.01, measured_cps / max(0.01, BASELINE_ENGINE_CPS))
    return round(multiplier, 2)


def save_engine_computer_speed_multiplier(engine_id: str, cps: float) -> None:
    """Persist computed render speed to the owning plugin's settings.json.

    The active plugin directory must already exist. Unknown or synthetic
    engines, such as non-TTS orchestration helpers, are ignored.
    """
    from app.tts_server.plugin_loader import get_plugin_dir  # noqa: PLC0415

    plugin_dir = get_plugin_dir(engine_id)
    if not plugin_dir.is_dir():
        logger.debug("Skipping speed calibration for missing plugin directory: %s", plugin_dir)
        return

    settings: dict[str, Any] = load_settings(plugin_dir)
    settings[COMPUTER_SPEED_MULTIPLIER_KEY] = computer_speed_multiplier_from_cps(cps)
    save_settings(plugin_dir, settings)


def get_engine_computer_speed_multiplier(engine_id: str) -> float:
    """Read the plugin-local render speed multiplier, defaulting to neutral speed."""
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
    from app.tts_server.plugin_loader import get_plugin_dir  # noqa: PLC0415

    plugin_dir = get_plugin_dir(engine_id)
    if not plugin_dir.is_dir():
        return None

    settings = load_settings(plugin_dir)
    return normalize_tts_model(settings.get("model"))


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
    engine_history = [sample for sample in history if sample.get("engine") == engine_id]
    if not tts_model:
        return [sample for sample in engine_history if not sample.get("tts_model")]
    return [sample for sample in engine_history if sample.get("tts_model") == tts_model]
