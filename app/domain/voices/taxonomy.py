"""Voice taxonomy validation (Phase A — voice metadata plan).

Loads design-docs/specs/voice-taxonomy.json and design-docs/specs/voice.schema.json to provide:
  - controlled-vocabulary validation for ``attributes`` fields
  - lenient degrading: unknown enum values dropped from ``attributes``, appended to ``tags``
  - ``taxonomy_version`` compatibility check (unknown major version → warning, still loads)
  - ``untagged`` flag when required attribute fields (class/gender/age) are absent
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths (relative to the repo root, resolved at import time)
# ---------------------------------------------------------------------------
_REPO_ROOT = Path(__file__).resolve().parents[3]
_TAXONOMY_PATH = _REPO_ROOT / "design-docs" / "specs" / "voice-taxonomy.json"
_SCHEMA_PATH = _REPO_ROOT / "design-docs" / "specs" / "voice.schema.json"

# Required attribute fields (per voice.schema.json §attributes.required)
REQUIRED_ATTRIBUTES = ("class", "gender", "age")

# Taxonomy version this code was written against
SUPPORTED_TAXONOMY_VERSION = "1.0"


# ---------------------------------------------------------------------------
# Lazy-loaded controlled vocabulary
# ---------------------------------------------------------------------------

def _load_taxonomy() -> dict[str, Any]:
    """Load voice-taxonomy.json once."""
    try:
        with _TAXONOMY_PATH.open(encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:
        logger.warning("Could not load voice taxonomy: %s", exc)
        return {}


def _build_valid_values_map(taxonomy: dict[str, Any]) -> dict[str, set[str]]:
    """Build {field_key: {valid_id, ...}} from taxonomy sections."""
    result: dict[str, set[str]] = {}
    for section in taxonomy.get("sections", []):
        key = section.get("key")
        if key:
            result[key] = {v["id"] for v in section.get("values", [])}
    return result


_TAXONOMY: dict[str, Any] = {}
_VALID_VALUES: dict[str, set[str]] = {}


def _ensure_loaded() -> None:
    global _TAXONOMY, _VALID_VALUES
    if not _TAXONOMY:
        _TAXONOMY = _load_taxonomy()
        _VALID_VALUES = _build_valid_values_map(_TAXONOMY)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def check_taxonomy_version(taxonomy_version: str | None) -> bool:
    """Return True if taxonomy_version is compatible with the supported version.

    Unknown major versions (> 1.x) log a warning; the call still returns True
    so the voice loads.  Missing taxonomy_version is silently accepted.
    """
    if not taxonomy_version:
        return True
    try:
        major = int(taxonomy_version.split(".")[0])
        supported_major = int(SUPPORTED_TAXONOMY_VERSION.split(".")[0])
        if major > supported_major:
            logger.warning(
                "Voice declares taxonomy_version %s, which is newer than supported %s. "
                "New attribute keys will be treated as free tags.",
                taxonomy_version,
                SUPPORTED_TAXONOMY_VERSION,
            )
    except Exception:
        logger.warning("Could not parse taxonomy_version %r", taxonomy_version)
    return True


def validate_and_degrade_attributes(
    attributes: dict[str, Any] | None,
    existing_tags: list[str],
) -> tuple[dict[str, Any] | None, list[str], bool]:
    """Validate ``attributes`` against the controlled vocabulary.

    Returns:
        (cleaned_attributes, updated_tags, is_untagged)

    - ``cleaned_attributes``: attributes dict with invalid enum values removed.
      None if the input was None/empty (voice is untagged per D7).
    - ``updated_tags``: original tags extended with any values demoted from attributes.
    - ``is_untagged``: True when required fields (class/gender/age) are absent.

    Unknown enum values for scalar one-fields are dropped and moved to tags.
    Unknown values in array many-fields are individually dropped and moved to tags.
    """
    _ensure_loaded()
    tags = list(existing_tags)

    if not attributes:
        # D7: missing attributes → untagged; do not write any placeholder
        return None, tags, True

    cleaned: dict[str, Any] = {}
    demoted: list[str] = []

    for field, value in attributes.items():
        valid_set = _VALID_VALUES.get(field)
        if valid_set is None:
            # Field not in taxonomy — treat entire value as a free tag if string
            logger.warning("Unknown attribute field %r; dropping from attributes", field)
            if isinstance(value, str):
                demoted.append(value)
            elif isinstance(value, list):
                demoted.extend(str(v) for v in value)
            continue

        if isinstance(value, list):
            # many-optional field
            valid_items = []
            for item in value:
                if item in valid_set:
                    valid_items.append(item)
                else:
                    logger.warning(
                        "Unknown taxonomy value %r for attribute %r; moving to free tags",
                        item, field,
                    )
                    demoted.append(str(item))
            cleaned[field] = valid_items
        else:
            # one-required or one-optional scalar
            if value in valid_set:
                cleaned[field] = value
            else:
                logger.warning(
                    "Unknown taxonomy value %r for attribute %r; moving to free tags",
                    value, field,
                )
                demoted.append(str(value))

    # Append demoted values to tags (deduplicated, tag pattern: lowercase-hyphenated)
    existing_set = set(tags)
    tag_pattern_chars = set("abcdefghijklmnopqrstuvwxyz0123456789-")
    for v in demoted:
        slug = v.lower().replace("_", "-").replace(" ", "-")
        slug = "".join(c for c in slug if c in tag_pattern_chars)
        if slug and slug not in existing_set:
            tags.append(slug)
            existing_set.add(slug)

    # Determine untagged: required fields must all be present and valid
    required_present = all(field in cleaned for field in REQUIRED_ATTRIBUTES)
    is_untagged = not required_present

    return cleaned if cleaned else None, tags, is_untagged


def get_valid_values(field: str) -> list[str] | None:
    """Return the sorted list of valid values for a taxonomy field, or None if unknown."""
    _ensure_loaded()
    vs = _VALID_VALUES.get(field)
    return sorted(vs) if vs is not None else None


def validate_attributes_strict(attributes: dict[str, Any]) -> list[str]:
    """Strict validation used on the PATCH /metadata write path.

    Returns a list of error strings (empty = valid).  Unknown values are
    rejected rather than demoted — callers get 422 on any error.
    """
    _ensure_loaded()
    errors: list[str] = []

    for field, value in attributes.items():
        valid_set = _VALID_VALUES.get(field)
        if valid_set is None:
            errors.append(f"Unknown attribute field: {field!r}")
            continue

        valid_sorted = sorted(valid_set)
        if isinstance(value, list):
            for item in value:
                if item not in valid_set:
                    errors.append(
                        f"Invalid value {item!r} for attribute {field!r}. "
                        f"Valid values: {valid_sorted}"
                    )
        else:
            if value not in valid_set:
                errors.append(
                    f"Invalid value {value!r} for attribute {field!r}. "
                    f"Valid values: {valid_sorted}"
                )

    return errors
