"""Tests for the relay_marker progress-marker normalizer in engine.py.

R1 revert-check: before the fix (relay_marker does not exist / returns None for
START_SEGMENT), the assertions on START_SEGMENT and SEGMENT_SAVED formatting
fail, confirming the tests would have caught the bug.

R2 compliance: only module-level helpers are tested; no state-store mocking.
"""
import sys
import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path

from plugins.tts_xtts.plugin.server.engine import relay_marker


# ---------------------------------------------------------------------------
# relay_marker — unit tests
# ---------------------------------------------------------------------------

class TestRelayMarker:
    """relay_marker(line, task_id) -> Optional[str]"""

    def test_start_segment_appends_task_id(self):
        result = relay_marker("[START_SEGMENT] seg123", "task-9")
        assert result == "[START_SEGMENT] seg123 task-9"

    def test_start_segment_with_path_appends_task_id(self):
        result = relay_marker("[START_SEGMENT] /some/path/seg-1.wav", "task-42")
        assert result == "[START_SEGMENT] /some/path/seg-1.wav task-42"

    def test_segment_saved_appends_task_id(self):
        result = relay_marker("[SEGMENT_SAVED] /path/to/seg-1.wav", "task-9")
        assert result == "[SEGMENT_SAVED] /path/to/seg-1.wav task-9"

    def test_segment_saved_bare_sid_appends_task_id(self):
        result = relay_marker("[SEGMENT_SAVED] seg-abc", "job-77")
        assert result == "[SEGMENT_SAVED] seg-abc job-77"

    def test_start_synthesis_passes_through_unchanged(self):
        result = relay_marker("[START_SYNTHESIS] task-9", "task-9")
        assert result == "[START_SYNTHESIS] task-9"

    def test_progress_passes_through_unchanged(self):
        result = relay_marker("[PROGRESS] 50% task-9", "task-9")
        assert result == "[PROGRESS] 50% task-9"

    def test_non_marker_line_returns_none(self):
        assert relay_marker("Loading model...", "task-9") is None

    def test_empty_line_returns_none(self):
        assert relay_marker("", "task-9") is None

    def test_whitespace_only_returns_none(self):
        assert relay_marker("   \n", "task-9") is None

    def test_arbitrary_log_line_returns_none(self):
        assert relay_marker("Synthesizing 12 segments to /tmp/out.wav...", "task-9") is None

    def test_start_segment_idempotent_when_task_id_already_present(self):
        # If task_id already appended, must not double-append.
        result = relay_marker("[START_SEGMENT] seg123 task-9", "task-9")
        assert result == "[START_SEGMENT] seg123 task-9"

    def test_segment_saved_idempotent_when_task_id_already_present(self):
        result = relay_marker("[SEGMENT_SAVED] seg-1.wav task-9", "task-9")
        assert result == "[SEGMENT_SAVED] seg-1.wav task-9"

    def test_start_synthesis_no_task_id_in_worker_output(self):
        # Edge case: worker emits bare [START_SYNTHESIS] without task_id — still a marker.
        result = relay_marker("[START_SYNTHESIS]", "task-9")
        # passes through (it starts with the marker)
        assert result == "[START_SYNTHESIS]"

    def test_progress_without_task_id_passes_through(self):
        # Worker emits [PROGRESS] 30% — pass through; orchestrator can handle.
        result = relay_marker("[PROGRESS] 30%", "task-9")
        assert result == "[PROGRESS] 30%"


# ---------------------------------------------------------------------------
# Integration: parse_output calls relay_marker and writes to sys.stderr
# ---------------------------------------------------------------------------

