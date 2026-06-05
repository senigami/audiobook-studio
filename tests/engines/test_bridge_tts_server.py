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

    def test_synthesize_preserves_timing_payload(self):
        mock_client = MagicMock()
        timing_data = {
            "chapter_render_started_at": 10.0,
            "chapter_render_completed_at": 20.0,
            "engine_activity_started_at": 5.0,
            "segments": []
        }
        mock_client.synthesize.return_value = {
            "ok": True,
            "output_path": "/tmp/out.wav",
            "duration_sec": 1.5,
            "warnings": [],
            "timing": timing_data
        }

        bridge = _make_bridge_with_client(mock_client)
        result = bridge.synthesize({
            "engine_id": "xtts",
            "script_text": "Hello world",
            "output_path": "/tmp/out.wav",
        })

        assert result["status"] == "ok"
        assert result["tts_server_result"]["timing"] == timing_data

    def test_synthesize_timing_absent_works(self):
        mock_client = MagicMock()
        mock_client.synthesize.return_value = {
            "ok": True,
            "output_path": "/tmp/out.wav",
            "duration_sec": 1.5,
            "warnings": [],
            "timing": None
        }

        bridge = _make_bridge_with_client(mock_client)
        result = bridge.synthesize({
            "engine_id": "xtts",
            "script_text": "Hello world",
            "output_path": "/tmp/out.wav",
        })

        assert result["status"] == "ok"
        assert result["tts_server_result"].get("timing") is None



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

    def test_describe_registry_injects_computed_multiplier_into_current_settings(self):
        mock_client = MagicMock()
        mock_client.get_engines.return_value = [
            {
                "engine_id": "xtts",
                "display_name": "XTTS",
                "current_settings": {},
            }
        ]

        bridge = _make_bridge_with_client(mock_client)

        with patch("app.db.state.get_performance_metrics", return_value={"render_history": [{"engine": "xtts"}]}), \
             patch("app.tts_server.performance_settings.resolve_engine_settings_model", return_value="xtts-v2"), \
             patch("app.tts_server.performance_settings.filter_history_for_engine_model", return_value=[{"engine": "xtts", "tts_model": "xtts-v2"}]), \
             patch("app.orchestration.scheduler.eta.get_calibrated_model_params", return_value=(33.4, 0.9)):
            result = bridge.describe_registry()

        assert result[0]["calibrated_cps"] == 33.4
        assert result[0]["current_settings"]["computer_speed_multiplier"] == 2.0

    def test_describe_registry_exposes_calibration_window_metadata(self):
        mock_client = MagicMock()
        mock_client.get_engines.return_value = [
            {
                "engine_id": "xtts",
                "display_name": "XTTS",
                "current_settings": {},
            }
        ]

        bridge = _make_bridge_with_client(mock_client)
        history = [
            {"engine": "xtts", "tts_model": "xtts-v2", "cps": 20.0, "completed_at": 1780156800.0},
            {"engine": "xtts", "tts_model": "xtts-v2", "cps": 30.0, "completed_at": 1780243200.0},
            {"engine": "xtts", "tts_model": "xtts-v2", "cps": 40.0, "completed_at": 1780329600.0},
        ]

        with patch("app.db.state.get_performance_metrics", return_value={"render_history": history}), \
             patch("app.tts_server.performance_settings.resolve_engine_settings_model", return_value="xtts-v2"), \
             patch("app.tts_server.performance_settings.filter_history_for_engine_model", return_value=history), \
             patch("app.orchestration.scheduler.eta.get_calibrated_model_params", return_value=(33.4, 0.9)):
            result = bridge.describe_registry()

        assert result[0]["calibrated_cps"] == 33.4
        assert result[0]["calibration_sample_count"] == 3
        assert result[0]["calibration_since"] == 1780156800.0

    def test_describe_registry_exposes_calibration_confidence_percent(self):
        mock_client = MagicMock()
        mock_client.get_engines.return_value = [
            {
                "engine_id": "xtts",
                "display_name": "XTTS",
                "current_settings": {},
            }
        ]
        bridge = _make_bridge_with_client(mock_client)
        # N = 5 samples
        history = [
            {"engine": "xtts", "tts_model": "xtts-v2", "cps": 20.0, "completed_at": 100.0},
            {"engine": "xtts", "tts_model": "xtts-v2", "cps": 21.0, "completed_at": 101.0},
            {"engine": "xtts", "tts_model": "xtts-v2", "cps": 19.0, "completed_at": 102.0},
            {"engine": "xtts", "tts_model": "xtts-v2", "cps": 22.0, "completed_at": 103.0},
            {"engine": "xtts", "tts_model": "xtts-v2", "cps": 20.0, "completed_at": 104.0},
        ]
        with patch("app.db.state.get_performance_metrics", return_value={"render_history": history}), \
             patch("app.tts_server.performance_settings.resolve_engine_settings_model", return_value="xtts-v2"), \
             patch("app.tts_server.performance_settings.filter_history_for_engine_model", return_value=history):
            result = bridge.describe_registry()

        assert result[0]["calibration_confidence_percent"] is not None
        assert 0 <= result[0]["calibration_confidence_percent"] <= 100

    def test_describe_registry_calibration_confidence_null_when_fewer_than_five_samples(self):
        mock_client = MagicMock()
        mock_client.get_engines.return_value = [
            {
                "engine_id": "xtts",
                "display_name": "XTTS",
                "current_settings": {},
            }
        ]
        bridge = _make_bridge_with_client(mock_client)
        # N = 4 samples (< 5)
        history = [
            {"engine": "xtts", "tts_model": "xtts-v2", "cps": 20.0, "completed_at": 100.0},
            {"engine": "xtts", "tts_model": "xtts-v2", "cps": 21.0, "completed_at": 101.0},
            {"engine": "xtts", "tts_model": "xtts-v2", "cps": 19.0, "completed_at": 102.0},
            {"engine": "xtts", "tts_model": "xtts-v2", "cps": 22.0, "completed_at": 103.0},
        ]
        with patch("app.db.state.get_performance_metrics", return_value={"render_history": history}), \
             patch("app.tts_server.performance_settings.resolve_engine_settings_model", return_value="xtts-v2"), \
             patch("app.tts_server.performance_settings.filter_history_for_engine_model", return_value=history):
            result = bridge.describe_registry()

        assert result[0]["calibration_confidence_percent"] is None

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


