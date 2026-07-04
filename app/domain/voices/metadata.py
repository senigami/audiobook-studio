"""Voice metadata domain service (Phase C — voice metadata plan).

Provides:
  - ``list_voices_with_metadata``  — enumerate all voice roots and return their full metadata
  - ``get_voice_metadata``         — load one voice by id
  - ``find_voice_dir_by_id``       — locate a voice root from its ``voice.json`` ``id`` field
  - ``update_voice_metadata``      — strict-validated PATCH of description/image/attributes/tags
  - ``search_voices``              — filter by free text + attribute facets
  - ``cast_voices``                — casting recommendation scoring
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_TAG_SAFE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _voice_root_dirs(voices_dir: Path) -> list[Path]:
    """Return all top-level voice root directories (those that contain voice.json)."""
    if not voices_dir.exists():
        return []
    result = []
    from ...utils.pathing import find_secure_file
    for entry in sorted(voices_dir.iterdir(), key=lambda e: e.name):
        if entry.is_dir() and find_secure_file(entry, "voice.json"):
            result.append(entry)
    return result


def _manifest_for(voice_dir: Path) -> dict[str, Any]:
    """Load and leniently validate voice.json for a voice root."""
    from .manifest import load_and_validate_voice_manifest
    manifest, _ = load_and_validate_voice_manifest(voice_dir)
    return manifest


def _voice_id(manifest: dict[str, Any], voice_dir: Path) -> str:
    """Return the voice id: prefer manifest['id'], fall back to dir name slug."""
    vid = manifest.get("id")
    if vid:
        return str(vid)
    return voice_dir.name.lower().replace(" ", "-").replace("_", "-")


def _sanitize_tags(tags: list[Any]) -> list[str]:
    """Lowercase-hyphenate and deduplicate free tags; skip malformed values."""
    seen: set[str] = set()
    result: list[str] = []
    tag_chars = set("abcdefghijklmnopqrstuvwxyz0123456789-")
    for t in tags:
        slug = str(t).lower().replace("_", "-").replace(" ", "-")
        slug = "".join(c for c in slug if c in tag_chars)
        if slug and slug not in seen:
            seen.add(slug)
            result.append(slug)
    return result


def _public_manifest(manifest: dict[str, Any], voice_dir: Path) -> dict[str, Any]:
    """Strip internal sentinel keys and return a public-facing dict."""
    public = {
        k: v for k, v in manifest.items()
        if not k.startswith("_")
    }
    # Ensure id is populated
    if "id" not in public:
        public["id"] = _voice_id(manifest, voice_dir)
    # untagged flag exposed as a top-level key for the UI
    public["untagged"] = manifest.get("_untagged", True)
    return public


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def find_voice_dir_by_id(voices_dir: Path, voice_id: str) -> Path | None:
    """Locate the voice root directory whose voice.json declares the given id.

    Falls back to matching the directory name slug when the file has no id.
    Returns None when not found.
    """
    for voice_dir in _voice_root_dirs(voices_dir):
        manifest = _manifest_for(voice_dir)
        if _voice_id(manifest, voice_dir) == voice_id:
            return voice_dir
    return None


def list_voices_with_metadata(voices_dir: Path) -> list[dict[str, Any]]:
    """Return all installed voices with their full metadata from voice.json.

    Untagged voices are included; each entry carries ``untagged: true/false``.
    """
    result: list[dict[str, Any]] = []
    for voice_dir in _voice_root_dirs(voices_dir):
        manifest = _manifest_for(voice_dir)
        result.append(_public_manifest(manifest, voice_dir))
    return result


def get_voice_metadata(voices_dir: Path, voice_id: str) -> dict[str, Any] | None:
    """Return the full metadata dict for a single voice, or None if not found."""
    voice_dir = find_voice_dir_by_id(voices_dir, voice_id)
    if voice_dir is None:
        return None
    manifest = _manifest_for(voice_dir)
    return _public_manifest(manifest, voice_dir)


def update_voice_metadata(
    voices_dir: Path,
    voice_id: str,
    *,
    description: str | None = None,
    image: str | None = None,
    attributes: dict[str, Any] | None = None,
    tags: list[str] | None = None,
    languages: list[str] | None = None,
    provenance: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Strict-validated PATCH of voice metadata.

    ``provenance`` records where a voice came from (recorded/cloned/imported/designed,
    voice.schema.json §provenance). This function only validates and persists the
    field the caller supplies — it does not populate provenance itself. A future
    HuggingFace import module is expected to call this same path to record its own
    provenance once it exists; that population logic is decoupled from this write path.

    Raises:
        KeyError: voice not found.
        ValueError: attribute/provenance validation errors (caller maps to 422).
        RuntimeError: the manifest write failed (disk error, or the target path
            fell outside the trusted voices root) — never return 200 with the
            stale pre-write manifest.
    """
    from .manifest import load_voice_manifest, save_voice_manifest
    from .taxonomy import validate_attributes_strict, validate_provenance_strict

    voice_dir = find_voice_dir_by_id(voices_dir, voice_id)
    if voice_dir is None:
        raise KeyError(f"Voice not found: {voice_id!r}")

    # Strict validation before any mutation
    if attributes is not None:
        errors = validate_attributes_strict(attributes)
        if errors:
            raise ValueError(errors)
    if provenance is not None:
        errors = validate_provenance_strict(provenance)
        if errors:
            raise ValueError(errors)

    # Load raw manifest (no lenient validation — we write back what we validate)
    raw = load_voice_manifest(voice_dir)

    if description is not None:
        raw["description"] = description
    if image is not None:
        raw["image"] = image
    if attributes is not None:
        raw["attributes"] = attributes
    if tags is not None:
        raw["tags"] = _sanitize_tags(tags)
    if languages is not None:
        raw["languages"] = languages
    if provenance is not None:
        raw["provenance"] = provenance

    if not save_voice_manifest(voice_dir, raw):
        raise RuntimeError(f"Failed to persist voice manifest for {voice_id!r}")

    # Return the validated public view
    manifest = _manifest_for(voice_dir)
    return _public_manifest(manifest, voice_dir)


