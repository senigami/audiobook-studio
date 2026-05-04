import pytest
from unittest.mock import MagicMock, patch
from app.engines.registry import _load_tts_server_registry
from app.engines.tts_client import TtsServerConnectionError

def test_load_tts_server_registry_connection_refused():
    """Verify that connection refused errors are handled gracefully and return an empty dict."""
    with patch("app.engines.registry.TtsClient") as MockClient, \
         patch("app.engines.registry.get_watchdog") as MockWatchdog:

        # Mock watchdog as healthy so we attempt discovery
        watchdog = MagicMock()
        watchdog.is_healthy.return_value = True
        watchdog.get_url.return_value = "http://127.0.0.1:7862"
        MockWatchdog.return_value = watchdog

        # Mock client to raise connection error
        client = MockClient.return_value
        client.get_engines.side_effect = TtsServerConnectionError("Connection refused")

        # Should return {} and not raise
        result = _load_tts_server_registry()
        assert result == {}

def test_load_tts_server_registry_other_error():
    """Verify that other errors are also handled but logged as warnings."""
    with patch("app.engines.registry.TtsClient") as MockClient, \
         patch("app.engines.registry.get_watchdog") as MockWatchdog:

        watchdog = MagicMock()
        watchdog.is_healthy.return_value = True
        MockWatchdog.return_value = watchdog

        client = MockClient.return_value
        client.get_engines.side_effect = RuntimeError("Something else")

        # Should still return {} and not raise
        result = _load_tts_server_registry()
        assert result == {}
