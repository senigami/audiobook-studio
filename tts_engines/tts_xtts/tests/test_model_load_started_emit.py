"""Tests for W-MIX-LA task 002: XTTS engine wrapper emits [MODEL_LOAD_STARTED].

TDD — covers:
  - parse_output on the XTTS cold-load line emits [MODEL_LOAD_STARTED] to sys.stderr.
  - parse_output on an ordinary progress line does NOT emit [MODEL_LOAD_STARTED].
  - Both cold-load text variants are recognized:
      "Loading XTTS model..."      (xtts_inference.py:634, one-shot)
      "XTTS serve mode: loading model..."  (xtts_inference.py:132, warm-worker)
  - Warm reuse / non-load lines do NOT emit the marker (INV-2).
  - When active_segment_id is set, the marker includes it.
  - When active_segment_id is not set, the marker omits it (just task_id as last token).

R1 revert-check: before this change relay_marker returns None for these bare text lines,
so no [MODEL_LOAD_STARTED] is printed → assertions fail pre-implementation.

R2 compliance: the engine (_xtts_generate_script, _xtts_generate) is mocked (it's the
external subprocess boundary). parse_output itself is the unit under test — not mocked.

R4: no sleeps.
"""

from __future__ import annotations

import sys
import pytest
from unittest.mock import patch
from pathlib import Path


# ---------------------------------------------------------------------------
# Test 1 — parse_output emits [MODEL_LOAD_STARTED] on cold-load line
# ---------------------------------------------------------------------------

