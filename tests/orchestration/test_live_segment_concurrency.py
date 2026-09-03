"""W-PAR task 008 (enable-gate) — wiring live segment concurrency.

These integration tests prove the concurrency claim end to end through REAL
code paths:

  ``app.orchestration.tasks.segment_synthesis.make_dispatch_segment_bridge_call``

Design (owner-approved, 2026-07-03): each ``SegmentSynthesisTask`` child
renders by building a synthetic single-group task + matching ``TaskContext``
and calling ``orchestrator._dispatch_segment`` once. ``_dispatch_segment`` is
closure-pure per call (W-PAR 003), so N children calling it concurrently
through the parent's ``ThreadPoolExecutor`` self-isolate their timing/marker
state — the same isolation ``test_dispatch_isolation.py`` test 1 already
proved for ``_dispatch_segment`` directly.

Routing (owner ruling, R1): for ``engine_id == "mixed"``, the synthetic task's
``run()`` calls ``render_one_group`` directly (NOT ``handle_mixed_job``, which
does chapter-terminal/stitch work that must never fire per-child). For any
other engine, ``_dispatch_segment`` routes through the bridge
(``orchestrator.voice_bridge.synthesize``).

Mock boundaries (R2): ONLY the true engine boundary —
``plugins.tts_mixed.handler.generate_via_bridge`` (what ``_render_segment``
calls into for the actual TTS bridge/subprocess call) — is mocked, to emit a
scripted marker stream through the REAL watchdog ``_drain_stream`` and write a
real (tiny, valid) WAV so ``_is_valid_segment_artifact`` passes. Nothing above
the engine is mocked: ``ChapterSynthesisTask``, ``SegmentSynthesisTask``,
``_dispatch_segment``, ``render_one_group``, ``build_chunk_groups``,
``build_script_entry_for_group``, the progress math, and the stitch barrier
are all real. DB writers/broadcast are stubbed as no-ops (not the unit under
test, never asserted against).

No sleep-based timing (R4): concurrency interleaving is gated with
``threading.Event``, never ``time.sleep``.
"""

from __future__ import annotations

import threading
import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.engines.watchdog import TtsServerWatchdog
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.scheduler.resources import ResourceClaim
from app.orchestration.tasks.segment_synthesis import (
    ChapterSynthesisTask,
    make_dispatch_segment_bridge_call,
)


def _raised_cap_claim(engine_id: str) -> ResourceClaim:
    """Stand-in for a manifest declaring ``max_concurrent_workers`` > 1 (the
    only lever that actually enables visible parallelism, per design) —
    avoids depending on/mutating the real plugin manifest files on disk."""
    return ResourceClaim(gpu=False, vram_mb=0, cpu_heavy=False, exclusive=False, engine_class="cloud", cap=3)


# ---------------------------------------------------------------------------
# Shared harness (mirrors tests/orchestration/test_dispatch_isolation.py)
# ---------------------------------------------------------------------------


class MockStream:
    """Synchronous line source for ``_drain_stream`` — no subprocess, no threads."""

    def __init__(self, lines: list[str]):
        self._lines = list(lines)

    def readline(self) -> str:
        if self._lines:
            return self._lines.pop(0)
        return ""

    def close(self) -> None:
        pass


class MockOrchestrator(OrchestratorHelpersMixin):
    """Minimal orchestrator exposing the real ``_dispatch_segment`` mixin."""

    def __init__(self) -> None:
        self.voice_bridge = MagicMock()
        self.progress_service = MagicMock()
        self.published: list[dict] = []
        self._publish_lock = threading.Lock()

    def _publish(self, **kwargs) -> None:
        with self._publish_lock:
            self.published.append(kwargs)


def _make_segment(seg_id: str, order: int, *, character_id: str, text: str) -> dict:
    """DB-shaped segment row for ``build_chunk_groups`` (distinct character per
    group so groups never coalesce — one child per segment)."""
    return {
        "id": seg_id,
        "character_id": character_id,
        "speaker_profile_name": "narrator",
        "character_speaker_profile_name": None,
        "text_content": text,
        "segment_order": order,
        "audio_status": "pending",
        "audio_file_path": None,
    }


