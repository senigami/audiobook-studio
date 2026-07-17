"""Canonical `chapter_segment_timing` sidecar JSON schema (synced-reader task 002).

Defines the typed shape of the `<chapter_wav_stem>.timing.json` sidecar written
alongside a rendered chapter WAV, matching
`design-docs/plans/active/synced_reader/01-timing-contract.md` (schema version 1).

One timing entry (a "group") exists per rendered chunk group -- the same
consecutive same-character `chapter_segments` merge unit the stitcher
concatenates (`app/domain/chunk_groups.py`), not one entry per raw segment
row. `groups[]` is ordered by `order` and its `[start_ms, end_ms)` ranges must
tile the chapter audio timeline gaplessly with no overlap; `validate_timing_sidecar`
enforces this (and the `schema`/`version` discriminators) at load time rather than
letting a malformed or stale sidecar be silently mis-parsed. A `version` mismatch
is the caller's cue to treat the sidecar as "no usable timing," not a hard crash --
this module's job is only to reject, not to decide what happens next.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

SCHEMA_DISCRIMINATOR = "chapter_segment_timing"
SCHEMA_VERSION = 1


class TimingSidecarValidationError(Exception):
    """Raised when a raw dict does not conform to the chapter_segment_timing schema."""


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ChapterGroupTimingEntry(_StrictModel):
    group_id: str
    segment_ids: list[str]
    order: int
    start_ms: int
    end_ms: int
    duration_ms: int

    @model_validator(mode="after")
    def _check_segment_ids_non_empty(self) -> "ChapterGroupTimingEntry":
        if not self.segment_ids:
            raise ValueError("segment_ids must be a non-empty list")
        return self

    @model_validator(mode="after")
    def _check_range_internally_consistent(self) -> "ChapterGroupTimingEntry":
        if self.end_ms <= self.start_ms:
            raise ValueError(
                f"group {self.group_id!r}: end_ms ({self.end_ms}) must be > "
                f"start_ms ({self.start_ms})"
            )
        if self.duration_ms != self.end_ms - self.start_ms:
            raise ValueError(
                f"group {self.group_id!r}: duration_ms ({self.duration_ms}) does not "
                f"match end_ms - start_ms ({self.end_ms - self.start_ms})"
            )
        return self


class ChapterGroupTiming(_StrictModel):
    schema_: str = Field(alias="schema")
    version: int
    chapter_id: str
    audio_file: str
    audio_generated_at: float
    audio_duration_ms: int
    generated_at: float
    group_count: int
    groups: list[ChapterGroupTimingEntry]

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    @model_validator(mode="after")
    def _check_schema_discriminator(self) -> "ChapterGroupTiming":
        if self.schema_ != SCHEMA_DISCRIMINATOR:
            raise ValueError(
                f"schema must be {SCHEMA_DISCRIMINATOR!r}, got {self.schema_!r}"
            )
        return self

    @model_validator(mode="after")
    def _check_version(self) -> "ChapterGroupTiming":
        if self.version != SCHEMA_VERSION:
            raise ValueError(
                f"version must be {SCHEMA_VERSION}, got {self.version!r}"
            )
        return self

    @model_validator(mode="after")
    def _check_group_count(self) -> "ChapterGroupTiming":
        if self.group_count != len(self.groups):
            raise ValueError(
                f"group_count ({self.group_count}) does not match len(groups) "
                f"({len(self.groups)})"
            )
        return self

    @model_validator(mode="after")
    def _check_order_sequential(self) -> "ChapterGroupTiming":
        expected_orders = list(range(len(self.groups)))
        actual_orders = [group.order for group in self.groups]
        if actual_orders != expected_orders:
            raise ValueError(
                f"groups must be sorted by order ascending with no gaps starting "
                f"at 0; expected {expected_orders}, got {actual_orders}"
            )
        return self

    @model_validator(mode="after")
    def _check_timeline_tiles_gaplessly(self) -> "ChapterGroupTiming":
        if not self.groups:
            if self.audio_duration_ms != 0:
                raise ValueError(
                    "empty groups list requires audio_duration_ms == 0, got "
                    f"{self.audio_duration_ms}"
                )
            return self

        if self.groups[0].start_ms != 0:
            raise ValueError(
                f"first group's start_ms must be 0, got {self.groups[0].start_ms}"
            )

        for previous, current in zip(self.groups, self.groups[1:]):
            if previous.end_ms != current.start_ms:
                raise ValueError(
                    f"groups must tile gaplessly: group {previous.group_id!r} "
                    f"end_ms ({previous.end_ms}) != group {current.group_id!r} "
                    f"start_ms ({current.start_ms})"
                )

        last_end_ms = self.groups[-1].end_ms
        if last_end_ms != self.audio_duration_ms:
            raise ValueError(
                f"last group's end_ms ({last_end_ms}) must equal audio_duration_ms "
                f"({self.audio_duration_ms})"
            )
        return self


def validate_timing_sidecar(raw: dict) -> ChapterGroupTiming:
    """Parse and validate a raw dict against the canonical chapter_segment_timing
    schema (version 1).

    Used identically by the sidecar writer (post-finalize hook) and the serving
    route before returning/persisting a `.timing.json` payload. Raises
    TimingSidecarValidationError with a clear message on malformed input rather
    than leaking a bare pydantic error or silently coercing the shape.
    """
    try:
        return ChapterGroupTiming.model_validate(raw)
    except ValidationError as exc:
        raise TimingSidecarValidationError(str(exc)) from exc