class TestParseOutputRelaysToStderr:
    """Verify that synthesize()'s parse_output closure re-emits markers to stderr."""

    def test_start_segment_is_written_to_stderr(self, tmp_path):
        from plugins.tts_xtts.plugin.server.engine import XttsPlugin
        from app.engines.voice.sdk import TTSRequest

        plugin = XttsPlugin()
        script = [
            {"id": "seg-1", "text": "Hello world", "save_path": str(tmp_path / "seg-1.wav")},
        ]
        req = TTSRequest(
            text="",
            output_path=str(tmp_path / "out.wav"),
            script=script,
            task_id="task-99",
            settings={"speed": 1.0},
        )

        emitted_lines: list[str] = []

        def mock_generate_script(script_json_path, out_wav, on_output, cancel_check,
                                  speed, task_id, engine_settings=None):
            on_output("[START_SYNTHESIS] task-99\n")
            on_output("[START_SEGMENT] seg-1\n")
            on_output("[SEGMENT_SAVED] seg-1.wav\n")
            return 0

        def fake_print(*args, file=None, flush=False, **kwargs):
            if file is sys.stderr:
                emitted_lines.append(args[0] if args else "")

        with patch.object(plugin, "check_request", return_value=(True, "OK")), \
             patch.object(plugin, "_xtts_generate_script", side_effect=mock_generate_script), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("builtins.print", side_effect=fake_print):
            plugin.synthesize(req)

        assert "[START_SYNTHESIS] task-99" in emitted_lines, (
            "START_SYNTHESIS must be re-emitted to server stderr"
        )
        assert "[START_SEGMENT] seg-1 task-99" in emitted_lines, (
            "START_SEGMENT must be re-emitted with task_id appended"
        )
        assert "[SEGMENT_SAVED] seg-1.wav task-99" in emitted_lines, (
            "SEGMENT_SAVED must be re-emitted with task_id appended"
        )

    def test_non_marker_line_is_written_to_stderr(self, tmp_path):
        """W-MIX-LA fix: non-marker worker output MUST be forwarded raw to stderr.

        R1 revert-check: on pre-fix code (the else-branch absent) the non-marker line
        is NOT printed — this assertion would fail, confirming the test catches the bug.
        """
        from plugins.tts_xtts.plugin.server.engine import XttsPlugin
        from app.engines.voice.sdk import TTSRequest

        plugin = XttsPlugin()
        req = TTSRequest(
            text="Hello",
            output_path=str(tmp_path / "out.wav"),
            voice_ref=str(tmp_path / "ref.wav"),
            task_id="task-55",
            settings={},
        )

        emitted_lines: list[str] = []

        def mock_generate(text, out_wav, safe_mode, on_output, cancel_check,
                          speaker_wav, speed, voice_profile_dir, task_id, engine_settings=None):
            on_output("Computing latents for speaker...\n")
            on_output("Some other log line\n")
            return 0

        def fake_print(*args, file=None, flush=False, **kwargs):
            if file is sys.stderr:
                emitted_lines.append(args[0] if args else "")

        with patch.object(plugin, "check_request", return_value=(True, "OK")), \
             patch.object(plugin, "_resolve_voice_inputs", return_value=("ref.wav", None)), \
             patch.object(plugin, "_xtts_generate", side_effect=mock_generate), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("builtins.print", side_effect=fake_print):
            plugin.synthesize(req)

        # Non-marker lines MUST be forwarded raw (W-MIX-LA fix).
        assert "Computing latents for speaker...\n" in emitted_lines, (
            f"Non-marker line must be forwarded to stderr. Emitted: {emitted_lines}"
        )
        assert "Some other log line\n" in emitted_lines, (
            f"Non-marker line must be forwarded to stderr. Emitted: {emitted_lines}"
        )

    def test_marker_line_not_double_printed(self, tmp_path):
        """Marker lines go through the normalized path only — not double-printed.

        R1 revert-check: the normalized form is always emitted; this test checks
        that the raw form does NOT appear in addition (no duplication).
        """
        from plugins.tts_xtts.plugin.server.engine import XttsPlugin
        from app.engines.voice.sdk import TTSRequest

        plugin = XttsPlugin()
        script = [
            {"id": "seg-1", "text": "Hi", "save_path": str(tmp_path / "seg-1.wav")},
        ]
        req = TTSRequest(
            text="",
            output_path=str(tmp_path / "out.wav"),
            script=script,
            task_id="task-77",
            settings={"speed": 1.0},
        )

        emitted_lines: list[str] = []

        def mock_generate_script(script_json_path, out_wav, on_output, cancel_check,
                                  speed, task_id, engine_settings=None):
            on_output("[START_SEGMENT] seg-1\n")
            return 0

        def fake_print(*args, file=None, flush=False, **kwargs):
            if file is sys.stderr:
                emitted_lines.append(args[0] if args else "")

        with patch.object(plugin, "check_request", return_value=(True, "OK")), \
             patch.object(plugin, "_xtts_generate_script", side_effect=mock_generate_script), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("builtins.print", side_effect=fake_print):
            plugin.synthesize(req)

        # The normalized form must appear exactly once.
        normalized_matches = [ln for ln in emitted_lines if "[START_SEGMENT] seg-1 task-77" == ln]
        assert len(normalized_matches) == 1, (
            f"Normalized marker must appear exactly once. Emitted: {emitted_lines}"
        )
        # The raw bracketed line must NOT appear as a duplicate.
        raw_matches = [ln for ln in emitted_lines if ln == "[START_SEGMENT] seg-1\n"]
        assert len(raw_matches) == 0, (
            f"Raw marker must not be double-printed. Emitted: {emitted_lines}"
        )

    def test_non_marker_line_forwarded_when_task_id_is_none(self, tmp_path):
        """R1 revert-check (Fix 2): non-marker line must be forwarded to stderr even when
        req.task_id is None (e.g. internal run_test/verify calls).

        Pre-fix: the forward block is gated on ``if req.task_id:``, so lines are silently
        dropped when task_id is absent — assertion fails.
        Post-fix: non-marker lines are forwarded regardless of task_id.
        """
        from plugins.tts_xtts.plugin.server.engine import XttsPlugin
        from app.engines.voice.sdk import TTSRequest

        plugin = XttsPlugin()
        req = TTSRequest(
            text="Hello",
            output_path=str(tmp_path / "out.wav"),
            voice_ref=str(tmp_path / "ref.wav"),
            task_id=None,  # no task_id — the gap this fix closes
            settings={},
        )

        emitted_lines: list[str] = []

        def mock_generate(text, out_wav, safe_mode, on_output, cancel_check,
                          speaker_wav, speed, voice_profile_dir, task_id, engine_settings=None):
            on_output("Worker output with no task_id\n")
            on_output("Another log line\n")
            return 0

        def fake_print(*args, file=None, flush=False, **kwargs):
            if file is sys.stderr:
                emitted_lines.append(args[0] if args else "")

        with patch.object(plugin, "check_request", return_value=(True, "OK")), \
             patch.object(plugin, "_resolve_voice_inputs", return_value=("ref.wav", None)), \
             patch.object(plugin, "_xtts_generate", side_effect=mock_generate), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("builtins.print", side_effect=fake_print):
            plugin.synthesize(req)

        assert "Worker output with no task_id\n" in emitted_lines, (
            f"Non-marker lines must be forwarded to stderr even when task_id is None. "
            f"Emitted: {emitted_lines}"
        )
        assert "Another log line\n" in emitted_lines, (
            f"Non-marker lines must be forwarded to stderr even when task_id is None. "
            f"Emitted: {emitted_lines}"
        )
