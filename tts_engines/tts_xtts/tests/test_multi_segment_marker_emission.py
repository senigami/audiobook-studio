"""Regression test: XTTS multi-segment marker emission path (Task 012).

VERDICT: The emission path already flows correctly for real multi-segment renders.

Evidence:
- xtts_inference.py (both main() and _run_serve_job()) emits per-segment:
    1. [START_SYNTHESIS] {task_id} once, before the segment loop.
    2. [START_SEGMENT] {id_or_save_path}  for EACH segment.
    3. [PROGRESS] {pct}% [{task_id}]  after EACH sentence within a segment.
    4. [SEGMENT_SAVED] {save_path}    after EACH segment is written.
- relay_marker() in engine.py correctly appends task_id to START_SEGMENT /
  SEGMENT_SAVED and passes through START_SYNTHESIS / PROGRESS unchanged.
- _drain_stream() in watchdog.py correctly extracts task_id from all four
  marker formats and delivers (line, task_id) to the log_listener.
- log_listener() in orchestrator_helpers._dispatch() credits progress for each
  marker type (proven by test_b8_progress_advances_within_group2 in
  test_watchdog_progress_logic.py).

No fixes were needed.  This file adds:
  T1 — multi-segment engine output ordering (full sequence, relay via
       parse_output / relay_marker to stderr).
  T2 — watchdog _drain_stream correctly extracts task_id from PROGRESS lines
       (the position-1 format `[PROGRESS] {pct}% {task_id}`).
  T3 — end-to-end: multi-segment marker stream reaches the log_listener
       and credit path with correct ordering.

R1 revert-check notes:
- T1 would fail if relay_marker returned None for [PROGRESS] lines (it passes
  through), or if the multi-segment mock omitted intra-segment ticks.
- T2 would fail if _drain_stream checked position 0 instead of position 1 for
  the task_id in [PROGRESS] lines.
- T3 would fail if the log_listener's `line_task_id != context.task_id` guard
  filtered out matching PROGRESS lines or if active_seg_id were not set by the
  preceding START_SEGMENT.

R2 compliance: mocked boundaries are the actual XTTS model (never run real
synthesis), filesystem (wav files), and time.  No mocking of relay_marker or
log_listener internals.
R4: no sleeps; all marker/output calls are synchronous.
"""
from __future__ import annotations

import sys
from typing import Optional
from unittest.mock import MagicMock, patch

import pytest

from tts_engines.tts_xtts.plugin.server.engine import relay_marker, XttsPlugin
from app.engines.voice.sdk import TTSRequest
from app.engines.watchdog import TtsServerWatchdog
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.tasks.base import TaskContext, StudioTask, TaskResult


# ---------------------------------------------------------------------------
# T1 — multi-segment full-sequence relay through parse_output
# ---------------------------------------------------------------------------

