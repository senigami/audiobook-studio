"""Tests for the VoiceBridge TTS Server integration path."""

from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch

from app.engines.bridge import VoiceBridge
from app.engines.errors import EngineUnavailableError


def _make_bridge_with_client(client):
    """Return a VoiceBridge routed to a mock TTS Server client."""
    return VoiceBridge(
        registry_loader=lambda: {},
        tts_client_factory=lambda: client,
    )


class TestBridgeTtsServerSynthesize:
    def test_synthesize_succeeds_via_tts_server(self):
        mock_client = MagicMock()
        mock_client.synthesize.return_value = {
            "ok": True,
            "output_path": "/tmp/out.wav",
            "duration_sec": 1.5,
            "warnings": [],
        }

        bridge = _make_bridge_with_client(mock_client)

        with patch(
            "app.engines.bridge.use_tts_server", return_value=True
        ):
            result = bridge.synthesize({
                "engine_id": "xtts",
                "script_text": "Hello world",
                "output_path": "/tmp/out.wav",
            })

        assert result["status"] == "ok"
        assert result["bridge"] == "tts-server-bridge"
        assert result["engine_id"] == "xtts"
        mock_client.synthesize.assert_called_once()

    def test_synthesize_raises_on_tts_server_error(self):
        from app.engines.tts_client import TtsServerConnectionError

        mock_client = MagicMock()
        mock_client.synthesize.side_effect = TtsServerConnectionError("unreachable")

        bridge = _make_bridge_with_client(mock_client)

        with patch(
            "app.engines.bridge.use_tts_server", return_value=True
        ):
            with pytest.raises(EngineUnavailableError):
                bridge.synthesize({
                    "engine_id": "xtts",
                    "script_text": "Hello",
                    "output_path": "/tmp/out.wav",
                })

    def test_synthesize_missing_engine_id_raises(self):
        mock_client = MagicMock()
        bridge = _make_bridge_with_client(mock_client)

        with patch(
            "app.engines.bridge.use_tts_server", return_value=True
        ):
            with pytest.raises(Exception):  # EngineRequestError
                bridge.synthesize({"script_text": "Hello", "output_path": "/tmp/x.wav"})


class TestBridgeTtsServerPreview:
    def test_preview_succeeds_via_tts_server(self):
        mock_client = MagicMock()
        mock_client.preview.return_value = {
            "ok": True,
            "output_path": "/tmp/preview.wav",
            "duration_sec": 0.5,
            "warnings": [],
        }

        bridge = _make_bridge_with_client(mock_client)

        with patch(
            "app.engines.bridge.use_tts_server", return_value=True
        ):
            result = bridge.preview({
                "engine_id": "xtts",
                "script_text": "Preview text",
                "output_path": "/tmp/preview.wav",
            })

        assert result["ephemeral"] is True
        assert result["bridge"] == "tts-server-preview-bridge"
        mock_client.preview.assert_called_once()


class TestBridgeDescribeRegistry:
    def test_describe_registry_via_tts_server(self):
        mock_client = MagicMock()
        mock_client.get_engines.return_value = [
            {"engine_id": "xtts", "display_name": "XTTS"}
        ]

        bridge = _make_bridge_with_client(mock_client)

        with patch(
            "app.engines.bridge.use_tts_server", return_value=True
        ):
            result = bridge.describe_registry()

        assert len(result) == 1
        assert result[0]["engine_id"] == "xtts"


class TestBridgeFeatureFlagOff:
    """When USE_TTS_SERVER is False, bridge uses in-process path unchanged."""

    def test_legacy_path_used_when_flag_off(self):
        mock_engine = MagicMock()
        mock_engine.synthesize.return_value = {
            "status": "ok",
            "engine_id": "xtts",
            "audio_path": "/tmp/out.wav",
        }
        mock_registration = MagicMock()
        mock_registration.manifest.engine_id = "xtts"
        mock_registration.health.available = True
        mock_registration.health.ready = True
        mock_registration.health.message = None
        mock_registration.engine = mock_engine

        def mock_registry():
            return {"xtts": mock_registration}

        bridge = VoiceBridge(registry_loader=mock_registry)

        with patch("app.engines.bridge.use_tts_server", return_value=False):
            result = bridge.synthesize({
                "engine_id": "xtts",
                "script_text": "Hello",
                "output_path": "/tmp/out.wav",
            })

        mock_engine.synthesize.assert_called_once()
        assert result["status"] == "ok"
