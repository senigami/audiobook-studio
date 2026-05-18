import pytest
from unittest.mock import patch, MagicMock
from app.engines.voice_engines import get_default_profile_engine, normalize_tts_engine

def test_get_default_profile_engine_filters_disabled_engines():
    # Setup mocks
    valid_engines = ["voxtral", "xtts"]

    # 1. Configured default is "voxtral", but "voxtral" is disabled.
    # It should fallback to the first enabled engine: "xtts"
    settings = {
        "default_engine": "voxtral",
        "enabled_plugins": {
            "voxtral": False,
            "xtts": True
        }
    }

    with patch("app.engines.voice_engines.list_tts_engines", return_value=valid_engines):
        resolved = get_default_profile_engine(settings=settings)
        assert resolved == "xtts"

def test_get_default_profile_engine_returns_empty_when_all_disabled():
    valid_engines = ["voxtral", "xtts"]

    # 2. Both engines are disabled. It should return "" instead of falling back to a disabled one.
    settings = {
        "default_engine": "voxtral",
        "enabled_plugins": {
            "voxtral": False,
            "xtts": False
        }
    }

    with patch("app.engines.voice_engines.list_tts_engines", return_value=valid_engines):
        resolved = get_default_profile_engine(settings=settings)
        assert resolved == ""

def test_normalize_tts_engine_resolves_to_enabled_default_when_disabled():
    valid_engines = ["voxtral", "xtts"]

    # 3. Requesting "voxtral" when "voxtral" is disabled should resolve to "xtts" (enabled default)
    settings = {
        "default_engine": "xtts",
        "enabled_plugins": {
            "voxtral": False,
            "xtts": True
        }
    }

    with patch("app.engines.voice_engines.list_tts_engines", return_value=valid_engines), \
         patch("app.db.state_settings.get_settings", return_value=settings):
        # We request "voxtral", but it is disabled. It should normalize to "xtts"
        normalized = normalize_tts_engine("voxtral", settings=settings)
        assert normalized == "xtts"
