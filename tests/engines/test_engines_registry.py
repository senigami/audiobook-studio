from unittest.mock import patch

from app.engines.voice_engines import (
    get_default_profile_engine,
    normalize_tts_engine,
    resolve_profile_engine,
    resolve_tts_engine_for_profiles,
)


def test_engine_normalization_returns_empty_when_registry_is_empty():
    with patch("app.engines.voice_engines.list_tts_engines", return_value=[]), \
         patch("app.engines.voice_engines._get_registry_manifests", return_value=[]):
        assert get_default_profile_engine({"default_engine": "xtts"}) == ""
        assert normalize_tts_engine("xtts", settings={"default_engine": "xtts"}) == ""
        assert resolve_profile_engine("Some Voice", fallback_engine="xtts") == ""


def test_resolve_tts_engine_for_profiles_ignores_empty_engine_results():
    def fake_resolve(profile_name, fallback=None):
        if profile_name == "Broken Voice":
            return ""
        return "xtts"

    with patch("app.engines.voice_engines.resolve_profile_engine", side_effect=fake_resolve):
        engine_id, mixed = resolve_tts_engine_for_profiles(
            ["Default Voice", "Broken Voice", "Working Voice"],
            default_profile="Default Voice",
            fallback_engine="xtts",
        )

    assert engine_id == "xtts"
    assert mixed is False


def test_resolve_tts_engine_for_profiles_resolves_each_distinct_profile_once():
    """Queuing a large chapter passes one profile name per segment (e.g. 1000
    segments sharing 1 voice). resolve_profile_engine does real disk I/O
    (state.json read + profile dir/file lookup), so this must not be called
    once per segment -- only once per distinct profile."""
    calls = []

    def fake_resolve(profile_name, fallback=None):
        calls.append(profile_name)
        return "xtts"

    with patch("app.engines.voice_engines.resolve_profile_engine", side_effect=fake_resolve):
        engine_id, mixed = resolve_tts_engine_for_profiles(
            ["Voice A"] * 1000,
            default_profile="Voice A",
            fallback_engine="xtts",
        )

    assert engine_id == "xtts"
    assert mixed is False
    # one call for default_profile's fallback resolution + one per distinct profile
    assert calls.count("Voice A") <= 2, (
        f"expected resolve_profile_engine to be called at most twice for the single "
        f"distinct profile, got {len(calls)} calls: {calls[:5]}..."
    )
