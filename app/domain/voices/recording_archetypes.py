"""Voice archetype -> sample-text matcher.

Python port of the scoring algorithm in ``frontend/src/pages/Voices/components/
metadata/recordingPromptSuggester.ts`` (same weights and thresholds), so a
voice's tagged attributes resolve to the same archetype match on both sides.
Loads the shared reference dataset at
``design-docs/reference/voice-archetypes/voice_archetypes.json`` -- the same
file ``recordingArchetypes.ts`` was generated from -- rather than re-embedding
the 103 records a third time. Update the JSON (and regenerate the TS const) when
the archetype table changes; this module and the TS suggester both read from
that one source of truth.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[3]
_ARCHETYPES_PATH = _REPO_ROOT / "design-docs" / "reference" / "voice-archetypes" / "voice_archetypes.json"

# Scoring weights/thresholds -- kept identical to recordingPromptSuggester.ts.
CLASS_MATCH_POINTS = 3
GENDER_MATCH_POINTS = 1
AGE_MATCH_POINTS = 1
TONE_OVERLAP_WEIGHT = 3
TIMBRE_OVERLAP_WEIGHT = 3
PACE_MATCH_POINTS = 1
MAX_SCORE = (
    CLASS_MATCH_POINTS + GENDER_MATCH_POINTS + AGE_MATCH_POINTS
    + TONE_OVERLAP_WEIGHT + TIMBRE_OVERLAP_WEIGHT + PACE_MATCH_POINTS
)  # = 12
EXACT_THRESHOLD = 10
CLOSE_THRESHOLD = 6


@lru_cache(maxsize=1)
def _load_archetypes() -> list[dict[str, Any]]:
    try:
        with _ARCHETYPES_PATH.open(encoding="utf-8") as fh:
            data = json.load(fh)
        return data.get("archetypes", [])
    except Exception as exc:
        logger.warning("Could not load voice archetype reference data: %s", exc)
        return []


def _split_list(csv: str) -> list[str]:
    return [s.strip() for s in (csv or "").split(",") if s.strip()]


def _jaccard(a: list[str], b: list[str]) -> float:
    if not a or not b:
        return 0.0
    set_a, set_b = set(a), set(b)
    union = len(set_a | set_b)
    return len(set_a & set_b) / union if union else 0.0


def _score_archetype(attrs: dict[str, Any], archetype: dict[str, Any]) -> float:
    score = 0.0
    if attrs.get("class") and archetype.get("class") and attrs["class"] == archetype["class"]:
        score += CLASS_MATCH_POINTS
    if attrs.get("gender") and archetype.get("gender") and attrs["gender"] == archetype["gender"]:
        score += GENDER_MATCH_POINTS
    if attrs.get("age") and archetype.get("age") and attrs["age"] == archetype["age"]:
        score += AGE_MATCH_POINTS

    score += _jaccard(attrs.get("tone") or [], _split_list(archetype.get("dominant_tones", ""))) * TONE_OVERLAP_WEIGHT
    score += _jaccard(attrs.get("timbre") or [], _split_list(archetype.get("dominant_timbres", ""))) * TIMBRE_OVERLAP_WEIGHT

    if attrs.get("pace") and archetype.get("pace") and attrs["pace"] == archetype["pace"]:
        score += PACE_MATCH_POINTS

    return score


def _has_meaningful_attrs(attrs: dict[str, Any] | None) -> bool:
    if not attrs:
        return False
    for value in attrs.values():
        if isinstance(value, list):
            if value:
                return True
        elif value:
            return True
    return False


def suggest_sample_text(attrs: dict[str, Any] | None) -> str | None:
    """Return an archetype-matched sample-text line for tagged voice attributes.

    Only returns a value when a match is close/exact (score >= CLOSE_THRESHOLD)
    -- unlike the frontend recording-prompt suggester there is no composed
    fallback here: a shaky invented spoken line is worse than leaving whatever
    default/custom sample text is already set alone. ``None`` means "no better
    suggestion, don't touch what's set."
    """
    if not _has_meaningful_attrs(attrs):
        return None

    best_archetype: dict[str, Any] | None = None
    best_score = -1.0
    for archetype in _load_archetypes():
        score = _score_archetype(attrs, archetype)
        if score > best_score:
            best_score = score
            best_archetype = archetype

    if best_archetype and best_score >= CLOSE_THRESHOLD:
        return best_archetype.get("sample_text")

    return None
