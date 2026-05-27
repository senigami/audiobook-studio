from unittest.mock import patch

from app.domain.chunk_groups import build_chunk_groups


def test_build_chunk_groups_caches_profile_engine_resolution():
    segments = [
        {
            "id": "s1",
            "text_content": "One.",
            "character_id": None,
            "speaker_profile_name": "Voice A",
        },
        {
            "id": "s2",
            "text_content": "Two.",
            "character_id": None,
            "speaker_profile_name": "Voice A",
        },
        {
            "id": "s3",
            "text_content": "Three.",
            "character_id": None,
            "speaker_profile_name": "Voice A",
        },
    ]

    with patch("app.domain.chunk_groups.resolve_profile_engine", return_value="xtts") as resolver:
        groups = build_chunk_groups(segments, default_profile=None, engine_cache={})

    assert len(groups) == 1
    assert resolver.call_count == 1


def test_build_chunk_groups_respects_engine_limit():
    """Verify that chunk grouping respects engine-specific limits from the registry."""
    segments = [
        {"id": "s1", "text_content": "Hello world. ", "character_id": "char1"},
        {"id": "s2", "text_content": "This is a test. ", "character_id": "char1"},
    ]

    with patch("app.domain.chunk_groups.resolve_profile_engine") as mock_resolve:
        mock_resolve.return_value = "custom_engine"

        with patch("app.domain.chunk_groups.get_text_chunk_limit") as mock_limit:
            mock_limit.return_value = 10

            groups = build_chunk_groups(segments, default_profile="Default")

            assert len(groups) == 2, "Should have split into 2 groups due to engine limit"
            assert groups[0]["segments"][0]["id"] == "s1"
            assert groups[1]["segments"][0]["id"] == "s2"


def test_build_chunk_groups_groups_compatible_segments_when_engine_unresolved():
    """When profile engine resolution returns '' (unresolved), consecutive compatible
    segments must still be grouped together using a placeholder engine key.

    Known-good (audiobook-studio) behavior:
        resolve_profile_engine(profile_name, "unknown") is called, so segments
        without a registered engine resolve to "unknown" and get grouped with the
        default chunk limit, producing sentence-group blocks in the ScriptView.

    Regression introduced in audiobook-factory:
        resolve_profile_engine(profile_name, None) returns "", and the added
        ``and engine`` guard prevents grouping, emitting one group per sentence
        and causing per-sentence highlighting instead of sentence-group blocks.
    """
    segments = [
        {"id": "s1", "text_content": "Hello.", "character_id": "char1", "speaker_profile_name": "Voice A"},
        {"id": "s2", "text_content": "World.", "character_id": "char1", "speaker_profile_name": "Voice A"},
    ]
    # Simulate the production case: resolve_profile_engine cannot find the engine
    # for the profile (returns ""). Segments should still be grouped.
    with patch("app.domain.chunk_groups.resolve_profile_engine", return_value=""):
        groups = build_chunk_groups(segments, default_profile=None)
    assert len(groups) == 1, (
        "Consecutive compatible segments must group together even when the engine "
        "is unresolved. Per-sentence groups cause per-sentence highlighting in the "
        "ChapterEditor ScriptView instead of sentence-group blocks."
    )


def test_build_chunk_groups_groups_unknown_engine_together():
    # Verify that if engine resolution returns "unknown", segments are
    # grouped together as if they were the same engine.
    segments = [
        {"id": "s1", "text_content": "Hello.", "character_id": "char1"},
        {"id": "s2", "text_content": "World.", "character_id": "char1"},
    ]
    with patch("app.domain.chunk_groups.resolve_profile_engine", return_value="unknown"):
        groups = build_chunk_groups(segments, default_profile=None)

    assert len(groups) == 1
    assert groups[0]["engine"] == "unknown"
    assert len(groups[0]["segments"]) == 2