class TestMultiSegmentRelayOrdering:
    """T1: parse_output relays the full per-segment marker sequence to stderr.

    Simulate a 3-segment synthesis.  Each segment must produce:
      [START_SEGMENT] {sid} {task_id}   on start
      [PROGRESS] {pct}%  {task_id}     for each sentence (at least one per seg)
      [SEGMENT_SAVED] {path} {task_id}  on save

    The [START_SYNTHESIS] marker must appear exactly once, before any segment.

    R1 revert-check: if relay_marker is stripped or returns None for PROGRESS,
    the PROGRESS assertions below fail.  If START_SEGMENT or SEGMENT_SAVED are
    dropped, those assertions fail.
    """

    def _run_synthesize_with_fake_generator(self, tmp_path, script_lines):
        """Run XttsPlugin.synthesize() with a mock script generator.

        script_lines: list of output lines the fake generator produces.
        Returns (emitted_to_stderr, timing_events).
        """
        plugin = XttsPlugin()
        script = [
            {"id": f"seg-{i}", "text": "Hello world.", "save_path": str(tmp_path / f"seg-{i}.wav")}
            for i in range(3)
        ]
        req = TTSRequest(
            text="",
            output_path=str(tmp_path / "out.wav"),
            script=script,
            task_id="task-multiseg",
            settings={"speed": 1.0},
        )

        emitted_lines: list[str] = []

        def mock_generate_script(script_json_path, out_wav, on_output, cancel_check,
                                  speed, task_id, engine_settings=None):
            for line in script_lines:
                on_output(line)
            return 0

        with patch.object(plugin, "check_request", return_value=(True, "OK")), \
             patch.object(plugin, "_xtts_generate_script", side_effect=mock_generate_script), \
             patch("pathlib.Path.exists", return_value=True), \
             patch("tts_engines.tts_xtts.plugin.server.engine._emit_stderr_atomic", side_effect=emitted_lines.append):
            plugin.synthesize(req)

        return emitted_lines

    def test_all_four_marker_types_emitted_for_each_segment(self, tmp_path):
        """All four marker types must be forwarded to stderr per segment."""
        script_lines = [
            "[START_SYNTHESIS] task-multiseg\n",
            "[START_SEGMENT] seg-0\n",
            "[PROGRESS] 33% task-multiseg\n",
            "[PROGRESS] 66% task-multiseg\n",
            "[PROGRESS] 100% task-multiseg\n",
            "[SEGMENT_SAVED] /tmp/seg-0.wav\n",
            "[START_SEGMENT] seg-1\n",
            "[PROGRESS] 50% task-multiseg\n",
            "[PROGRESS] 100% task-multiseg\n",
            "[SEGMENT_SAVED] /tmp/seg-1.wav\n",
            "[START_SEGMENT] seg-2\n",
            "[PROGRESS] 100% task-multiseg\n",
            "[SEGMENT_SAVED] /tmp/seg-2.wav\n",
        ]
        emitted = self._run_synthesize_with_fake_generator(tmp_path, script_lines)

        # START_SYNTHESIS passes through once
        synthesis_lines = [line for line in emitted if "[START_SYNTHESIS]" in line]
        assert len(synthesis_lines) == 1, (
            f"Expected exactly one [START_SYNTHESIS] line, got {synthesis_lines}"
        )
        assert synthesis_lines[0] == "[START_SYNTHESIS] task-multiseg"

        # Each segment must have a START_SEGMENT with task_id appended
        for i in range(3):
            expected = f"[START_SEGMENT] seg-{i} task-multiseg"
            assert expected in emitted, (
                f"Missing START_SEGMENT for seg-{i}: expected {expected!r} in {emitted}"
            )

        # Each segment must have at least one PROGRESS line relayed unchanged
        progress_lines = [line for line in emitted if line.startswith("[PROGRESS]")]
        assert len(progress_lines) >= 6, (
            f"Expected >=6 PROGRESS lines (2-3 per segment × 3 segments), "
            f"got {len(progress_lines)}: {progress_lines}"
        )
        # PROGRESS lines pass through unchanged
        for pl in progress_lines:
            assert "task-multiseg" in pl, f"PROGRESS line missing task_id: {pl!r}"

        # Each segment must have a SEGMENT_SAVED with task_id appended
        expected_suffix = "task-multiseg"
        for i in range(3):
            saved_lines = [
                line for line in emitted
                if "[SEGMENT_SAVED]" in line and f"seg-{i}" in line
            ]
            assert saved_lines, f"No SEGMENT_SAVED for seg-{i} in {emitted}"
            assert all(expected_suffix in line for line in saved_lines), (
                f"SEGMENT_SAVED for seg-{i} missing task_id: {saved_lines}"
            )

    def test_marker_order_within_segment(self, tmp_path):
        """Markers must arrive in the correct order: START_SEGMENT → PROGRESS* → SEGMENT_SAVED."""
        script_lines = [
            "[START_SYNTHESIS] task-multiseg\n",
            "[START_SEGMENT] seg-0\n",
            "[PROGRESS] 50% task-multiseg\n",
            "[PROGRESS] 100% task-multiseg\n",
            "[SEGMENT_SAVED] /tmp/seg-0.wav\n",
        ]
        emitted = self._run_synthesize_with_fake_generator(tmp_path, script_lines)

        # Find positions of the markers for seg-0
        positions = {}
        for idx, line in enumerate(emitted):
            if "[START_SYNTHESIS]" in line:
                positions["start_synthesis"] = idx
            elif "[START_SEGMENT] seg-0" in line:
                positions["start_segment"] = idx
            elif "[PROGRESS]" in line:
                positions.setdefault("first_progress", idx)
                positions["last_progress"] = idx
            elif "[SEGMENT_SAVED]" in line and "seg-0" in line:
                positions["segment_saved"] = idx

        assert "start_synthesis" in positions, "START_SYNTHESIS not emitted"
        assert "start_segment" in positions, "START_SEGMENT not emitted"
        assert "first_progress" in positions, "No PROGRESS emitted"
        assert "segment_saved" in positions, "SEGMENT_SAVED not emitted"

        # Order invariant
        assert positions["start_synthesis"] < positions["start_segment"], (
            "START_SYNTHESIS must come before START_SEGMENT"
        )
        assert positions["start_segment"] < positions["first_progress"], (
            "START_SEGMENT must come before first PROGRESS"
        )
        assert positions["last_progress"] < positions["segment_saved"], (
            "PROGRESS lines must come before SEGMENT_SAVED"
        )

    def test_progress_relay_unchanged(self, tmp_path):
        """PROGRESS lines pass through relay_marker unchanged (no task_id appended)."""
        # relay_marker is not supposed to append task_id to PROGRESS; it passes through.
        result = relay_marker("[PROGRESS] 75% task-multiseg", "task-multiseg")
        assert result == "[PROGRESS] 75% task-multiseg", (
            f"PROGRESS must pass through unchanged, got {result!r}"
        )

        # Also: PROGRESS without task_id passes through
        result_no_tid = relay_marker("[PROGRESS] 25%", "task-multiseg")
        assert result_no_tid == "[PROGRESS] 25%", (
            f"PROGRESS without task_id must pass through unchanged, got {result_no_tid!r}"
        )

    def test_non_marker_lines_are_forwarded_raw(self, tmp_path):
        """W-MIX-LA fix: non-marker worker log lines MUST be forwarded raw to stderr.

        R1 revert-check: on pre-fix code (the else-branch absent) non-marker lines
        are NOT printed — this assertion would fail, confirming the test catches the bug.
        """
        script_lines = [
            "Loading XTTS model weights...\n",
            "[START_SYNTHESIS] task-multiseg\n",
            "[START_SEGMENT] seg-0\n",
            "Encoding latents for speaker...\n",
            "[PROGRESS] 100% task-multiseg\n",
            "[SEGMENT_SAVED] /tmp/seg-0.wav\n",
            "Finished segment 0.\n",
        ]
        emitted = self._run_synthesize_with_fake_generator(tmp_path, script_lines)
        # Non-marker lines must now be forwarded raw (W-MIX-LA fix).
        assert "Loading XTTS model weights...\n" in emitted, (
            f"Expected raw non-marker line to be forwarded. Emitted: {emitted}"
        )
        assert "Encoding latents for speaker...\n" in emitted, (
            f"Expected raw non-marker line to be forwarded. Emitted: {emitted}"
        )
        assert "Finished segment 0.\n" in emitted, (
            f"Expected raw non-marker line to be forwarded. Emitted: {emitted}"
        )