class TestTimingContractSlice1:
    def test_timing_event_constrained_literals(self):
        from app.engines.voice.sdk import TimingEvent

        # Valid events should initialize cleanly
        event = TimingEvent(event_name="engine_activity_started", timestamp=1780000000.0)
        assert event.event_name == "engine_activity_started"
        assert event.timestamp == 1780000000.0
        assert event.segment_id is None

        # Segmented event carries segment_id
        seg_event = TimingEvent(event_name="segment_render_started", timestamp=1780000001.0, segment_id="seg-1")
        assert seg_event.segment_id == "seg-1"

        # Invalid literal names should be caught (either at run-time init check or type validation check)
        with pytest.raises(ValueError):
            TimingEvent(event_name="invalid_event_name", timestamp=1780000000.0)

    def test_tts_result_timing_payload_schema(self):
        from app.engines.voice.sdk import TTSResult, TTSTimingResult, SegmentTimingResult

        seg_timing = SegmentTimingResult(
            segment_id="seg-1",
            render_started_at=1780000001.0,
            render_completed_at=1780000003.0,
            chars=45
        )
        timing = TTSTimingResult(
            engine_activity_started_at=1780000000.0,
            chapter_render_started_at=1780000001.0,
            chapter_render_completed_at=1780000005.0,
            segments=[seg_timing]
        )

        result = TTSResult(ok=True, output_path="/tmp/test.wav", timing=timing)
        assert result.timing == timing
        assert result.timing.segments[0].segment_id == "seg-1"
        assert result.timing.segments[0].chars == 45

    def test_regression_result_without_timing(self):
        from app.engines.voice.sdk import TTSResult

        # Regression: existing callers should still construct TTSResult without timing
        result = TTSResult(ok=True, output_path="/tmp/test.wav")
        assert result.timing is None
