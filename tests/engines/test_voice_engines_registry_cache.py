"""
Last-known-good registry cache in _get_registry_manifests:
A transient transport failure (TTS server restarting under the watchdog) must
not make valid persisted engines resolve to "" mid-render. The last successful
describe_registry result is served on exception instead of [].
"""
from unittest.mock import patch, MagicMock

import pytest

from app.engines import voice_engines

FAKE_MANIFESTS = [{"engine_id": "voxtral"}]


@pytest.fixture(autouse=True)
def reset_registry_cache(monkeypatch):
    monkeypatch.setattr(voice_engines, "_LAST_GOOD_MANIFESTS", None, raising=False)
    yield


def _bridge_returning(manifests):
    bridge = MagicMock()
    bridge.describe_registry.return_value = manifests
    return bridge


def _bridge_raising(exc):
    bridge = MagicMock()
    bridge.describe_registry.side_effect = exc
    return bridge


def test_transport_failure_after_success_serves_cached_manifests():
    with patch("app.engines.bridge.create_voice_bridge", return_value=_bridge_returning(FAKE_MANIFESTS)):
        assert voice_engines._get_registry_manifests() == FAKE_MANIFESTS

    with patch("app.engines.bridge.create_voice_bridge", return_value=_bridge_raising(ConnectionError("restarting"))):
        assert voice_engines._get_registry_manifests() == FAKE_MANIFESTS


def test_normalize_tts_engine_resolves_during_simulated_outage():
    with patch("app.engines.bridge.create_voice_bridge", return_value=_bridge_returning(FAKE_MANIFESTS)):
        assert voice_engines.list_tts_engines() == ["voxtral"]

    with patch("app.engines.bridge.create_voice_bridge", return_value=_bridge_raising(ConnectionError("restarting"))):
        assert voice_engines.normalize_tts_engine("voxtral", settings={}) == "voxtral"


def test_failure_without_prior_success_returns_empty():
    with patch("app.engines.bridge.create_voice_bridge", return_value=_bridge_raising(ConnectionError("down"))):
        assert voice_engines._get_registry_manifests() == []


def test_reentrant_guard_returns_empty_without_poisoning_cache():
    with patch("app.engines.bridge.create_voice_bridge", return_value=_bridge_returning(FAKE_MANIFESTS)):
        assert voice_engines._get_registry_manifests() == FAKE_MANIFESTS

    voice_engines._DISCOVERY_STATE.in_discovery = True
    try:
        assert voice_engines._get_registry_manifests() == []
    finally:
        voice_engines._DISCOVERY_STATE.in_discovery = False

    with patch("app.engines.bridge.create_voice_bridge", return_value=_bridge_raising(ConnectionError("restarting"))):
        assert voice_engines._get_registry_manifests() == FAKE_MANIFESTS


def test_empty_successful_registry_is_a_valid_cached_result():
    with patch("app.engines.bridge.create_voice_bridge", return_value=_bridge_returning(FAKE_MANIFESTS)):
        assert voice_engines._get_registry_manifests() == FAKE_MANIFESTS

    with patch("app.engines.bridge.create_voice_bridge", return_value=_bridge_returning([])):
        assert voice_engines._get_registry_manifests() == []

    with patch("app.engines.bridge.create_voice_bridge", return_value=_bridge_raising(ConnectionError("restarting"))):
        assert voice_engines._get_registry_manifests() == []
