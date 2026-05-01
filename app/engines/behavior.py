"""Plugin-declared behavior helpers for engine-specific policy.

App code should ask what a plugin declares instead of branching on concrete
engine ids. This module intentionally stays small while Phase 11 moves the
remaining XTTS/Voxtral-specific policy behind plugin metadata.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping


_ENGINE_ID_RE = re.compile(r"^[a-z][a-z0-9_-]{1,63}$")

COMMON_SYNTHESIS_SETTINGS = frozenset(
    {
        "voice_profile_id",
        "voice_asset_id",
        "reference_sample",
        "model",
        "speed",
        "safe_mode",
        "output_format",
    }
)


def normalize_behavior(behavior: Mapping[str, Any] | None) -> dict[str, Any]:
    """Return a predictable behavior mapping from manifest metadata."""
    if not isinstance(behavior, Mapping):
        return {
            "features": [],
            "required_settings": [],
            "setting_aliases": {},
            "synthesis_settings": [],
        }

    features = [
        str(feature).strip()
        for feature in behavior.get("features", [])
        if str(feature).strip()
    ]
    required_settings = _normalize_required_settings(
        behavior.get("required_settings", [])
    )
    raw_aliases = behavior.get("setting_aliases", {})
    aliases = raw_aliases if isinstance(raw_aliases, Mapping) else {}
    setting_aliases = {
        str(source).strip(): str(target).strip()
        for source, target in aliases.items()
        if str(source).strip() and str(target).strip()
    }
    synthesis_settings = [
        str(setting).strip()
        for setting in behavior.get("synthesis_settings", [])
        if str(setting).strip()
    ]

    return {
        "features": features,
        "required_settings": required_settings,
        "setting_aliases": setting_aliases,
        "synthesis_settings": synthesis_settings,
    }


def has_behavior(
    engine_id: str,
    behavior_name: str,
    *,
    behavior: Mapping[str, Any] | None = None,
) -> bool:
    """Return whether an engine declares a behavior feature."""
    normalized = behavior_for_engine(engine_id, behavior=behavior)
    target = str(behavior_name or "").strip()
    return bool(target and target in set(normalized.get("features", [])))


def required_settings_for(
    engine_id: str,
    *,
    behavior: Mapping[str, Any] | None = None,
) -> list[dict[str, str]]:
    """Return required settings declared by the plugin behavior metadata."""
    normalized = behavior_for_engine(engine_id, behavior=behavior)
    return list(normalized.get("required_settings", []))


def setting_aliases_for(
    engine_id: str,
    *,
    behavior: Mapping[str, Any] | None = None,
) -> dict[str, str]:
    """Return legacy/input aliases declared by the plugin behavior metadata."""
    normalized = behavior_for_engine(engine_id, behavior=behavior)
    return dict(normalized.get("setting_aliases", {}))


def extract_engine_settings(
    engine_id: str,
    source: Mapping[str, Any],
    *,
    behavior: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Extract generic synthesis settings plus plugin-declared aliases."""
    normalized = behavior_for_engine(engine_id, behavior=behavior)
    allowed = set(COMMON_SYNTHESIS_SETTINGS)
    allowed.update(str(item) for item in normalized.get("synthesis_settings", []))

    settings: dict[str, Any] = {}
    for key in allowed:
        if key in source:
            settings[key] = source[key]

    aliases = setting_aliases_for(engine_id, behavior=normalized)
    for source_key, target_key in aliases.items():
        if source_key in source and target_key not in settings:
            settings[target_key] = source[source_key]

    return settings


def behavior_for_engine(
    engine_id: str,
    *,
    behavior: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Resolve normalized behavior metadata for an engine."""
    if behavior is not None:
        return normalize_behavior(behavior)
    return _load_manifest_behavior(engine_id)


@lru_cache(maxsize=64)
def _load_manifest_behavior(engine_id: str) -> dict[str, Any]:
    """Load behavior metadata from a local plugin manifest when available."""
    normalized_engine_id = str(engine_id or "").strip().lower()
    if not _ENGINE_ID_RE.match(normalized_engine_id):
        return normalize_behavior(None)

    root = Path(__file__).resolve().parents[2]
    manifest_path = root / "plugins" / f"tts_{normalized_engine_id}" / "manifest.json"
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return normalize_behavior(None)

    return normalize_behavior(payload.get("behavior"))


def is_built_in(engine_id: str) -> bool:
    """Return whether an engine_id corresponds to a built-in Studio engine."""
    return str(engine_id or "").strip().lower() in {"xtts", "voxtral"}


def _normalize_required_settings(raw_items: Any) -> list[dict[str, str]]:
    """Normalize required settings from simple strings or richer dicts."""
    items = raw_items if isinstance(raw_items, list) else []
    normalized: list[dict[str, str]] = []
    for item in items:
        if isinstance(item, Mapping):
            name = str(item.get("name") or "").strip()
            message = str(item.get("message") or "").strip()
        else:
            name = str(item or "").strip()
            message = ""
        if name:
            normalized.append({"name": name, "message": message})
    return normalized
