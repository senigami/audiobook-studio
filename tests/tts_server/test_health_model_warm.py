"""Tests for model_warm field in /health response."""
from unittest.mock import MagicMock, patch
import pytest
from app.tts_server.health import build_health_response


def _make_plugin(engine_id: str, model_warm_return=None):
    plugin = MagicMock()
    plugin.engine_id = engine_id
    plugin.display_name = engine_id
    plugin.verified = True
    plugin.load_error = None
    plugin.verification_error = None
    plugin.dependencies_satisfied = True
    plugin.missing_dependencies = []
    plugin.plugin_dir = MagicMock()
    if model_warm_return is not None:
        plugin.engine.model_warm.return_value = model_warm_return
    else:
        del plugin.engine.model_warm  # engine doesn't have model_warm
    return plugin


def test_health_includes_model_warm_true():
    """Engine that reports model_warm=True -> field is True in health payload."""
    plugin = _make_plugin("tts_xtts", model_warm_return=True)
    with patch("app.tts_server.health.engine_status", return_value="ready"), \
         patch("app.tts_server.health.load_settings", return_value={}):
        result = build_health_response([plugin])
    eng = result["engines"][0]
    assert eng["model_warm"] is True


def test_health_includes_model_warm_false():
    """Engine that reports model_warm=False -> field is False in health payload."""
    plugin = _make_plugin("tts_xtts", model_warm_return=False)
    with patch("app.tts_server.health.engine_status", return_value="ready"), \
         patch("app.tts_server.health.load_settings", return_value={}):
        result = build_health_response([plugin])
    eng = result["engines"][0]
    assert eng["model_warm"] is False


def test_health_model_warm_none_for_engines_without_method():
    """Engine without model_warm() -> field is None (e.g. cloud/Voxtral)."""
    plugin = _make_plugin("tts_voxtral", model_warm_return=None)
    with patch("app.tts_server.health.engine_status", return_value="ready"), \
         patch("app.tts_server.health.load_settings", return_value={}):
        result = build_health_response([plugin])
    eng = result["engines"][0]
    assert eng["model_warm"] is None
