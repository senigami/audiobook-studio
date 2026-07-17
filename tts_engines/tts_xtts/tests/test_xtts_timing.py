import itertools
import pytest
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

from studio_plugin_sdk.types import TTSRequest, TTSResult, TTSTimingResult, SegmentTimingResult
from tts_engines.tts_xtts.plugin.server.engine import XttsPlugin

def test_xtts_adapter_returns_timing_result_on_success(tmp_path):
    """A plugin-level regression proving the XTTS adapter returns a TTSResult with a populated TTSTimingResult on success."""
    plugin = XttsPlugin()
    req = TTSRequest(
        text="Hello world",
        output_path=str(tmp_path / "out.wav"),
        voice_ref=str(tmp_path / "ref.wav"),
        settings={"speed": 1.0},
    )

    # Prepare mock inputs
    with patch.object(plugin, "check_request", return_value=(True, "OK")), \
         patch.object(plugin, "_resolve_voice_inputs", return_value=("ref.wav", None)), \
         patch.object(plugin, "_xtts_generate", return_value=0), \
         patch("pathlib.Path.exists", return_value=True):

        result = plugin.synthesize(req)
        assert result.ok is True
        assert result.timing is not None
        assert isinstance(result.timing, TTSTimingResult)
        assert result.timing.chapter_render_started_at is not None
        assert result.timing.chapter_render_completed_at is not None
        assert result.timing.engine_activity_started_at is not None

def test_xtts_adapter_timing_payload_contains_raw_anchors_and_segments(tmp_path):
    """A plugin-level regression proving the timing payload contains raw anchors and segment entries, not derived duration fields."""
    plugin = XttsPlugin()
    script = [
        {"id": "seg-1", "text": "Segment one text", "save_path": str(tmp_path / "seg-1.wav")},
        {"id": "seg-2", "text": "Segment two text", "save_path": str(tmp_path / "seg-2.wav")}
    ]
    req = TTSRequest(
        text="",
        output_path=str(tmp_path / "out.wav"),
        script=script,
        settings={"speed": 1.0},
    )

    def mock_generate_script_side_effect(script_json_path, out_wav, on_output, cancel_check, speed, task_id, engine_settings=None):
        # Simulate stdout logs printing segment markers
        on_output("[START_SEGMENT] seg-1\n")
        on_output("[SEGMENT_SAVED] seg-1\n")
        on_output("[START_SEGMENT] seg-2\n")
        on_output("[SEGMENT_SAVED] seg-2\n")
        return 0

    # Deterministic, strictly-increasing fake clock instead of real sleeps: forces
    # observable timestamp ordering (render_started_at < render_completed_at)
    # without any wall-clock wait, and — unlike a fixed side_effect list — doesn't
    # couple the test to an exact time.time() call count.
    fake_clock = itertools.count(start=1_000.0, step=0.01)

    with patch.object(plugin, "check_request", return_value=(True, "OK")), \
         patch.object(plugin, "_xtts_generate_script", side_effect=mock_generate_script_side_effect), \
         patch("pathlib.Path.exists", return_value=True), \
         patch("time.time", side_effect=lambda: next(fake_clock)):

        result = plugin.synthesize(req)
        assert result.ok is True
        assert result.timing is not None
        assert len(result.timing.segments) == 2

        seg1 = result.timing.segments[0]
        assert seg1.segment_id == "seg-1"
        assert seg1.chars == len("Segment one text")
        assert seg1.render_started_at < seg1.render_completed_at

        seg2 = result.timing.segments[1]
        assert seg2.segment_id == "seg-2"
        assert seg2.chars == len("Segment two text")
        assert seg2.render_started_at < seg2.render_completed_at

def test_xtts_adapter_fallback_when_timing_unavailable(tmp_path):
    """A regression proving the adapter still returns a valid TTSResult when timing capture is unavailable."""
    plugin = XttsPlugin()
    req = TTSRequest(
        text="Hello world",
        output_path=str(tmp_path / "out.wav"),
        voice_ref=str(tmp_path / "ref.wav"),
        settings={"speed": 1.0},
    )

    # Let's mock time.time to raise or just check that we still return a valid TTSResult if timing fields are empty
    with patch.object(plugin, "check_request", return_value=(True, "OK")), \
         patch.object(plugin, "_resolve_voice_inputs", return_value=("ref.wav", None)), \
         patch.object(plugin, "_xtts_generate", return_value=0), \
         patch("pathlib.Path.exists", return_value=True):

        # If we simulate timing not being populated, we should still return ok=True
        # For example, if we mock time.time to return None or raise ValueError
        with patch("time.time", side_effect=ValueError("Time error")):
            result = plugin.synthesize(req)
            assert result.ok is True
            assert result.timing is None