def search_voices(
    voices_dir: Path,
    *,
    q: str | None = None,
    class_: str | None = None,
    gender: str | None = None,
    age: str | None = None,
    accent: str | None = None,
    language: list[str] | None = None,
    style: list[str] | None = None,
    tone: list[str] | None = None,
    timbre: list[str] | None = None,
    use_case: list[str] | None = None,
    tag: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Filter voices by free-text query and/or attribute facets.

    OR-within multi-value params (language, style, tone, timbre, use_case, tag),
    AND-across params.
    """
    voices = list_voices_with_metadata(voices_dir)

    def _matches(v: dict[str, Any]) -> bool:
        # Free-text search over name, description, tags
        if q:
            q_lower = q.lower()
            haystack = " ".join([
                str(v.get("name") or ""),
                str(v.get("description") or ""),
                " ".join(v.get("tags") or []),
            ]).lower()
            if q_lower not in haystack:
                return False

        attrs = v.get("attributes") or {}

        # Scalar attribute filters
        for param, field in [
            (class_, "class"),
            (gender, "gender"),
            (age, "age"),
            (accent, "accent"),
        ]:
            if param is not None and attrs.get(field) != param:
                return False

        # Array attribute filters (OR-within, AND-across)
        for param_list, field in [
            (language, "language"),
            (style, "style"),
            (tone, "tone"),
            (timbre, "timbre"),
            (use_case, "use_case"),
        ]:
            if param_list:
                field_vals = set(attrs.get(field) or [])
                if not any(p in field_vals for p in param_list):
                    return False

        # Free tag filter (OR within list)
        if tag:
            voice_tags = set(v.get("tags") or [])
            if not any(t in voice_tags for t in tag):
                return False

        return True

    return [v for v in voices if _matches(v)]


# ---------------------------------------------------------------------------
# Casting
# ---------------------------------------------------------------------------

_SUPPORTED_CONTRACT_VERSION = "1.0"
_SUPPORTED_CARD_VERSION = "1.0"


def _parse_major(version: str) -> int:
    try:
        return int(str(version).split(".")[0])
    except Exception:
        return -1


def _score_voice(card: dict[str, Any], character: dict[str, Any]) -> tuple[float, str]:
    """Score one casting card against a character brief.

    Returns (score 0–1, reason string).
    """
    score = 0.0
    reasons: list[str] = []

    c_gender = character.get("inferred_gender") or ""
    c_age = character.get("inferred_age") or ""
    c_class = character.get("inferred_class") or ""

    # Strong score: class, gender, age
    if c_class and card.get("class") == c_class:
        score += 0.25
        reasons.append(f"class matches ({c_class})")
    if c_gender and card.get("gender") == c_gender:
        score += 0.25
        reasons.append(f"gender matches ({c_gender})")
    if c_age and card.get("age") == c_age:
        score += 0.25
        reasons.append(f"age matches ({c_age})")

    # Medium score: tone/timbre keyword match against character description
    desc = (character.get("description") or "").lower()
    notes = (character.get("notes") or "").lower()
    text = desc + " " + notes

    for kw in (card.get("tone") or []):
        if kw.lower() in text:
            score += 0.05
            reasons.append(f"tone {kw!r} matches description")
            break  # one bonus per category

    for kw in (card.get("timbre") or []):
        if kw.lower() in text:
            score += 0.05
            reasons.append(f"timbre {kw!r} matches description")
            break

    # accent keyword in notes
    accent_val = card.get("accent") or ""
    accent_slug = accent_val.replace("-", " ").lower()
    if accent_slug and any(part in text for part in accent_slug.split()):
        score += 0.05
        reasons.append(f"accent {accent_val!r} aligns with notes")

    # Semantic fallback floor: if voice has a description, allow a tiny score
    if not reasons and card.get("description"):
        score = 0.1
        reasons.append("no attribute match; description-only fallback")

    # Cap at 1.0 and round to 2dp
    score = round(min(score, 1.0), 2)

    reason = "; ".join(reasons) if reasons else "no matching signals"
    return score, reason


def cast_voices(
    catalog: list[dict[str, Any]],
    character: dict[str, Any],
    project_language: str,
    limit: int = 5,
    contract_version: str = _SUPPORTED_CONTRACT_VERSION,
) -> dict[str, Any]:
    """Score and rank catalog cards for a character brief.

    Args:
        catalog: List of casting card dicts (card_version required).
        character: Character brief dict with optional inferred_gender/age.
        project_language: BCP-47 language hard filter.
        limit: Maximum recommendations to return.
        contract_version: Declared by caller; unknown major → ValueError.

    Returns:
        Recommendation output dict matching the casting contract (§2.2).

    Raises:
        ValueError: Unknown contract_version or card_version major.
    """
    if _parse_major(contract_version) > _parse_major(_SUPPORTED_CONTRACT_VERSION):
        raise ValueError(
            f"Unknown contract_version {contract_version!r}. "
            f"Supported: {_SUPPORTED_CONTRACT_VERSION}"
        )

    # Validate + filter catalog cards
    eligible: list[dict[str, Any]] = []
    for card in catalog:
        cv = card.get("card_version", _SUPPORTED_CARD_VERSION)
        if _parse_major(cv) > _parse_major(_SUPPORTED_CARD_VERSION):
            raise ValueError(
                f"Unknown card_version {cv!r} in catalog. "
                f"Supported: {_SUPPORTED_CARD_VERSION}"
            )
        # Hard filter: language
        card_langs = card.get("languages") or []
        if project_language and card_langs and project_language not in card_langs:
            continue
        eligible.append(card)

    needs_input = len(eligible) < 2

    scored: list[tuple[float, str, str]] = []  # (score, voice_id, reason)
    for card in eligible:
        score, reason = _score_voice(card, character)
        scored.append((score, card.get("voice_id", ""), reason))

    scored.sort(key=lambda x: x[0], reverse=True)
    recommendations = [
        {"voice_id": vid, "score": sc, "reason": rsn}
        for sc, vid, rsn in scored[:limit]
    ]

    return {
        "contract_version": _SUPPORTED_CONTRACT_VERSION,
        "character": character.get("name", ""),
        "recommendations": recommendations,
        "needs_input": needs_input,
    }