def _chapter_script(groups: int) -> list[dict]:
    """A multi-group chapter script (distinct-character groups -> one group
    per segment when run through build_chunk_groups)."""
    return [
        _make_segment(f"seg-{i}", order=i, character_id=f"char-{i}", text=f"Segment {i} text.")
        for i in range(groups)
    ]


def _write_tiny_wav(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(8000)
        wf.writeframes(b"\x00\x00" * 800)


@pytest.fixture(autouse=True)
def _reset_semaphores(monkeypatch):
    from app.orchestration.scheduler import resources as _res  # noqa: PLC0415
    # These tests exercise real concurrent admission through
    # reserve_task_resources (via each child's real run()) — enable
    # per-engine-class admission so multiple children of the SAME engine can
    # be admitted concurrently, matching the eventual live enable-gate rather
    # than the ships-dark single exclusive gate.
    monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
    for sem in list(_res._engine_semaphores.values()):
        sem.reset()
    _res._global_cap_gate.reset()
    yield
    for sem in list(_res._engine_semaphores.values()):
        sem.reset()
    _res._global_cap_gate.reset()


def _fake_script_entry(group: dict, chapter_dir: Path, **kw) -> dict:
    """Stand-in for build_script_entry_for_group that avoids touching real
    speaker-profile DB rows (out of scope for this test — group already
    carries text_parts/segments)."""
    leader_id = group["segments"][0]["id"]
    text = " ".join(group["text_parts"])
    return {
        "text": text,
        "speaker_wav": None,
        "id": leader_id,
        "ids": [s["id"] for s in group["segments"]],
        "save_path": str((chapter_dir / "segments" / f"{leader_id}.wav").absolute()),
        "weight": max(1, len(text)),
        "engine": group.get("engine", "mixed"),
    }


# ---------------------------------------------------------------------------
# Test 1 — end-to-end fan-out, per-group task_ids isolated in the marker stream
# ---------------------------------------------------------------------------


def test_parent_fanout_dispatch_segment_reuse_isolates_children(tmp_path):
    """cap=2 fan-out of a 3-group mixed-engine chapter, each child rendering
    via the ``_dispatch_segment`` reuse mechanism (``render_one_group`` for
    mixed), keeps per-child marker/timing state fully isolated — no
    cross-contamination between concurrent children.
    """
    orc = MockOrchestrator()

    # Each child's _dispatch_segment call runs on its own ThreadPoolExecutor
    # worker thread for the duration of its dispatch (register + drive +
    # unregister all happen before that thread picks up its next child), so
    # thread identity is a safe per-child watchdog isolation key here.
    watchdogs: dict[str, TtsServerWatchdog] = {}

    def _watchdog_get_active():
        return watchdogs.setdefault(threading.current_thread().name, TtsServerWatchdog())

    def _fake_generate_via_bridge_threadkeyed(**kwargs):
        task_id = kwargs["task_id"]
        out_wav = kwargs["out_wav"]
        on_output = kwargs["on_output"]
        wd = watchdogs.setdefault(threading.current_thread().name, TtsServerWatchdog())
        _write_tiny_wav(out_wav)
        wd._drain_stream(None, "stdout", MockStream([f"[ENGINE_ACTIVITY_STARTED] {task_id}\n"]))
        wd._drain_stream(None, "stdout", MockStream([
            f"[START_SYNTHESIS] {task_id}\n",
            f"[PROGRESS] 100% {task_id}\n",
        ]))
        on_output(f"[stub] wrote {out_wav}\n")
        return 0

    bridge_call = make_dispatch_segment_bridge_call(orc)

    task = ChapterSynthesisTask(
        task_id="chap-conc",
        engine_id="mixed",
        chapter_id="chapter-conc",
        project_id="proj-1",
        output_path=str(tmp_path / "chap-conc.wav"),
        script=_chapter_script(3),
        max_concurrent_workers=2,
        bridge_call=bridge_call,
    )

    with patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=_fake_generate_via_bridge_threadkeyed), \
         patch("app.engines.watchdog.get_watchdog", side_effect=_watchdog_get_active), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.build_script_entry_for_group", side_effect=_fake_script_entry), \
         patch("app.db.speakers.get_speaker_settings", return_value={}), \
         patch("app.engines.behavior.extract_engine_settings", return_value={}), \
         patch("app.db.update_segment", lambda *a, **kw: None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_tts_log_line", lambda *a, **kw: None), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.orchestration.tasks.segment_synthesis._manifest_resource_claim", side_effect=_raised_cap_claim):
        result = task.run()

    assert result.status == "completed", f"expected completed, got {result}"

    seen_task_ids = {
        e.get("active_segment_id")
        for e in orc.published
        if e.get("active_segment_id")
    }
    assert seen_task_ids == {"seg-0", "seg-1", "seg-2"}, (
        f"expected one active segment per group; got {seen_task_ids}"
    )


