"""Plugin-declared behavior helpers for engine-specific policy.

App code should ask what a plugin declares instead of branching on concrete
engine ids. This module intentionally stays small while plugin metadata owns
the engine-specific policy.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping


_ENGINE_ID_RE = re.compile(r"^[a-z][a-z0-9_-]{1,63}$")

# Generic text utility defaults (historically in config.py)
DEFAULT_SENT_CHAR_LIMIT = 500
DEFAULT_SAFE_SPLIT_TARGET = 250
DEFAULT_BASELINE_ENGINE_CPS = 16.7

# Engine defaults for manifest fallbacks
DEFAULT_ENGINE_TEXT_CHUNK_LIMIT = 500
DEFAULT_ENGINE_TEXT_SPLIT_TARGET = 450


COMMON_SYNTHESIS_SETTINGS = frozenset(
    {
        "voice_profile_id",
        "voice_profile_dir",
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
            "progress_pattern": None,
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
    text_chunk_limit = behavior.get("text_chunk_limit", DEFAULT_ENGINE_TEXT_CHUNK_LIMIT)
    text_split_target = behavior.get("text_split_target", DEFAULT_ENGINE_TEXT_SPLIT_TARGET)

    progress_pattern = behavior.get("progress_pattern")
    if progress_pattern is not None:
        progress_pattern = str(progress_pattern).strip()

    return {
        "features": features,
        "required_settings": required_settings,
        "setting_aliases": setting_aliases,
        "synthesis_settings": synthesis_settings,
        "text_chunk_limit": text_chunk_limit,
        "text_split_target": text_split_target,
        "progress_pattern": progress_pattern,
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
    """Return setting aliases declared by the plugin behavior metadata."""
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


def get_synthesis_settings_allowlist(engine_id: str) -> set[str]:
    """Get the set of allowed synthesis setting keys for an engine."""
    normalized = behavior_for_engine(engine_id)
    allowed = set(COMMON_SYNTHESIS_SETTINGS)
    allowed.update(str(item) for item in normalized.get("synthesis_settings", []))
    # Also include source keys that have aliases
    aliases = setting_aliases_for(engine_id, behavior=normalized)
    allowed.update(aliases.keys())
    return allowed


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
def _load_full_manifest(engine_id: str) -> dict[str, Any]:
    """Load the full manifest payload for an engine."""
    normalized_engine_id = str(engine_id or "").strip().lower()
    if not _ENGINE_ID_RE.match(normalized_engine_id):
        return {}

    root = Path(__file__).resolve().parents[2]
    manifest_path = root / "plugins" / f"tts_{normalized_engine_id}" / "manifest.json"
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


@lru_cache(maxsize=64)
def _load_manifest_behavior(engine_id: str) -> dict[str, Any]:
    """Load behavior metadata from a local plugin manifest when available."""
    payload = _load_full_manifest(engine_id)
    return normalize_behavior(payload.get("behavior"))


def is_engine_locally_available(engine_id: str) -> bool:
    """Return whether an engine's plugin is locally installed and has a manifest."""
    return bool(_load_full_manifest(engine_id))


def supports_standard_rendering(engine_id: str) -> bool:
    """Return whether an engine supports full-chapter standard rendering."""
    return has_behavior(engine_id, "standard_rendering")


def supports_segment_rendering(engine_id: str) -> bool:
    """Return whether an engine supports individual segment rendering."""
    return has_behavior(engine_id, "segment_rendering")


def supports_bake_rendering(engine_id: str) -> bool:
    """Return whether an engine supports baking segments into a chapter."""
    return has_behavior(engine_id, "bake_rendering")


def supports_mixed_rendering(engine_id: str) -> bool:
    """Return whether an engine can be part of a mixed-voice chapter."""
    return has_behavior(engine_id, "mixed_rendering")


def uses_segment_orchestration(engine_id: str) -> bool:
    """Return whether an engine's standard handler uses segment-based orchestration."""
    return has_behavior(engine_id, "segment_orchestration")





def get_text_chunk_limit(engine_id: str) -> int:
    """Return the character limit for text chunks for a given engine."""
    behavior = behavior_for_engine(engine_id)
    return behavior.get("text_chunk_limit", DEFAULT_ENGINE_TEXT_CHUNK_LIMIT)


def get_text_split_target(engine_id: str) -> int:
    """Return the target character count when splitting long sentences."""
    behavior = behavior_for_engine(engine_id)
    return behavior.get("text_split_target", DEFAULT_ENGINE_TEXT_SPLIT_TARGET)


def get_progress_pattern(engine_id: str) -> str | None:
    """Return the regex pattern for parsing progress from an engine's output."""
    behavior = behavior_for_engine(engine_id)
    return behavior.get("progress_pattern")


def get_test_sample_name(engine_id: str) -> str | None:
    """Return the filename of the manifest-declared test sample for an engine."""
    payload = _load_full_manifest(engine_id)
    return payload.get("test_sample")


def parse_engine_progress(engine_id: str, line: str) -> float | None:
    """Parse a progress value from an engine's output line using its declared pattern."""
    pattern_str = get_progress_pattern(engine_id) or r"\[PROGRESS\]\s+([0-9.]+)"

    try:
        # Use a simple regex check. The pattern should contain a named group 'value'
        # or a single capturing group.
        match = re.search(pattern_str, line)
        if not match:
            return None

        # Try named group 'value' first, then first group
        try:
            val_str = match.group("value")
        except (IndexError, KeyError):
            val_str = match.group(1)

        if not val_str:
            return None

        val = float(val_str.strip())
        # If the line contains a percent sign, treat it as a percentage (0-100).
        # This correctly handles 45% -> 0.45 and 1% -> 0.01.
        if "%" in line:
            return max(0.0, min(val / 100.0, 1.0))
        return max(0.0, min(val, 1.0))
    except (TypeError, ValueError, IndexError, re.error):
        return None


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
