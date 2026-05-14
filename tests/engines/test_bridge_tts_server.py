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

        result = bridge.synthesize({
            "engine_id": "xtts",
            "script_text": "Hello world",
            "output_path": "/tmp/out.wav",
        })

        assert result["status"] == "ok"
        assert result["bridge"] == "tts-server-bridge"
        assert result["engine_id"] == "xtts"
        mock_client.synthesize.assert_called_once()
        # Verify task_id propagation
        args, kwargs = mock_client.synthesize.call_args
        assert kwargs.get("task_id") is None

    def test_synthesize_propagates_task_id(self):
        mock_client = MagicMock()
        mock_client.synthesize.return_value = {"ok": True, "output_path": "/tmp/out.wav"}
        bridge = _make_bridge_with_client(mock_client)

        bridge.synthesize({
            "engine_id": "xtts",
            "script_text": "Hello",
            "output_path": "/tmp/out.wav",
            "task_id": "task_123"
        })

        _, kwargs = mock_client.synthesize.call_args
        assert kwargs.get("task_id") == "task_123"

    def test_synthesize_raises_on_tts_server_error(self):
        from app.engines.tts_client import TtsServerConnectionError

        mock_client = MagicMock()
        mock_client.synthesize.side_effect = TtsServerConnectionError("unreachable")

        bridge = _make_bridge_with_client(mock_client)

        with pytest.raises(EngineUnavailableError):
            bridge.synthesize({
                "engine_id": "xtts",
                "script_text": "Hello",
                "output_path": "/tmp/out.wav",
            })

    def test_synthesize_missing_engine_id_raises(self):
        mock_client = MagicMock()
        bridge = _make_bridge_with_client(mock_client)

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

        result = bridge.preview({
            "engine_id": "xtts",
            "script_text": "Preview text",
            "output_path": "/tmp/preview.wav",
        })

        assert result["ephemeral"] is True
        assert result["bridge"] == "tts-server-preview-bridge"
        mock_client.preview.assert_called_once()
        # Verify task_id propagation
        _, kwargs = mock_client.preview.call_args
        assert kwargs.get("task_id") is None

    def test_preview_propagates_task_id(self):
        mock_client = MagicMock()
        mock_client.preview.return_value = {"ok": True, "output_path": "/tmp/preview.wav"}
        bridge = _make_bridge_with_client(mock_client)

        bridge.preview({
            "engine_id": "xtts",
            "script_text": "Hello",
            "output_path": "/tmp/preview.wav",
            "task_id": "preview_456"
        })

        _, kwargs = mock_client.preview.call_args
        assert kwargs.get("task_id") == "preview_456"

    def test_preview_accepts_engine_id_and_payload_shape(self):
        mock_client = MagicMock()
        mock_client.preview.return_value = {
            "ok": True,
            "output_path": "/tmp/preview.wav",
            "duration_sec": 0.5,
            "warnings": [],
        }

        bridge = _make_bridge_with_client(mock_client)

        result = bridge.preview("xtts", {
            "script_text": "Preview text",
            "output_path": "/tmp/preview.wav",
        })

        assert result["ephemeral"] is True
        assert result["engine_id"] == "xtts"
        mock_client.preview.assert_called_once()


class TestBridgeDescribeRegistry:
    def test_describe_registry_via_tts_server(self):
        mock_client = MagicMock()
        mock_client.get_engines.return_value = [
            {"engine_id": "xtts", "display_name": "XTTS"}
        ]

        bridge = _make_bridge_with_client(mock_client)

        result = bridge.describe_registry()

        assert len(result) == 1
        assert result[0]["engine_id"] == "xtts"

    def test_describe_registry_enriches_with_test_metadata(self, tmp_path):
        mock_client = MagicMock()
        mock_client.get_engines.return_value = [
            {"engine_id": "xtts", "display_name": "XTTS"}
        ]

        import json
        test_dir = tmp_path / "plugins" / "tts_xtts" / "assets"
        test_dir.mkdir(parents=True)
        meta = {"ok": True, "generated_at": 123456789.0, "audio_url": "/test.wav"}
        (test_dir / "last_test.json").write_text(json.dumps(meta))

        bridge = _make_bridge_with_client(mock_client)

        with patch("app.core.config.PLUGINS_DIR", tmp_path / "plugins"):
            result = bridge.describe_registry()

        assert len(result) == 1
        assert result[0]["last_test"] == meta
