"""W-PAR 008 (enable-gate) — cap=1 equivalence gate (INV-1, ship-dark).

The single most important regression gate in this epic: at cap=1 (today's
default, no manifest raising ``max_concurrent_workers``), the NEW live path
(``ChapterSynthesisTask`` fanning exactly ONE child via
``make_dispatch_segment_bridge_call``) must emit the SAME per-segment marker
event sequence as the OLD live path (``SynthesisTask`` with
``engine_id="mixed"`` -> ``handle_mixed_job``) for an identical single-group
chapter render.

Both paths ultimately dispatch their one group's worth of work through
``_dispatch_segment`` (W-PAR 003's per-segment isolation machinery) — the OLD
path via ``SynthesisTask.run()`` -> ``handle_mixed_job``'s single-group loop
body, called INSIDE ``_dispatch_segment``'s local-execution branch; the NEW
path via the child's synthetic single-group task, ALSO dispatched through
``_dispatch_segment`` (one level of fan-out down, reached via
``make_dispatch_segment_bridge_call``). Since both routes funnel through the
identical ``_dispatch_segment`` machinery for their one group, their emitted
(status, reason_code, progress) event sequences must match exactly.

Deliberate, documented difference (NOT a regression): the chapter-terminal
100%-completion event is published on a DIFFERENT channel for each path —
the OLD path's terminal write flows through ``orchestrator._publish``/
``submit()``'s own final ``completed`` frame; the NEW path's chapter-level
terminal write is ``ChapterSynthesisTask._publish_progress`` calling
``progress_service.publish()`` directly, because a chapter fan-out
coordinator bypasses ``_dispatch_segment`` entirely at the PARENT level (R4
dispatch branch — the parent renders nothing itself). This test therefore
compares the CHILD-level marker event sequence (identical machinery on both
paths), not the outer ``submit()``-level terminal frame.

Mock boundaries (R2): the true engine boundary only —
``plugins.tts_mixed.handler.generate_via_bridge`` (what ``_render_segment``
calls into). Real ``build_chunk_groups``, ``build_script_entry_for_group``,
``render_one_group``, ``handle_mixed_job`` (old path), and
``ChapterSynthesisTask``/``SegmentSynthesisTask`` (new path) drive the render.
"""

from __future__ import annotations

import threading
import wave
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.engines.watchdog import TtsServerWatchdog
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.tasks.segment_synthesis import (
    ChapterSynthesisTask,
    make_dispatch_segment_bridge_call,
)
from app.orchestration.tasks.synthesis import SynthesisTask


class MockStream:
    def __init__(self, lines: list[str]):
        self._lines = list(lines)

    def readline(self) -> str:
        if self._lines:
            return self._lines.pop(0)
        return ""

    def close(self) -> None:
        pass


class MockOrchestrator(OrchestratorHelpersMixin):
    """Real ``_dispatch``/``_dispatch_segment`` mixin — the R4
    ``is_chapter_fanout`` branch lives in ``orchestrator_helpers._dispatch``
    itself, so this harness exercises the actual production routing rule."""

    def __init__(self) -> None:
        self.voice_bridge = MagicMock()
        self.progress_service = MagicMock()
        self.published: list[dict] = []
        self._publish_lock = threading.Lock()

    def _publish(self, **kwargs) -> None:
        with self._publish_lock:
            self.published.append(kwargs)


def _event_key_sequence(published: list[dict]) -> list[tuple]:
    """Extract the comparable (status, reason_code, progress) tuple sequence."""
    return [
        (e.get("status"), e.get("reason_code"), e.get("progress"))
        for e in published
    ]


@pytest.fixture(autouse=True)
def _reset_semaphores():
    from app.orchestration.scheduler import resources as _res  # noqa: PLC0415
    for sem in list(_res._engine_semaphores.values()):
        sem.reset()
    _res._global_cap_gate.reset()
    yield
    for sem in list(_res._engine_semaphores.values()):
        sem.reset()
    _res._global_cap_gate.reset()


