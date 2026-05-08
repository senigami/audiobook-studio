from unittest.mock import patch

from app.chunk_groups import build_chunk_groups


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

    with patch("app.chunk_groups.resolve_profile_engine", return_value="xtts") as resolver:
        groups = build_chunk_groups(segments, default_profile=None, engine_cache={})

    assert len(groups) == 1
    assert resolver.call_count == 1