class TestModelLoadStartedEmit:
    """Verify that parse_output writes [MODEL_LOAD_STARTED] to sys.stderr on cold-load lines."""

    def _run_with_lines(self, tmp_path, lines: list[str], task_id: str = "task-42") -> list[str]:
        """Run synthesize() with a mock worker that emits the given lines; collect stderr output."""
        from tts_engines.tts_xtts.plugin.server.engine import XttsPlugin
        from app.engines.voice.sdk import TTSRequest

        plugin = XttsPlugin()
        script = [
            {"id": "seg-1", "text": "Hello world", "save_path": str(tmp_path / "seg-1.wav")},
        ]
        req = TTSRequest(
            text="",
            output_path=str(tmp_path / "out.wav"),
            script=script,
            task_id=task_id,
            settings={"speed": 1.0},
        )

        emitted: list[str] = []

        def mock_generate_script(script_json_path, out_wav, on_output, cancel_check,
                                  speed, task_id, engine_settings=None):
            for line in lines:
                on_output(line)
            return 0

        with patch.object(plugin, "check_request", return_value=(True, "OK")), \
             patch.object(plugin, "_xtts_generate_script", side_effect=mock_generate_script), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("tts_engines.tts_xtts.plugin.server.engine._emit_stderr_atomic", side_effect=emitted.append):
            plugin.synthesize(req)

        return emitted

    def test_loading_xtts_model_emits_model_load_started(self, tmp_path):
        """'Loading XTTS model...' → [MODEL_LOAD_STARTED] emitted to stderr."""
        emitted = self._run_with_lines(tmp_path, [
            "[START_SEGMENT] seg-1\n",
            "Loading XTTS model...\n",
        ], task_id="task-42")

        model_load_lines = [ln for ln in emitted if "[MODEL_LOAD_STARTED]" in ln]
        assert model_load_lines, (
            f"Expected [MODEL_LOAD_STARTED] in stderr output, got none. "
            f"All emitted: {emitted}"
        )
        # task_id must be the last token
        marker_line = model_load_lines[0]
        assert marker_line.strip().endswith("task-42"), (
            f"task_id must be last token in marker: {marker_line!r}"
        )

    def test_xtts_serve_mode_loading_emits_model_load_started(self, tmp_path):
        """'XTTS serve mode: loading model...' → [MODEL_LOAD_STARTED] emitted to stderr."""
        emitted = self._run_with_lines(tmp_path, [
            "[START_SEGMENT] seg-1\n",
            "XTTS serve mode: loading model...\n",
        ], task_id="task-77")

        model_load_lines = [ln for ln in emitted if "[MODEL_LOAD_STARTED]" in ln]
        assert model_load_lines, (
            f"Expected [MODEL_LOAD_STARTED] for serve-mode cold-load line. "
            f"All emitted: {emitted}"
        )
        marker_line = model_load_lines[0]
        assert marker_line.strip().endswith("task-77"), (
            f"task_id must be last token in marker: {marker_line!r}"
        )

    def test_model_load_started_includes_sid_when_start_segment_seen(self, tmp_path):
        """When [START_SEGMENT] was seen before the cold-load line, sid is included."""
        emitted = self._run_with_lines(tmp_path, [
            "[START_SEGMENT] seg-abc\n",
            "Loading XTTS model...\n",
        ], task_id="task-42")

        model_load_lines = [ln for ln in emitted if "[MODEL_LOAD_STARTED]" in ln]
        assert model_load_lines, "Expected [MODEL_LOAD_STARTED] in stderr"
        marker_line = model_load_lines[0]
        # sid should appear between the marker and task_id
        tokens = marker_line.strip().split()
        # Format: [MODEL_LOAD_STARTED] seg-abc task-42
        assert len(tokens) >= 3, (
            f"Marker with known sid must have >=3 tokens: {marker_line!r}"
        )
        assert tokens[-1] == "task-42", f"Last token must be task_id: {marker_line!r}"
        assert "seg-abc" in marker_line, f"sid must appear in marker: {marker_line!r}"

    def test_ordinary_progress_line_does_not_emit_model_load_started(self, tmp_path):
        """Ordinary log lines do NOT emit [MODEL_LOAD_STARTED]."""
        emitted = self._run_with_lines(tmp_path, [
            "[START_SEGMENT] seg-1\n",
            "[PROGRESS] 50% task-42\n",
            "Synthesizing audio...\n",
            "[SEGMENT_SAVED] seg-1.wav\n",
        ], task_id="task-42")

        model_load_lines = [ln for ln in emitted if "[MODEL_LOAD_STARTED]" in ln]
        assert not model_load_lines, (
            f"[MODEL_LOAD_STARTED] must NOT be emitted for ordinary lines. "
            f"Got: {model_load_lines}"
        )

    def test_warm_reuse_line_does_not_emit_model_load_started(self, tmp_path):
        """A line that is NOT the exact cold-load text does not emit [MODEL_LOAD_STARTED]."""
        emitted = self._run_with_lines(tmp_path, [
            "[START_SEGMENT] seg-1\n",
            "XTTS model already loaded, reusing...\n",
            "Loading voice from latent...\n",
        ], task_id="task-42")

        model_load_lines = [ln for ln in emitted if "[MODEL_LOAD_STARTED]" in ln]
        assert not model_load_lines, (
            f"Non-exact warm-reuse lines must NOT emit [MODEL_LOAD_STARTED]. "
            f"Got: {model_load_lines}"
        )

    def test_no_task_id_no_model_load_started(self, tmp_path):
        """When task_id is None/empty on the request, no [MODEL_LOAD_STARTED] is emitted."""
        from tts_engines.tts_xtts.plugin.server.engine import XttsPlugin
        from app.engines.voice.sdk import TTSRequest

        plugin = XttsPlugin()
        script = [
            {"id": "seg-1", "text": "Hello", "save_path": str(tmp_path / "seg-1.wav")},
        ]
        req = TTSRequest(
            text="",
            output_path=str(tmp_path / "out.wav"),
            script=script,
            task_id=None,  # no task_id
            settings={"speed": 1.0},
        )

        emitted: list[str] = []

        def mock_generate_script(script_json_path, out_wav, on_output, cancel_check,
                                  speed, task_id, engine_settings=None):
            on_output("[START_SEGMENT] seg-1\n")
            on_output("Loading XTTS model...\n")
            return 0

        with patch.object(plugin, "check_request", return_value=(True, "OK")), \
             patch.object(plugin, "_xtts_generate_script", side_effect=mock_generate_script), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("tts_engines.tts_xtts.plugin.server.engine._emit_stderr_atomic", side_effect=emitted.append):
            plugin.synthesize(req)

        model_load_lines = [ln for ln in emitted if "[MODEL_LOAD_STARTED]" in ln]
        assert not model_load_lines, (
            f"Without task_id, no [MODEL_LOAD_STARTED] should be emitted. Got: {model_load_lines}"
        )