# ---------------------------------------------------------------------------
# T2 — watchdog _drain_stream extracts task_id from [PROGRESS] lines
# ---------------------------------------------------------------------------

class TestWatchdogProgressTaskIdExtraction:
    """T2: _drain_stream correctly parses task_id from [PROGRESS] markers.

    The XTTS inference script emits [PROGRESS] {pct}% {task_id} (task_id at
    position 1 after the pct).  The watchdog must correlate these lines to the
    right job so the log_listener filter works correctly.

    R1 revert-check: if _drain_stream read sub_parts[0] instead of sub_parts[1]
    for the task_id in [PROGRESS] lines, it would extract '50%' (the pct token)
    as the task_id instead of the real task_id, causing the log_listener to
    silently discard all PROGRESS updates.
    """

    def test_progress_task_id_extracted_correctly(self):
        """[PROGRESS] {pct}% {task_id} — task_id must be the second token."""
        wd = TtsServerWatchdog()
        received: list[tuple[str, Optional[str]]] = []

        def listener(line: str, task_id: Optional[str] = None):
            received.append((line, task_id))

        wd.register_log_listener(listener)

        class MockStream:
            def __init__(self, lines):
                self._lines = list(lines)
                self._idx = 0
            def readline(self):
                if self._idx < len(self._lines):
                    val = self._lines[self._idx]
                    self._idx += 1
                    return val
                return ""
            def close(self):
                pass

        stream = MockStream([
            "[PROGRESS] 25% task-abc\n",
            "[PROGRESS] 50% task-abc\n",
            "[PROGRESS] 75% task-abc\n",
        ])
        wd._drain_stream(None, "stderr", stream)

        assert len(received) == 3, f"Expected 3 events, got {len(received)}"
        for line, task_id in received:
            assert task_id == "task-abc", (
                f"Expected task_id='task-abc', got {task_id!r} for line {line!r}"
            )

    def test_progress_without_task_id_yields_none(self):
        """[PROGRESS] {pct}% without task_id must yield task_id=None."""
        wd = TtsServerWatchdog()
        received: list[tuple[str, Optional[str]]] = []

        def listener(line: str, task_id: Optional[str] = None):
            received.append((line, task_id))

        wd.register_log_listener(listener)

        class MockStream:
            def __init__(self, lines):
                self._lines = list(lines)
                self._idx = 0
            def readline(self):
                if self._idx < len(self._lines):
                    val = self._lines[self._idx]
                    self._idx += 1
                    return val
                return ""
            def close(self):
                pass

        stream = MockStream(["[PROGRESS] 50%\n"])
        wd._drain_stream(None, "stderr", stream)

        # Single token after [PROGRESS] is the pct, not a task_id → None
        assert len(received) == 1
        _, task_id = received[0]
        assert task_id is None, (
            f"Single-token PROGRESS should yield task_id=None, got {task_id!r}"
        )

    def test_start_segment_task_id_extracted_from_position_1(self):
        """[START_SEGMENT] {sid} {task_id} — task_id must be at position 1."""
        wd = TtsServerWatchdog()
        received: list[tuple[str, Optional[str]]] = []

        def listener(line: str, task_id: Optional[str] = None):
            received.append((line, task_id))

        wd.register_log_listener(listener)

        class MockStream:
            def __init__(self, lines):
                self._lines = list(lines)
                self._idx = 0
            def readline(self):
                if self._idx < len(self._lines):
                    val = self._lines[self._idx]
                    self._idx += 1
                    return val
                return ""
            def close(self):
                pass

        stream = MockStream(["[START_SEGMENT] seg-0 task-xyz\n"])
        wd._drain_stream(None, "stderr", stream)

        assert len(received) == 1
        _, task_id = received[0]
        assert task_id == "task-xyz", (
            f"START_SEGMENT task_id should be 'task-xyz', got {task_id!r}"
        )

    def test_segment_saved_task_id_extracted_from_position_1(self):
        """[SEGMENT_SAVED] {path} {task_id} — task_id must be at position 1."""
        wd = TtsServerWatchdog()
        received: list[tuple[str, Optional[str]]] = []

        def listener(line: str, task_id: Optional[str] = None):
            received.append((line, task_id))

        wd.register_log_listener(listener)

        class MockStream:
            def __init__(self, lines):
                self._lines = list(lines)
                self._idx = 0
            def readline(self):
                if self._idx < len(self._lines):
                    val = self._lines[self._idx]
                    self._idx += 1
                    return val
                return ""
            def close(self):
                pass

        stream = MockStream(["[SEGMENT_SAVED] /tmp/seg-0.wav task-xyz\n"])
        wd._drain_stream(None, "stderr", stream)

        assert len(received) == 1
        _, task_id = received[0]
        assert task_id == "task-xyz", (
            f"SEGMENT_SAVED task_id should be 'task-xyz', got {task_id!r}"
        )


