"""app/domain/voices/recording_archetypes.py -- Python port of the frontend's
suggestRecordingPrompt() scoring, ported for the sample-text-only path (no
composed fallback). Mirrors the exact/close/no-match cases covered by
frontend/tests/unit/pages/Voices/components/metadata/recordingPromptSuggester.test.ts
so both sides agree on the same inputs.
"""
from app.domain.voices.recording_archetypes import (
    CLOSE_THRESHOLD,
    EXACT_THRESHOLD,
    MAX_SCORE,
    suggest_sample_text,
)


def test_returns_none_for_missing_or_empty_attrs():
    assert suggest_sample_text(None) is None
    assert suggest_sample_text({}) is None
    assert suggest_sample_text({"tone": [], "timbre": []}) is None


def test_exact_match_returns_the_archetypes_sample_text():
    attrs = {
        "class": "human",
        "gender": "feminine",
        "age": "adult",
        "tone": ["warm", "friendly", "gentle"],
        "timbre": ["rich", "velvety", "smooth"],
        "pace": "measured",
    }
    result = suggest_sample_text(attrs)
    assert result is not None
    assert result.startswith("Come sit by the fire a while")


def test_close_match_returns_the_archetypes_sample_text():
    attrs = {
        "class": "human",
        "gender": "masculine",
        "age": "young-adult",
        "tone": ["heroic", "confident"],
    }
    result = suggest_sample_text(attrs)
    assert result is not None
    assert result.startswith("This is the line we hold")


def test_no_close_match_returns_none_not_a_guess():
    attrs = {"class": "human", "tone": ["playful"], "timbre": ["thin"]}
    assert suggest_sample_text(attrs) is None


def test_thresholds_match_the_frontend_suggester():
    # Pinned so a change here can't silently drift from recordingPromptSuggester.ts.
    assert MAX_SCORE == 12
    assert EXACT_THRESHOLD == 10
    assert CLOSE_THRESHOLD == 6


def test_is_deterministic():
    attrs = {"class": "creature", "tone": ["menacing"], "timbre": ["gravelly"]}
    assert suggest_sample_text(attrs) == suggest_sample_text(attrs)
