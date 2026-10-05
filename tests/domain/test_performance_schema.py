"""W-PERF task 002: canonical performance_data JSON schema + validator.

Every example JSON blob from design-docs/plans/proposals/performance_script_model/
01-canonical-json-format.md must round-trip through validate_performance_data()
unmodified; malformed input must be rejected with a typed, specific error.
"""
import pytest

from app.domain.chapters.performance_schema import (
    PerformanceDataValidationError,
    validate_performance_data,
)


def test_minimal_dialogue_segment():
    data = validate_performance_data({
        "kind": "dialogue",
    })
    assert data.kind == "dialogue"
    assert data.performance is None


def test_annotated_dialogue_segment_sparse_model():
    raw = {
        "kind": "dialogue",
        "performance": {
            "emotion": {"primary": "shock", "intensity": 0.68},
            "delivery": {"volume": "soft", "pace": "slow"},
            "acting_note": "Stunned, almost unable to believe it.",
        },
    }
    data = validate_performance_data(raw)
    assert data.performance.emotion.primary == "shock"
    assert data.performance.emotion.intensity == 0.68
    assert data.performance.delivery.volume == "soft"
    assert data.performance.acting_note == "Stunned, almost unable to believe it."


def test_narration_segment():
    data = validate_performance_data({"kind": "narration"})
    assert data.kind == "narration"


def test_attribution_segment_with_rendering_overrides():
    raw = {
        "kind": "attribution",
        "rendering": {
            "standard_audiobook": "spoken",
            "enhanced_audiobook": "spoken",
            "audio_drama": "omit",
        },
    }
    data = validate_performance_data(raw)
    assert data.rendering["standard_audiobook"] == "spoken"
    assert data.rendering["audio_drama"] == "omit"


def test_action_context_segment():
    raw = {
        "kind": "action_context",
        "affects_next_segments": ["seg_0014"],
        "inferred_state": {
            "target_character_id": "char_elena",
            "emotion": "fearful refusal",
        },
        "rendering": {
            "standard_audiobook": "spoken",
            "enhanced_audiobook": "spoken",
            "audio_drama": "convert_to_vocalization",
        },
    }
    data = validate_performance_data(raw)
    assert data.affects_next_segments == ["seg_0014"]
    assert data.inferred_state.target_character_id == "char_elena"


def test_vocalization_segment():
    raw = {
        "kind": "vocalization",
        "vocalization_type": "laugh",
        "performance": {
            "emotion": {"primary": "nervousness", "intensity": 0.55},
            "delivery": {"volume": "quiet"},
        },
        "spoken_text": None,
        "export_strategy": "engine_vocalization_or_prompt",
    }
    data = validate_performance_data(raw)
    assert data.vocalization_type == "laugh"
    assert data.export_strategy == "engine_vocalization_or_prompt"


def test_sfx_segment():
    raw = {
        "kind": "sfx",
        "sfx_type": "door_creak",
        "description": "A slow wooden door creak.",
        "rendering": {},
        "placement": "after_previous",
        "duration_ms": 1200,
        "enabled": True,
    }
    data = validate_performance_data(raw)
    assert data.sfx_type == "door_creak"
    assert data.duration_ms == 1200
    assert data.enabled is True


def test_silence_segment():
    raw = {
        "kind": "silence",
        "duration_ms": 750,
        "purpose": "dramatic pause",
    }
    data = validate_performance_data(raw)
    assert data.duration_ms == 750
    assert data.purpose == "dramatic pause"


def test_full_performance_annotation_all_fields():
    raw = {
        "kind": "dialogue",
        "performance": {
            "emotion": {
                "primary": "fear",
                "secondary": ["urgency", "protectiveness"],
                "intensity": 0.76,
                "valence": -0.7,
                "arousal": 0.82,
                "confidence": 0.8,
            },
            "delivery": {
                "pace": "fast",
                "volume": "hushed",
                "pitch": "low",
                "range": "restrained",
                "pause_before_ms": 100,
                "pause_after_ms": 300,
                "emphasis": [{"text": "Don't", "level": "strong"}],
            },
            "acting_note": "Urgent warning, controlled but frightened.",
        },
    }
    data = validate_performance_data(raw)
    assert data.performance.emotion.secondary == ["urgency", "protectiveness"]
    assert data.performance.delivery.emphasis[0].text == "Don't"
    assert data.performance.delivery.emphasis[0].level == "strong"


def test_review_subobject_lives_inside_performance_data():
    """Decision (a): speaker_reviewed/performance_reviewed/review_notes live in
    performance_data.review; needs_human_review/locked are NOT duplicated here
    since they're already promoted to dedicated columns by task 001."""
    raw = {
        "kind": "dialogue",
        "review": {
            "speaker_reviewed": True,
            "performance_reviewed": False,
            "review_notes": "Confirm speaker with editor.",
        },
    }
    data = validate_performance_data(raw)
    assert data.review.speaker_reviewed is True
    assert data.review.performance_reviewed is False
    assert data.review.review_notes == "Confirm speaker with editor."
    assert not hasattr(data.review, "needs_human_review")
    assert not hasattr(data.review, "locked")


def test_rejects_unknown_segment_kind():
    with pytest.raises(PerformanceDataValidationError):
        validate_performance_data({"kind": "not_a_real_kind"})


def test_rejects_wrong_type_for_intensity():
    with pytest.raises(PerformanceDataValidationError):
        validate_performance_data({
            "kind": "dialogue",
            "performance": {"emotion": {"primary": "fear", "intensity": "very much"}},
        })


def test_rejects_unknown_rendering_mode():
    with pytest.raises(PerformanceDataValidationError):
        validate_performance_data({
            "kind": "attribution",
            "rendering": {"not_a_real_mode": "spoken"},
        })


def test_rejects_unknown_rendering_value():
    with pytest.raises(PerformanceDataValidationError):
        validate_performance_data({
            "kind": "attribution",
            "rendering": {"standard_audiobook": "not_a_real_value"},
        })