# ---------------------------------------------------------------------------
# T3 — end-to-end: multi-segment marker stream reaches log_listener credit path
# ---------------------------------------------------------------------------

class MockOrchestrator(OrchestratorHelpersMixin):
    def __init__(self, voice_bridge):
        self.voice_bridge = voice_bridge
        self.published = []

    def _publish(self, **kwargs):
        self.published.append(kwargs)


class MultiSegmentScriptTask(StudioTask):
    """3-segment script task — mirrors a real multi-segment chapter render."""

    def __init__(self, bridge):
        self.bridge = bridge
        self.script = [
            {"id": "seg-a", "ids": ["seg-a"], "text": "Hello world one.", "save_path": "/tmp/seg-a.wav", "weight": 40},
            {"id": "seg-b", "ids": ["seg-b"], "text": "Hello world two.", "save_path": "/tmp/seg-b.wav", "weight": 40},
            {"id": "seg-c", "ids": ["seg-c"], "text": "Hello world three.", "save_path": "/tmp/seg-c.wav", "weight": 20},
        ]

    def get_expected_duration(self, text: str, engine_id: str) -> float:
        return 30.0

    def describe(self):
        return TaskContext(
            task_id="ms-render-1",
            task_type="synthesis",
            payload={"script_text": "Hello world one. Hello world two. Hello world three.", "engine_id": "xtts"},
        )

    @property
    def prefers_local_execution(self) -> bool:
        return True

    def run(self):
        self.bridge.synthesize({"text": "test"})
        return TaskResult(status="completed")


