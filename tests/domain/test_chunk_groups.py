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
