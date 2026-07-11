"""Per-engine settings persistence for the TTS Server.

Each plugin stores its user-editable settings in
``plugin_data/<engine_id>/settings.json``.  The TTS Server reads settings on
startup and writes them when Studio sends a ``PUT /engines/{id}/settings``
request.

Settings are validated against the engine's ``settings_schema.json`` before
being written.  Invalid settings are rejected with a clear error message.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_ENGINE_ID_RE = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")


def _contained_path(base: "Path | str", *parts: str) -> Path:
    """Private copy of the containment helper for the tts_server layer.

    Uses normpath+startswith — the form recognized by static analyzers as a
    path-injection barrier.
    """
    base_norm = os.path.normpath(str(base))
    candidate = os.path.normpath(os.path.join(base_norm, *parts))
    if candidate != base_norm and not candidate.startswith(base_norm + os.sep):
        raise ValueError("path escapes containment root")
    return Path(candidate)


def validate_engine_id(engine_id: str) -> None:
    """Raise ValueError if *engine_id* is not a safe, well-formed identifier.

    Valid engine ids match ``^[a-z][a-z0-9_-]{0,63}$``.  This blocks path
    traversal strings such as ``../x``, ``a/b``, or ``..`` before they reach
    the filesystem.
    """
    if not _ENGINE_ID_RE.match(engine_id):
        raise ValueError(
            f"Invalid engine_id {engine_id!r}: must match ^[a-z][a-z0-9_-]{{0,63}}$"
        )


def _engine_id_from_plugin_dir(plugin_dir: Path) -> str:
    folder_name = plugin_dir.name
    if folder_name.startswith("tts_") and len(folder_name) > 4:
        return folder_name[4:]
    if folder_name.startswith("pip:") and len(folder_name) > 4:
        return folder_name[4:]
    return folder_name


def _runtime_dir(plugin_dir: Path) -> Path:
    from app.core.config import PLUGIN_DATA_DIR  # noqa: PLC0415

    return PLUGIN_DATA_DIR / _engine_id_from_plugin_dir(plugin_dir)


def _runtime_file(plugin_dir: Path, filename: str) -> Path:
    from app.core.config import PLUGIN_DATA_DIR  # noqa: PLC0415

    engine_id = _engine_id_from_plugin_dir(plugin_dir)
    return _contained_path(PLUGIN_DATA_DIR, engine_id, filename)


def load_settings(plugin_dir: Path) -> dict[str, Any]:
    """Load persisted settings for a plugin.

    Args:
        plugin_dir: The plugin's folder path (e.g. ``plugins/tts_example/``).

    Returns:
        dict[str, Any]: Settings dict, or empty dict if the file does not exist
        or cannot be parsed.
    """
    settings_path = _runtime_file(plugin_dir, "settings.json")
    if not settings_path.is_file():
        return {}

    try:
        return json.loads(settings_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning(
            "Could not read settings.json for %s: %s", plugin_dir.name, exc
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
    settings_path = _runtime_file(plugin_dir, "settings.json")
    settings_path.parent.mkdir(parents=True, exist_ok=True)
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
    state_path = _runtime_file(plugin_dir, "state.json")
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
    state_path = _runtime_file(plugin_dir, "state.json")
    state_path.parent.mkdir(parents=True, exist_ok=True)
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

    if req_file.is_file():
        metadata["requirements_hash"] = hashlib.sha256(req_file.read_bytes()).hexdigest()
    else:
        metadata["requirements_hash"] = "none"

    # Hash settings.json, but ignore computed read-only values so resets do not
    # force a re-verify.
    settings_file = _runtime_file(plugin_dir, "settings.json")
    if settings_file.is_file():
        settings = load_settings(plugin_dir)
        schema = _load_settings_schema(plugin_dir)
        normalized = _strip_read_only_settings(settings, schema)
        settings_blob = json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        metadata["settings_hash"] = hashlib.sha256(settings_blob.encode("utf-8")).hexdigest()
    else:
        metadata["settings_hash"] = "none"

    return metadata


def _load_settings_schema(plugin_dir: Path) -> dict[str, Any]:
    schema_path = plugin_dir / "settings_schema.json"
    if not schema_path.is_file():
        return {}
    try:
        return json.loads(schema_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _strip_read_only_settings(settings: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
    if not isinstance(properties, dict) or not properties:
        return dict(settings)

    read_only_keys = {
        key
        for key, prop in properties.items()
        if isinstance(prop, dict) and prop.get("readOnly")
    }
    return {key: value for key, value in settings.items() if key not in read_only_keys}


# Sentinel value returned/expected for secret fields — mirrors the S1 pattern
# used by _redact_settings() in app/api/routers/system.py.
_SECRET_SENTINEL = "***"


def secret_keys(schema: dict[str, Any]) -> set[str]:
    """Return the set of setting keys marked ``"secret": true`` in *schema*.

    Args:
        schema: JSON Schema dict from the engine's ``settings_schema.json``.

    Returns:
        set[str]: Keys whose property object carries ``"secret": true``.
    """
    properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
    if not isinstance(properties, dict):
        return set()
    return {
        key
        for key, prop in properties.items()
        if isinstance(prop, dict) and prop.get("secret") is True
    }


def redact_secret_settings(settings: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of *settings* with all schema-declared secret fields redacted.

    A secret field that holds a truthy value is replaced with ``"***"``.
    A secret field that is falsy (empty string, None, etc.) is replaced with ``""``.
    Non-secret fields are returned unchanged.

    This mirrors ``_redact_settings()`` in ``app/api/routers/system.py`` (the S1
    precedent) but is driven by the plugin's ``settings_schema.json`` rather than
    a hard-coded set.

    NOTE: If a settings dict is ever logged at the save/merge path, this function
    MUST be called on it first so secrets are not written to log files.

    Args:
        settings: Current settings dict for an engine.
        schema: JSON Schema dict (from ``_load_settings_schema`` or
            ``engine.settings_schema()``).

    Returns:
        dict[str, Any]: Copy of *settings* with secret values masked.
    """
    keys = secret_keys(schema)
    if not keys:
        return dict(settings)
    out = dict(settings)
    for key in keys:
        if key in out:
            out[key] = _SECRET_SENTINEL if out[key] else ""
    return out


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

    # Pre-compute secret keys once so the loop is O(1) per key.
    _secret_keys = secret_keys(schema)

    for key, value in updates.items():
        if properties and key not in properties:
            errors.append(f"Unknown setting key: {key!r}")
            continue

        prop = properties.get(key, {})
        if prop.get("readOnly"):
            continue

        # Secret-field sentinel guard: when a client round-trips the masked
        # value ("***") back to us, silently drop it so the real stored
        # secret is never overwritten by the placeholder.
        # NOTE: if logging is ever added here, use redact_secret_settings()
        # on the merged dict before writing to logs — never log raw secrets.
        if key in _secret_keys and value == _SECRET_SENTINEL:
            continue

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
