"""Rendering-mode translation layer (W-PERF safe foundation, task 003).

Resolves, for a segment and a given rendering mode, which of the 8 canonical
RenderingValues applies -- per doc 01's SS9 precedence chain:
studio_override > explicit source fact > AI inference > character default >
scene default > chapter default > book default > engine default.

This is the single translation layer every downstream exporter must go
through (INV-2) -- no exporter is allowed its own ad-hoc interpretation of
raw `performance_data`. This task builds resolution only; it does not
produce engine-specific output (SSML, provider JSON, etc. -- task 011).

Two doc-01 inconsistencies resolved here, with reasoning:

1. `convert_or_omit` (used in the action_context example, doc 01 SS5.4) is not
   one of the 8 canonical RenderingValues (SS8). It resolves to
   `use_as_context_only`, matching the segment's own `inferred_state`
   mechanism: the segment isn't spoken, but its content still informs how
   neighboring segments render.
2. Vocalization's `export_strategy` (doc 01 SS5.5) does not replace mode
   resolution -- it sits alongside it. `resolve_rendering()` still resolves a
   RenderingValue (default: `convert_to_vocalization` for audio modes) and
   carries `export_strategy` through on `RenderingDecision` as an additional
   hint for whichever engine-capability layer consumes the decision.

Default-tier gaps: scene/chapter/book default tiers doc 01 names in SS9 have
no existing data source anywhere in this repo. `RenderingDefaults` accepts
them as caller-supplied dicts (owner decision: no new DB tables in this PR);
a tier the caller doesn't supply simply falls through to the next tier below
it, ending at this module's built-in kind x mode default matrix.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.domain.chapters.performance_schema import (
    PerformanceData,
    RenderingMode,
    RenderingValue,
    SegmentKind,
)

# Built-in kind x mode default matrix -- the "engine default" tier of last
# resort, filling every cell doc 01's partial per-example mappings leave
# unspecified. Reasoning inline per kind group.
_AUDIO_MODES = (RenderingMode.STANDARD_AUDIOBOOK, RenderingMode.ENHANCED_AUDIOBOOK, RenderingMode.AUDIO_DRAMA)
_VIEW_MODES = (RenderingMode.SCRIPT_VIEW, RenderingMode.REVIEW_VIEW)

_DEFAULT_MATRIX: dict[SegmentKind, dict[RenderingMode, RenderingValue]] = {
    # Ordinary spoken content: spoken in every audio mode, visible in both view modes.
    SegmentKind.NARRATION: {m: RenderingValue.SPOKEN for m in _AUDIO_MODES}
    | {m: RenderingValue.VISIBLE for m in _VIEW_MODES},
    SegmentKind.DIALOGUE: {m: RenderingValue.SPOKEN for m in _AUDIO_MODES}
    | {m: RenderingValue.VISIBLE for m in _VIEW_MODES},
    # Attribution ("Marcus whispered."): spoken in standard/enhanced audiobook
    # narration, omitted in dramatized audio_drama (doc 01 SS5.3 example).
    SegmentKind.ATTRIBUTION: {
        RenderingMode.STANDARD_AUDIOBOOK: RenderingValue.SPOKEN,
        RenderingMode.ENHANCED_AUDIOBOOK: RenderingValue.SPOKEN,
        RenderingMode.AUDIO_DRAMA: RenderingValue.OMIT,
    }
    | {m: RenderingValue.VISIBLE for m in _VIEW_MODES},
    # Stage direction: not spoken content anywhere; audio_drama still needs it
    # as context for delivery of neighboring dialogue.
    SegmentKind.STAGE_DIRECTION: {
        RenderingMode.STANDARD_AUDIOBOOK: RenderingValue.OMIT,
        RenderingMode.ENHANCED_AUDIOBOOK: RenderingValue.OMIT,
        RenderingMode.AUDIO_DRAMA: RenderingValue.USE_AS_CONTEXT_ONLY,
    }
    | {m: RenderingValue.VISIBLE for m in _VIEW_MODES},
    # Action context (doc 01 SS5.4): spoken in standard/enhanced, use_as_context_only
    # in audio_drama (resolving convert_or_omit, see module docstring).
    SegmentKind.ACTION_CONTEXT: {
        RenderingMode.STANDARD_AUDIOBOOK: RenderingValue.SPOKEN,
        RenderingMode.ENHANCED_AUDIOBOOK: RenderingValue.SPOKEN,
        RenderingMode.AUDIO_DRAMA: RenderingValue.USE_AS_CONTEXT_ONLY,
    }
    | {m: RenderingValue.VISIBLE for m in _VIEW_MODES},
    # Vocalization: converted to an actual vocal sound (or export_strategy's
    # prompt fallback) in every audio mode; visible for review.
    SegmentKind.VOCALIZATION: {m: RenderingValue.CONVERT_TO_VOCALIZATION for m in _AUDIO_MODES}
    | {m: RenderingValue.VISIBLE for m in _VIEW_MODES},
    # SFX/music/ambience: converted to a sound-effect directive in audio
    # modes (or omitted where MVP defers full sound design), visible for review.
    SegmentKind.SFX: {m: RenderingValue.CONVERT_TO_SFX for m in _AUDIO_MODES}
    | {m: RenderingValue.VISIBLE for m in _VIEW_MODES},
    SegmentKind.MUSIC: {
        RenderingMode.STANDARD_AUDIOBOOK: RenderingValue.OMIT,
        RenderingMode.ENHANCED_AUDIOBOOK: RenderingValue.OMIT,
        RenderingMode.AUDIO_DRAMA: RenderingValue.CONVERT_TO_SFX,
    }
    | {m: RenderingValue.VISIBLE for m in _VIEW_MODES},
    SegmentKind.AMBIENCE: {
        RenderingMode.STANDARD_AUDIOBOOK: RenderingValue.OMIT,
        RenderingMode.ENHANCED_AUDIOBOOK: RenderingValue.OMIT,
        RenderingMode.AUDIO_DRAMA: RenderingValue.CONVERT_TO_SFX,
    }
    | {m: RenderingValue.VISIBLE for m in _VIEW_MODES},
    # Silence is a pause, not spoken content -- handled by render timing, not speech.
    SegmentKind.SILENCE: {m: RenderingValue.OMIT for m in _AUDIO_MODES}
    | {m: RenderingValue.VISIBLE for m in _VIEW_MODES},
    # Structural markers: never spoken; visible in both view modes for navigation.
    SegmentKind.CHAPTER_MARKER: {m: RenderingValue.OMIT for m in _AUDIO_MODES}
    | {m: RenderingValue.VISIBLE for m in _VIEW_MODES},
    SegmentKind.SCENE_MARKER: {m: RenderingValue.OMIT for m in _AUDIO_MODES}
    | {m: RenderingValue.VISIBLE for m in _VIEW_MODES},
    # Production notes: internal-only -- never spoken, hidden from the reader-
    # facing script_view, but visible in review_view where a human reviews intent.
    SegmentKind.PRODUCTION_NOTE: {m: RenderingValue.OMIT for m in _AUDIO_MODES}
    | {RenderingMode.SCRIPT_VIEW: RenderingValue.HIDDEN, RenderingMode.REVIEW_VIEW: RenderingValue.VISIBLE},
}


@dataclass
class CanonicalSegment:
    """A segment's kind, parsed performance_data, and provenance flags needed
    to walk the SS9 precedence chain (ai_suggested/locked come from the
    dedicated chapter_segments columns task 001 added, not performance_data)."""

    kind: SegmentKind
    text: str
    performance_data: Optional[PerformanceData] = None
    ai_suggested: bool = False
    locked: bool = False


@dataclass
class RenderingDefaults:
    """Caller-supplied default tiers for SS9's precedence chain. Any tier left
    as None simply falls through to the next tier, ending at the built-in
    kind x mode default matrix. No new DB tables back these tiers in this PR
    (owner decision) -- callers that have scene/chapter/book defaults pass
    them in; callers that don't, don't."""

    character_default: Optional[dict[RenderingMode, RenderingValue]] = None
    scene_default: Optional[dict[RenderingMode, RenderingValue]] = None
    chapter_default: Optional[dict[RenderingMode, RenderingValue]] = None
    book_default: Optional[dict[RenderingMode, RenderingValue]] = None
    engine_default: Optional[dict[RenderingMode, RenderingValue]] = None


@dataclass
class RenderingDecision:
    value: RenderingValue
    source_tier: str
    spoken_text: Optional[str] = None
    export_strategy: Optional[str] = None


def resolve_rendering(segment: CanonicalSegment, mode: RenderingMode, defaults: RenderingDefaults) -> RenderingDecision:
    """Resolve the RenderingValue for `segment` in `mode`, walking doc 01 SS9's
    precedence chain: studio_override > explicit source fact > AI inference >
    character default > scene default > chapter default > book default >
    engine default (this module's built-in matrix)."""
    override = None
    if segment.performance_data is not None:
        override = segment.performance_data.rendering.get(mode)

    if override is not None:
        if segment.locked:
            tier = "studio_override"
        elif segment.ai_suggested:
            tier = "ai_inference"
        else:
            tier = "explicit_source_fact"
        return RenderingDecision(
            value=override,
            source_tier=tier,
            spoken_text=_resolve_spoken_text(segment, override),
            export_strategy=_export_strategy(segment),
        )

    for tier_name, tier_map in (
        ("character_default", defaults.character_default),
        ("scene_default", defaults.scene_default),
        ("chapter_default", defaults.chapter_default),
        ("book_default", defaults.book_default),
        ("engine_default", defaults.engine_default),
    ):
        if tier_map and mode in tier_map:
            value = tier_map[mode]
            return RenderingDecision(
                value=value,
                source_tier=tier_name,
                spoken_text=_resolve_spoken_text(segment, value),
                export_strategy=_export_strategy(segment),
            )

    value = _DEFAULT_MATRIX[segment.kind][mode]
    return RenderingDecision(
        value=value,
        source_tier="built_in_default",
        spoken_text=_resolve_spoken_text(segment, value),
        export_strategy=_export_strategy(segment),
    )


def _export_strategy(segment: CanonicalSegment) -> Optional[str]:
    if segment.performance_data is not None:
        return segment.performance_data.export_strategy
    return None


def _resolve_spoken_text(segment: CanonicalSegment, value: RenderingValue) -> Optional[str]:
    if value in (RenderingValue.SPOKEN, RenderingValue.SPOKEN_BY_NARRATOR):
        if segment.performance_data is not None and segment.performance_data.spoken_text:
            return segment.performance_data.spoken_text
        return segment.text
    if value == RenderingValue.VISIBLE:
        return segment.text
    return None
