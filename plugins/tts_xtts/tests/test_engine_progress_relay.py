"""Tests for the relay_marker progress-marker normalizer in engine.py.

R1 revert-check: before the fix (relay_marker does not exist / returns None for
START_SEGMENT), the assertions on START_SEGMENT and SEGMENT_SAVED formatting
fail, confirming the tests would have caught the bug.

R2 compliance: only module-level helpers are tested; no state-store mocking.
"""
import sys
import threading
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

        with patch.object(plugin, "check_request", return_value=(True, "OK")), \
             patch.object(plugin, "_xtts_generate_script", side_effect=mock_generate_script), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("plugins.tts_xtts.plugin.server.engine._emit_stderr_atomic", side_effect=emitted_lines.append):
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

        with patch.object(plugin, "check_request", return_value=(True, "OK")), \
             patch.object(plugin, "_resolve_voice_inputs", return_value=("ref.wav", None)), \
             patch.object(plugin, "_xtts_generate", side_effect=mock_generate), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("plugins.tts_xtts.plugin.server.engine._emit_stderr_atomic", side_effect=emitted_lines.append):
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

        with patch.object(plugin, "check_request", return_value=(True, "OK")), \
             patch.object(plugin, "_xtts_generate_script", side_effect=mock_generate_script), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("plugins.tts_xtts.plugin.server.engine._emit_stderr_atomic", side_effect=emitted_lines.append):
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

        with patch.object(plugin, "check_request", return_value=(True, "OK")), \
             patch.object(plugin, "_resolve_voice_inputs", return_value=("ref.wav", None)), \
             patch.object(plugin, "_xtts_generate", side_effect=mock_generate), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("plugins.tts_xtts.plugin.server.engine._emit_stderr_atomic", side_effect=emitted_lines.append):
            plugin.synthesize(req)

        assert "Worker output with no task_id\n" in emitted_lines, (
            f"Non-marker lines must be forwarded to stderr even when task_id is None. "
            f"Emitted: {emitted_lines}"
        )
        assert "Another log line\n" in emitted_lines, (
            f"Non-marker lines must be forwarded to stderr even when task_id is None. "
            f"Emitted: {emitted_lines}"
        )


# ---------------------------------------------------------------------------
# Concurrency: _emit_stderr_atomic must not interleave lines from concurrent
# synthesis requests (ENGINE_CLASS_ADMISSION on, cap>1 — 2026-07-06).
# ---------------------------------------------------------------------------

class _SlowSplittingStream:
    """Fake stream whose ``write()`` splits its argument into two physical
    writes with a thread-switch point in between — reproducing the risk that
    ``print(line, file=sys.stderr, flush=True)`` (two separate write() calls:
    content, then the trailing newline) can interleave with another thread's
    write() calls when unsynchronized. Records every physical write() call so
    a test can detect corruption (two callers' fragments landing in the same
    physical line)."""

    def __init__(self, switch_event: threading.Event | None = None):
        self.calls: list[str] = []
        self._switch_event = switch_event

    def write(self, s: str) -> None:
        if not s:
            self.calls.append(s)
            return
        mid = max(1, len(s) // 2)
        self.calls.append(s[:mid])
        if self._switch_event is not None:
            # Yield to whichever other thread is waiting, then let it run
            # briefly before finishing this write — this is what a
            # multi-write-call print() racing another thread's print() can
            # produce at the OS pipe level.
            self._switch_event.set()
            threading.Event().wait(0.01)
        self.calls.append(s[mid:])

    def flush(self) -> None:
        pass


class TestEmitStderrAtomicConcurrency:
    """``_emit_stderr_atomic`` must serialize concurrent emitters so two
    threads' lines are never interleaved into one corrupted physical line —
    the hazard that becomes reachable once two XTTS requests render
    concurrently (ENGINE_CLASS_ADMISSION default-on, 2026-07-06).

    R1 revert-check: replacing ``_emit_stderr_atomic``'s body with a bare
    ``print(line, file=sys.stderr, flush=True)`` (no lock) makes this test
    flaky/failing — reconstructed physical writes interleave two different
    lines' fragments together.
    """

    def test_concurrent_emits_never_interleave(self, monkeypatch):
        from plugins.tts_xtts.plugin.server import engine as engine_module

        fake_stream = _SlowSplittingStream()
        monkeypatch.setattr(engine_module.sys, "stderr", fake_stream)

        line_a = "[PROGRESS] 33% job-parent-seg-0"
        line_b = "[PROGRESS] 40% job-parent-seg-1"
        barrier = threading.Barrier(2)

        def _emit(line: str) -> None:
            barrier.wait(timeout=5)
            engine_module._emit_stderr_atomic(line)

        t1 = threading.Thread(target=_emit, args=(line_a,))
        t2 = threading.Thread(target=_emit, args=(line_b,))
        t1.start()
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)

        written = "".join(fake_stream.calls)
        lines = [ln for ln in written.split("\n") if ln]
        assert sorted(lines) == sorted([line_a, line_b]), (
            "Concurrent _emit_stderr_atomic calls must never interleave into "
            f"a merged/corrupted line. Raw output: {written!r}"
        )

    def test_unsynchronized_writes_would_have_interleaved(self):
        """Sanity check on the fake stream itself: WITHOUT a lock, two threads
        racing raw write() calls on the same stream genuinely can interleave —
        proving the hazard _emit_stderr_atomic's lock actually closes, rather
        than the fake stream being unable to reproduce it."""
        switch_event = threading.Event()
        fake_stream = _SlowSplittingStream(switch_event=switch_event)

        line_a = "[PROGRESS] 33% job-parent-seg-0"
        line_b = "[PROGRESS] 40% job-parent-seg-1"

        def _write_a():
            fake_stream.write(line_a)
            fake_stream.write("\n")

        def _write_b():
            switch_event.wait(timeout=5)
            fake_stream.write(line_b)
            fake_stream.write("\n")

        t1 = threading.Thread(target=_write_a)
        t2 = threading.Thread(target=_write_b)
        t1.start()
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)

        written = "".join(fake_stream.calls)
        lines = [ln for ln in written.split("\n") if ln]
        assert sorted(lines) != sorted([line_a, line_b]), (
            "Expected the unsynchronized fake stream to interleave two "
            f"concurrent writers into a corrupted line; got clean output {written!r} "
            "— the fake stream isn't reproducing the hazard, strengthen it."
        )
