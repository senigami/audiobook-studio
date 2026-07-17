"""Synced-reader Task 2: chapter timing sidecar schema (version 1) + validator.

Every payload shape in design-docs/plans/active/synced_reader/01-timing-contract.md
must round-trip through validate_timing_sidecar() unmodified when valid; malformed
input (wrong schema/version, gaps/overlaps in the [start_ms, end_ms) tiling, internal
duration_ms inconsistency, unknown fields, etc.) must be rejected with a typed,
specific error rather than silently coerced.
"""
import pytest

from app.domain.chapters.timing import (
    TimingSidecarValidationError,
    validate_timing_sidecar,
)


def _valid_payload(**overrides):
    payload = {
        "schema": "chapter_segment_timing",
        "version": 1,
        "chapter_id": "ch_abc123",
        "audio_file": "chapter_ch_abc123.wav",
        "audio_generated_at": 1699999999.0,
        "audio_duration_ms": 3180,
        "generated_at": 1699999999.0,
        "group_count": 1,
        "groups": [
            {
                "group_id": "grp_0001",
                "segment_ids": ["seg_0001", "seg_0002"],
                "order": 0,
                "start_ms": 0,
                "end_ms": 3180,
                "duration_ms": 3180,
            }
        ],
    }
    payload.update(overrides)
    return payload


def _three_group_payload():
    return _valid_payload(
        audio_duration_ms=9000,
        group_count=3,
        groups=[
            {
                "group_id": "grp_0001",
                "segment_ids": ["seg_0001"],
                "order": 0,
                "start_ms": 0,
                "end_ms": 3000,
                "duration_ms": 3000,
            },
            {
                "group_id": "grp_0002",
                "segment_ids": ["seg_0002", "seg_0003"],
                "order": 1,
                "start_ms": 3000,
                "end_ms": 6000,
                "duration_ms": 3000,
            },
            {
                "group_id": "grp_0003",
                "segment_ids": ["seg_0004"],
                "order": 2,
                "start_ms": 6000,
                "end_ms": 9000,
                "duration_ms": 3000,
            },
        ],
    )


def test_valid_single_group_payload_round_trips():
    raw = _valid_payload()
    data = validate_timing_sidecar(raw)
    assert data.schema_ == "chapter_segment_timing"
    assert data.version == 1
    assert data.chapter_id == "ch_abc123"
    assert data.audio_file == "chapter_ch_abc123.wav"
    assert data.audio_generated_at == 1699999999.0
    assert data.audio_duration_ms == 3180
    assert data.generated_at == 1699999999.0
    assert data.group_count == 1
    assert len(data.groups) == 1
    group = data.groups[0]
    assert group.group_id == "grp_0001"
    assert group.segment_ids == ["seg_0001", "seg_0002"]
    assert group.order == 0
    assert group.start_ms == 0
    assert group.end_ms == 3180
    assert group.duration_ms == 3180


def test_valid_three_group_payload_round_trips():
    raw = _three_group_payload()
    data = validate_timing_sidecar(raw)
    assert data.group_count == 3
    assert [g.order for g in data.groups] == [0, 1, 2]
    assert data.groups[0].start_ms == 0
    assert data.groups[-1].end_ms == data.audio_duration_ms


def test_wrong_version_rejected():
    raw = _valid_payload(version=2)
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)


def test_version_zero_rejected():
    raw = _valid_payload(version=0)
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)


def test_wrong_schema_string_rejected():
    raw = _valid_payload(schema="something_else")
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)


def test_group_count_mismatch_rejected():
    raw = _valid_payload(group_count=2)
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)


def test_gap_between_groups_rejected():
    raw = _three_group_payload()
    # Introduce a 500ms gap between group 0 and group 1.
    raw["groups"][1]["start_ms"] = 3500
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)


def test_overlapping_groups_rejected():
    raw = _three_group_payload()
    # Group 1 starts before group 0 ends.
    raw["groups"][1]["start_ms"] = 2500
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)


def test_first_group_start_not_zero_rejected():
    raw = _valid_payload()
    raw["groups"][0]["start_ms"] = 10
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)


def test_last_group_end_not_matching_audio_duration_rejected():
    raw = _valid_payload()
    raw["audio_duration_ms"] = 5000
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)


def test_duration_ms_inconsistent_with_start_end_rejected():
    raw = _valid_payload()
    raw["groups"][0]["duration_ms"] = 1000
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)


def test_empty_groups_with_zero_duration_is_valid():
    raw = _valid_payload(audio_duration_ms=0, group_count=0, groups=[])
    data = validate_timing_sidecar(raw)
    assert data.groups == []
    assert data.group_count == 0
    assert data.audio_duration_ms == 0


def test_unknown_extra_field_rejected():
    raw = _valid_payload()
    raw["unexpected_field"] = "surprise"
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)


def test_empty_segment_ids_rejected():
    raw = _valid_payload()
    raw["groups"][0]["segment_ids"] = []
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)


def test_end_ms_not_greater_than_start_ms_rejected():
    raw = _valid_payload(audio_duration_ms=0)
    raw["groups"][0]["start_ms"] = 0
    raw["groups"][0]["end_ms"] = 0
    raw["groups"][0]["duration_ms"] = 0
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)


def test_order_gap_rejected():
    raw = _three_group_payload()
    raw["groups"][2]["order"] = 5
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)


def test_order_not_starting_at_zero_rejected():
    raw = _three_group_payload()
    for group in raw["groups"]:
        group["order"] += 1
    with pytest.raises(TimingSidecarValidationError):
        validate_timing_sidecar(raw)