# ---------------------------------------------------------------------------
# Test 2 — stitch barrier fires exactly once, in manuscript order
# ---------------------------------------------------------------------------


def test_stitch_called_once_in_manuscript_order_regardless_of_completion_order(tmp_path):
    """INV-2: the parent stitch callback fires exactly once, after ALL
    children join, with paths sorted by manuscript (segment_order), even when
    children complete out of order.
    """
    orc = MockOrchestrator()
    watchdogs: dict[str, TtsServerWatchdog] = {}

    # Force reverse completion order: seg-0 waits for seg-2 to finish first.
    seg2_done = threading.Event()

    def _fake_generate_via_bridge(**kwargs):
        task_id = kwargs["task_id"]
        out_wav = kwargs["out_wav"]
        on_output = kwargs["on_output"]
        leader = Path(str(out_wav)).stem
        if leader == "seg-0":
            seg2_done.wait(timeout=10)
        wd = watchdogs.setdefault(threading.current_thread().name, TtsServerWatchdog())
        _write_tiny_wav(out_wav)
        wd._drain_stream(None, "stdout", MockStream([
            f"[START_SYNTHESIS] {task_id}\n",
            f"[PROGRESS] 100% {task_id}\n",
        ]))
        on_output(f"[stub] wrote {out_wav}\n")
        if leader == "seg-2":
            seg2_done.set()
        return 0

    stitch_calls: list[list[str]] = []

    def _stitch(paths: list[str]) -> None:
        stitch_calls.append(list(paths))

    bridge_call = make_dispatch_segment_bridge_call(orc)

    task = ChapterSynthesisTask(
        task_id="chap-stitch",
        engine_id="mixed",
        chapter_id="chapter-stitch",
        project_id="proj-1",
        output_path=str(tmp_path / "chap-stitch.wav"),
        script=_chapter_script(3),
        max_concurrent_workers=3,
        bridge_call=bridge_call,
        stitch_fn=_stitch,
    )

    with patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=_fake_generate_via_bridge), \
         patch("app.engines.watchdog.get_watchdog", side_effect=lambda: watchdogs.setdefault(threading.current_thread().name, TtsServerWatchdog())), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.build_script_entry_for_group", side_effect=_fake_script_entry), \
         patch("app.db.speakers.get_speaker_settings", return_value={}), \
         patch("app.engines.behavior.extract_engine_settings", return_value={}), \
         patch("app.db.update_segment", lambda *a, **kw: None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_tts_log_line", lambda *a, **kw: None), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.orchestration.tasks.segment_synthesis._manifest_resource_claim", side_effect=_raised_cap_claim):
        result = task.run()

    assert result.status == "completed", f"expected completed, got {result}"
    assert len(stitch_calls) == 1, "stitch must be invoked exactly once (INV-2 barrier)"

    stitched = stitch_calls[0]
    stitched_leaders = [Path(p).stem for p in stitched]
    assert stitched_leaders == ["seg-0", "seg-1", "seg-2"], (
        f"stitch order must be manuscript order, not completion order; got {stitched_leaders}"
    )
