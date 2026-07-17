"""Canonical `performance_data` JSON schema (W-PERF safe foundation, task 002).

Defines the typed shape of the JSON blob stored in `chapter_segments.performance_data`,
matching `design-docs/plans/proposals/performance_script_model/01-canonical-json-format.md`
(the "Audiobook Performance Script JSON" format).

Several doc-01 segment fields are already promoted to dedicated `chapter_segments`
columns by W-PERF task 001 (`speaker.confidence`->`speaker_confidence`,
`speaker.evidence`->`speaker_evidence`, `review.needs_human_review`->`needs_review`,
`review.locked`->`locked`). `performance_data` holds everything doc-01 puts on a
segment that is NOT one of those promoted columns: `kind`, the `performance`
sub-object, the `rendering` overrides, and kind-specific extension fields.

Review sub-object decision (doc 01 SS10): `speaker_reviewed`, `performance_reviewed`,
and `review_notes` are NOT promoted to columns anywhere in
`03-db-schema-changes.md`'s column list, so they live inside
`performance_data.review` (this module's `ReviewAnnotation`) rather than
triggering another `ALTER TABLE`. `needs_human_review`/`locked` are deliberately
NOT duplicated on `ReviewAnnotation` -- the promoted `needs_review`/`locked`
columns are the single source of truth for those two fields.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, ValidationError


class PerformanceDataValidationError(Exception):
    """Raised when a raw dict does not conform to the performance_data schema."""


class SegmentKind(str, Enum):
    NARRATION = "narration"
    DIALOGUE = "dialogue"
    ATTRIBUTION = "attribution"
    STAGE_DIRECTION = "stage_direction"
    ACTION_CONTEXT = "action_context"
    VOCALIZATION = "vocalization"
    SFX = "sfx"
    MUSIC = "music"
    AMBIENCE = "ambience"
    SILENCE = "silence"
    CHAPTER_MARKER = "chapter_marker"
    SCENE_MARKER = "scene_marker"
    PRODUCTION_NOTE = "production_note"


class RenderingMode(str, Enum):
    STANDARD_AUDIOBOOK = "standard_audiobook"
    ENHANCED_AUDIOBOOK = "enhanced_audiobook"
    AUDIO_DRAMA = "audio_drama"
    SCRIPT_VIEW = "script_view"
    REVIEW_VIEW = "review_view"


class RenderingValue(str, Enum):
    SPOKEN = "spoken"
    SPOKEN_BY_NARRATOR = "spoken_by_narrator"
    OMIT = "omit"
    CONVERT_TO_VOCALIZATION = "convert_to_vocalization"
    CONVERT_TO_SFX = "convert_to_sfx"
    USE_AS_CONTEXT_ONLY = "use_as_context_only"
    VISIBLE = "visible"
    HIDDEN = "hidden"


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Emphasis(_StrictModel):
    text: str
    level: str


class EmotionAnnotation(_StrictModel):
    primary: str
    secondary: list[str] = []
    intensity: float
    valence: Optional[float] = None
    arousal: Optional[float] = None
    confidence: Optional[float] = None


class DeliveryAnnotation(_StrictModel):
    pace: Optional[str] = None
    volume: Optional[str] = None
    pitch: Optional[str] = None
    range: Optional[str] = None
    pause_before_ms: Optional[int] = None
    pause_after_ms: Optional[int] = None
    emphasis: list[Emphasis] = []


class PerformanceAnnotation(_StrictModel):
    emotion: Optional[EmotionAnnotation] = None
    delivery: Optional[DeliveryAnnotation] = None
    acting_note: Optional[str] = None


class InferredState(_StrictModel):
    target_character_id: str
    emotion: str


class ReviewAnnotation(_StrictModel):
    """Non-promoted review fields only -- see module docstring for the
    review/column split decision. needs_human_review/locked live on the
    dedicated chapter_segments columns and are NOT duplicated here."""

    speaker_reviewed: Optional[bool] = None
    performance_reviewed: Optional[bool] = None
    review_notes: Optional[str] = None


class PerformanceData(_StrictModel):
    kind: SegmentKind
    performance: Optional[PerformanceAnnotation] = None
    rendering: dict[RenderingMode, RenderingValue] = {}
    review: Optional[ReviewAnnotation] = None

    # Kind-specific extension fields (vocalization).
    vocalization_type: Optional[str] = None
    spoken_text: Optional[str] = None
    export_strategy: Optional[str] = None

    # Kind-specific extension fields (sfx).
    sfx_type: Optional[str] = None
    description: Optional[str] = None
    placement: Optional[str] = None
    enabled: Optional[bool] = None

    # Kind-specific extension fields (silence / sfx shared).
    duration_ms: Optional[int] = None
    purpose: Optional[str] = None

    # Kind-specific extension fields (action_context).
    affects_next_segments: Optional[list[str]] = None
    inferred_state: Optional[InferredState] = None


def validate_performance_data(raw: dict) -> PerformanceData:
    """Parse and validate a raw dict against the canonical performance_data schema.

    Used identically by AI-pipeline output-parsing and any manual-write API path
    (e.g. a Cue Editor PATCH handler) before persisting to
    `chapter_segments.performance_data`. Raises PerformanceDataValidationError with
    a clear message on malformed input rather than leaking a bare pydantic error.
    """
    try:
        return PerformanceData.model_validate(raw)
    except ValidationError as exc:
        raise PerformanceDataValidationError(str(exc)) from exc