class MockStream:
    def __init__(self, lines):
        self.lines = lines

    def __iter__(self):
        return iter(self.lines)

    def close(self):
        pass


def test_multi_segment_progress_advances_through_all_segments(monkeypatch):
    """T3 end-to-end: 3-segment marker stream produces monotonically advancing progress.

    Simulates a real multi-segment render where each segment emits:
      [START_SYNTHESIS] (once), [START_SEGMENT], multiple [PROGRESS] ticks,
      [SEGMENT_SAVED].

    Asserts:
      1. At least one SEGMENT_PROGRESS event per segment.
      2. Overall grouped progress is strictly monotonically non-decreasing.
      3. After all 3 SEGMENT_SAVED events, the final grouped_progress > 0.

    R1 revert-check: if _drain_stream does NOT extract task_id from [PROGRESS]
    lines (uses position 0 instead of 1), the log_listener's task_id filter
    discards PROGRESS lines, no SEGMENT_PROGRESS events are emitted, and
    assertion 1 fails.
    If active_seg_id is None when PROGRESS arrives (START_SEGMENT missed),
    grouped progress remains frozen at 0.0 across all PROGRESS events.
    """
    bridge = MagicMock()
    orc = MockOrchestrator(voice_bridge=bridge)
    task = MultiSegmentScriptTask(bridge)
    context = task.describe()
    wd = TtsServerWatchdog()

    monkeypatch.setattr("app.db.update_segments_bulk", lambda *a, **kw: None, raising=False)

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None):

        def side_effect(*args, **kwargs):
            # Full 3-segment marker stream: START_SYNTHESIS once, then per-segment
            # START_SEGMENT + intra-segment PROGRESS + SEGMENT_SAVED.
            wd._drain_stream(None, "stdout", MockStream([
                "[START_SYNTHESIS] ms-render-1\n",
                # Segment A
                "[START_SEGMENT] seg-a ms-render-1\n",
                "[PROGRESS] 33% ms-render-1\n",
                "[PROGRESS] 66% ms-render-1\n",
                "[PROGRESS] 100% ms-render-1\n",
                "[SEGMENT_SAVED] /tmp/seg-a.wav ms-render-1\n",
                # Segment B
                "[START_SEGMENT] seg-b ms-render-1\n",
                "[PROGRESS] 50% ms-render-1\n",
                "[PROGRESS] 100% ms-render-1\n",
                "[SEGMENT_SAVED] /tmp/seg-b.wav ms-render-1\n",
                # Segment C
                "[START_SEGMENT] seg-c ms-render-1\n",
                "[PROGRESS] 100% ms-render-1\n",
                "[SEGMENT_SAVED] /tmp/seg-c.wav ms-render-1\n",
            ]))
            return {"status": "ok"}

        bridge.synthesize.side_effect = side_effect
        orc.progress_service = MagicMock()

        orc._dispatch(task=task, context=context)

    running = [e for e in orc.published if e.get("status") == "running" and e.get("progress") is not None]

    # 1. Each segment must have produced at least one SEGMENT_PROGRESS event
    for seg_id in ("seg-a", "seg-b", "seg-c"):
        seg_progress_events = [
            e for e in running
            if e.get("reason_code") == "SEGMENT_PROGRESS"
            and e.get("active_segment_id") == seg_id
        ]
        assert seg_progress_events, (
            f"No SEGMENT_PROGRESS events for {seg_id}. "
            f"All reason_codes: {[e.get('reason_code') for e in running]}"
        )

    # 2. Overall progress must be monotonically non-decreasing
    progress_values = [e["progress"] for e in running]
    for i in range(1, len(progress_values)):
        assert progress_values[i] >= progress_values[i - 1], (
            f"Progress regressed at index {i}: {progress_values[i - 1]} → {progress_values[i]}"
        )

    # 3. After 3 SEGMENT_SAVED events, grouped_progress must be above zero
    saved_events = [e for e in running if e.get("reason_code") == "SEGMENT_SAVED"]
    assert len(saved_events) == 3, f"Expected 3 SEGMENT_SAVED events, got {len(saved_events)}"
    final_progress = running[-1]["progress"]
    assert final_progress > 0.0, (
        f"After 3 segments completed, progress must be > 0, got {final_progress}"
    )


