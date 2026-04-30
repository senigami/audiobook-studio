"""Per-engine settings persistence for the TTS Server.

Each plugin stores its user-editable settings in ``plugins/tts_<name>/settings.json``.
The TTS Server reads settings on startup and writes them when Studio sends a
``PUT /engines/{id}/settings`` request.

Settings are validated against the engine's ``settings_schema.json`` before
being written.  Invalid settings are rejected with a clear error message.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def load_settings(plugin_dir: Path) -> dict[str, Any]:
    """Load persisted settings for a plugin.

    Args:
        plugin_dir: The plugin's folder path (e.g. ``plugins/tts_xtts/``).

    Returns:
        dict[str, Any]: Settings dict, or empty dict if the file does not exist
        or cannot be parsed.
    """
    settings_path = plugin_dir / "settings.json"
    if not settings_path.is_file():
        return {}

    try:
        return json.loads(settings_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning(
            "Could not read settings.json from %s: %s", plugin_dir.name, exc
        )
        return {}


def save_settings(plugin_dir: Path, settings: dict[str, Any]) -> None:
    """Persist updated settings for a plugin.

    Args:
        plugin_dir: The plugin's folder path.
        settings: Updated settings dict to persist.

    Raises:
        OSError: If the file cannot be written.
    """
    settings_path = plugin_dir / "settings.json"
    settings_path.write_text(
        json.dumps(settings, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    logger.debug("Saved settings to %s", settings_path)


def load_state(plugin_dir: Path) -> dict[str, Any]:
    """Load persisted verification state for a plugin.

    Args:
        plugin_dir: The plugin's folder path.

    Returns:
        dict[str, Any]: State dict, or empty dict if not found.
    """
    state_path = plugin_dir / "state.json"
    if not state_path.is_file():
        return {}

    try:
        return json.loads(state_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_state(plugin_dir: Path, state: dict[str, Any]) -> None:
    """Persist verification state for a plugin.

    Args:
        plugin_dir: The plugin's folder path.
        state: State dict to persist.
    """
    state_path = plugin_dir / "state.json"
    plugin_dir.mkdir(parents=True, exist_ok=True)
    state_path.write_text(
        json.dumps(state, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def calculate_verification_metadata(plugin_dir: Path, manifest: dict[str, Any]) -> dict[str, str]:
    """Calculate hashes for plugin version, requirements, and settings.

    Used to invalidate verification when the plugin changes.
    """
    engine_id = manifest.get("engine_id")
    metadata = {
        "plugin_version": str(manifest.get("version", "0.0.0")),
    }

    # Hash requirements.txt
    req_file = plugin_dir / "requirements.txt"
    if not req_file.is_file() and engine_id == "xtts":
        # Fallback for bundled XTTS requirements
        from app.config import BASE_DIR # noqa: PLC0415
        req_file = BASE_DIR / "app/engines/voice/xtts/requirements.txt"

    if req_file.is_file():
        metadata["requirements_hash"] = hashlib.sha256(req_file.read_bytes()).hexdigest()
    else:
        metadata["requirements_hash"] = "none"

    # Hash settings.json
    settings_file = plugin_dir / "settings.json"
    if settings_file.is_file():
        metadata["settings_hash"] = hashlib.sha256(settings_file.read_bytes()).hexdigest()
    else:
        metadata["settings_hash"] = "none"

    return metadata


def merge_settings(
    base: dict[str, Any],
    updates: dict[str, Any],
    schema: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    """Merge a settings update dict with current settings, validated by schema.

    Unknown keys (not in the schema) are rejected.  Type coercion is not
    applied — values must match the schema type.

    Args:
        base: Current settings dict.
        updates: Partial or full settings update.
        schema: JSON Schema dict from the engine's ``settings_schema()``.

    Returns:
        tuple[dict[str, Any], list[str]]: ``(merged, errors)`` where errors is
        a list of validation messages.  When errors is non-empty, caller should
        reject the update.
    """
    properties: dict[str, Any] = schema.get("properties", {})
    errors: list[str] = []
    merged = dict(base)

    for key, value in updates.items():
        if properties and key not in properties:
            errors.append(f"Unknown setting key: {key!r}")
            continue

        prop = properties.get(key, {})
        expected_type = prop.get("type")
        if expected_type:
            type_ok = _check_type(value, expected_type)
            if not type_ok:
                errors.append(
                    f"Setting {key!r} expects type {expected_type!r}, "
                    f"got {type(value).__name__!r}"
                )
                continue

        # Range checks for numbers.
        if isinstance(value, (int, float)) and expected_type in ("number", "integer"):
            minimum = prop.get("minimum")
            maximum = prop.get("maximum")
            if minimum is not None and value < minimum:
                errors.append(
                    f"Setting {key!r} value {value} is below minimum {minimum}"
                )
                continue
            if maximum is not None and value > maximum:
                errors.append(
                    f"Setting {key!r} value {value} is above maximum {maximum}"
                )
                continue

        # Enum check.
        enum_values = prop.get("enum")
        if enum_values is not None and value not in enum_values:
            errors.append(
                f"Setting {key!r} value {value!r} is not one of {enum_values}"
            )
            continue

        merged[key] = value

    return merged, errors


def _check_type(value: Any, expected: str) -> bool:
    """Return True when ``value`` matches the JSON Schema ``expected`` type."""
    mapping = {
        "string": str,
        "number": (int, float),
        "integer": int,
        "boolean": bool,
        "array": list,
        "object": dict,
    }
    expected_types = mapping.get(expected)
    if expected_types is None:
        return True  # Unknown type — be permissive.
    # Boolean must be checked before int because bool is a subclass of int.
    if expected == "integer" and isinstance(value, bool):
        return False
    if expected == "number" and isinstance(value, bool):
        return False
    return isinstance(value, expected_types)