def _write_wav(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(8000)
        wf.writeframes(b"\x00\x00" * 800)


def test_cap1_single_group_marker_sequence_matches_old_vs_new_path(tmp_path):
    """INV-1 ship-dark gate: identical single-group chapter render through
    the OLD (SynthesisTask/handle_mixed_job) and NEW (ChapterSynthesisTask,
    max_concurrent_workers=1) paths must emit the SAME per-segment marker
    event sequence via _dispatch_segment.
    """
    from app.db.projects import create_project
    from app.db.chapters import create_chapter
    from app.db.segments import sync_chapter_segments, get_chapter_segments

    pid = create_project("Cap1EquivProject")
    cid = create_chapter(pid, "Cap1EquivChapter", "Hello world.")
    sync_chapter_segments(cid, "Hello world.")
    segments = get_chapter_segments(cid)
    assert len(segments) == 1

    chapter_dir = tmp_path / "chapter"

    def _make_fake_generate_via_bridge(wd: TtsServerWatchdog):
        def _fake_generate_via_bridge(**kwargs):
            task_id = kwargs["task_id"]
            out_wav = kwargs["out_wav"]
            on_output = kwargs["on_output"]
            _write_wav(out_wav)
            # Drive the SAME marker stream for both paths, through the SAME
            # watchdog instance _dispatch_segment registered its listener on
            # (task_id differs by construction — the OLD path uses the parent
            # job id, the NEW path uses the synthetic child's own id — this is
            # the expected/documented per-segment marker isolation, W-PAR 003).
            wd._drain_stream(None, "stdout", MockStream([f"[ENGINE_ACTIVITY_STARTED] {task_id}\n"]))
            wd._drain_stream(None, "stdout", MockStream([
                f"[START_SYNTHESIS] {task_id}\n",
                f"[PROGRESS] 100% {task_id}\n",
            ]))
            on_output(f"[stub] wrote {out_wav}\n")
            return 0
        return _fake_generate_via_bridge

    def _common_patches(wd: TtsServerWatchdog):
        return [
            patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=_make_fake_generate_via_bridge(wd)),
            patch("app.core.config.get_chapter_dir", return_value=chapter_dir),
            patch("tts_engines.tts_mixed.handler.get_chapter_dir", return_value=chapter_dir),
            # A real profile_name + resolved engine are required for
            # _render_segment's own validation (a falsy profile_name/engine
            # short-circuits to a failure before generate_via_bridge is ever
            # reached) — both paths use the SAME resolved values. Resolving to
            # "mixed" keeps BOTH paths in the local-execution branch
            # (handle_mixed_job for OLD, render_one_group for NEW) rather than
            # one of them falling through to the bridge-routing branch (which
            # would compare a different _dispatch_segment code path).
            patch("app.domain.chunk_groups.resolve_profile_engine", return_value="mixed"),
            patch("app.db.speakers.get_speaker_settings", return_value={}),
            patch("app.engines.behavior.extract_engine_settings", return_value={}),
            patch("app.db.update_segment", lambda *a, **kw: None),
            patch("app.db.update_segments_bulk", lambda *a, **kw: None),
            # #232 Task 003: the write-back fingerprint guard is a NEW real-DB
            # call site alongside update_segments_bulk above (both funnel into
            # from the same [SEGMENT_SAVED] handler once a group carries
            # captured fingerprints) -- mock it the same no-op way, or this
            # test's real seeded segment would actually get written to
            # (audio_status='done'), letting the OLD path record a real
            # render-performance sample the NEW path's dispatch would then
            # see calibration history for, breaking the old-vs-new marker
            # equivalence this test exists to check (R2: mock the DB boundary
            # consistently, not just the pre-existing call site).
            patch(
                "app.db.segments.write_back_segment_audio_guarded",
                lambda fingerprints, *a, **kw: {"applied": list(fingerprints), "stale": []},
            ),
            patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None),
            patch("app.api.ws.broadcast_tts_log_line", lambda *a, **kw: None),
            patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None),
            patch("tts_engines.tts_mixed.handler.get_project_lexicon", return_value=[]),
        ]

    # --- OLD path: SynthesisTask(engine_id="mixed") -> handle_mixed_job ---
    # A segment-orchestrated chapter's SynthesisTask ALWAYS carries the
    # generation.py script-entry shape (uses_segment_orchestration branch in
    # api_add_to_queue) — build it via the SAME shared helper so both paths'
    # per-group weight math is identically scoped (INV-1 requires this
    # equivalence, not an accidental omission).
    from app.domain.chunk_groups import build_chunk_groups, build_script_entry_for_group
    with patch("app.domain.chunk_groups.resolve_profile_engine", return_value="mixed"):
        old_groups = build_chunk_groups(segments, "TestVoice")
        old_script = [build_script_entry_for_group(g, chapter_dir, default_profile="TestVoice", safe_mode=False) for g in old_groups]

    old_orc = MockOrchestrator()
    old_task = SynthesisTask(
        task_id="old-job-1",
        engine_id="mixed",
        script_text="Hello world.",
        output_path=str(chapter_dir / "chapter.wav"),
        project_id=pid,
        chapter_id=cid,
        voice_profile_id="TestVoice",
        safe_mode=False,
        script=old_script,
    )
    old_watchdog = TtsServerWatchdog()
    with ExitStack() as stack:
        stack.enter_context(patch("app.engines.watchdog.get_watchdog", return_value=old_watchdog))
        stack.enter_context(patch(
            "tts_engines.tts_mixed.handler.stitch_segments",
            side_effect=lambda pdir, paths, out, on_output, cc: (_write_wav(out), 0)[1],
        ))
        for p in _common_patches(old_watchdog):
            stack.enter_context(p)
        old_orc._dispatch(task=old_task, context=old_task.describe())

    old_sequence = _event_key_sequence(old_orc.published)

    # --- NEW path: ChapterSynthesisTask(max_concurrent_workers=1) ---
    new_orc = MockOrchestrator()
    new_task = ChapterSynthesisTask(
        task_id="new-job-1",
        engine_id="mixed",
        chapter_id=cid,
        project_id=pid,
        output_path=str(chapter_dir / "chapter.wav"),
        script=segments,
        voice_profile_id="TestVoice",
        max_concurrent_workers=1,
        safe_mode=False,
        bridge_call=make_dispatch_segment_bridge_call(new_orc),
    )
    new_watchdog = TtsServerWatchdog()
    with ExitStack() as stack:
        stack.enter_context(patch("app.engines.watchdog.get_watchdog", return_value=new_watchdog))
        for p in _common_patches(new_watchdog):
            stack.enter_context(p)
        new_orc._dispatch(task=new_task, context=new_task.describe())

    new_sequence = _event_key_sequence(new_orc.published)

    assert old_sequence, "OLD path produced no events"
    assert new_sequence, "NEW path produced no events"

    old_reason_codes = [e[1] for e in old_sequence if e[1]]
    new_reason_codes = [e[1] for e in new_sequence if e[1]]
    assert old_reason_codes == new_reason_codes, (
        f"cap=1 per-segment reason_code sequence must match old vs new path; "
        f"old={old_reason_codes} new={new_reason_codes}"
    )

    old_progress = [e[2] for e in old_sequence if e[2] is not None]
    new_progress = [e[2] for e in new_sequence if e[2] is not None]
    assert old_progress == new_progress, (
        f"cap=1 progress sequence must match old vs new path; old={old_progress} new={new_progress}"
    )

    # Both must reach a SEGMENT_SAVED frame (segment persisted).
    assert any(e[1] == "SEGMENT_SAVED" for e in old_sequence)
    assert any(e[1] == "SEGMENT_SAVED" for e in new_sequence)