def test_intra_segment_progress_advances_within_group(monkeypatch):
    """T3 within-group: PROGRESS ticks within a segment advance grouped_progress.

    This directly verifies that intra-segment PROGRESS lines — the per-sentence
    ticks that fire within a single segment's synthesis loop — actually advance
    the orchestrator's grouped_progress value for that segment.

    R1 revert-check: if active_seg_id[0] is None when PROGRESS fires (because
    START_SEGMENT was dropped or the dedup guard fired erroneously), active_w=0
    and every PROGRESS publishes the same frozen grouped_progress value.
    """
    bridge = MagicMock()
    orc = MockOrchestrator(voice_bridge=bridge)
    task = MultiSegmentScriptTask(bridge)
    context = task.describe()
    wd = TtsServerWatchdog()

    monkeypatch.setattr("app.db.update_segments_bulk", lambda *a, **kw: None, raising=False)

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None):

        def side_effect(*args, **kwargs):
            # Only segment A, with three progressive PROGRESS ticks
            wd._drain_stream(None, "stdout", MockStream([
                "[START_SYNTHESIS] ms-render-1\n",
                "[START_SEGMENT] seg-a ms-render-1\n",
                "[PROGRESS] 33% ms-render-1\n",
                "[PROGRESS] 66% ms-render-1\n",
                "[PROGRESS] 100% ms-render-1\n",
            ]))
            return {"status": "ok"}

        bridge.synthesize.side_effect = side_effect
        orc.progress_service = MagicMock()

        orc._dispatch(task=task, context=context)

    seg_a_progress = [
        e["progress"]
        for e in orc.published
        if e.get("status") == "running"
        and e.get("reason_code") == "SEGMENT_PROGRESS"
        and e.get("active_segment_id") == "seg-a"
    ]

    assert len(seg_a_progress) == 3, (
        f"Expected 3 SEGMENT_PROGRESS events for seg-a (one per tick), "
        f"got {len(seg_a_progress)}: {seg_a_progress}"
    )

    # Within-segment progress must increase with each tick
    assert seg_a_progress[0] < seg_a_progress[1] < seg_a_progress[2], (
        f"Intra-segment progress must be strictly increasing: {seg_a_progress}"
    )
