"""W-PAR enable-gate — Finding A: ephemeral child fan-out tasks must not
create phantom durable Job rows.

Today, ``_dispatch_segment`` (via ``orchestrator._publish``) creates/updates a
durable ``Job`` row (``app.db.state.put_job``/``update_job``) for ANY
first-seen ``context.task_id`` — including a ``ChapterSynthesisTask``'s
synthetic per-child fan-out tasks (``task_id`` shaped
``"{parent}-seg-{index}"``, built in ``_SyntheticSegmentTask.describe()``).
This means a chapter render with N chunk groups produces N+1 durable job rows
(the parent + one phantom row per child) instead of the single externally-
visible parent job the queue/UI/recovery layer expects (INV-4).

Owner decision (binding): suppress child durable-job writes entirely
(Option 1) via an explicit ``ephemeral`` flag on ``TaskContext``.

Mock boundaries (R2): only the true engine boundary
(``plugins.tts_mixed.handler.generate_via_bridge``) is mocked — real
``ChapterSynthesisTask``, ``SegmentSynthesisTask``, ``_dispatch_segment``,
``_publish``, and job-state persistence (``app.db.state``) are exercised.
"""

from __future__ import annotations

import threading
import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.engines.watchdog import TtsServerWatchdog
from app.orchestration.progress.service import (
    ProgressService,
    create_progress_service,
    estimate_eta_seconds,
    reconcile_work_item,
)
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.scheduler.resources import ResourceClaim
from app.orchestration.tasks.segment_synthesis import (
    ChapterSynthesisTask,
    make_dispatch_segment_bridge_call,
)


def _raised_cap_claim(engine_id: str) -> ResourceClaim:
    return ResourceClaim(gpu=False, vram_mb=0, cpu_heavy=False, exclusive=False, engine_class="cloud", cap=3)


class RealPublishOrchestrator(OrchestratorHelpersMixin):
    """Orchestrator harness that exercises the REAL ``_publish`` (via
    ``OrchestratorPublishMixin``, mixed in by ``OrchestratorHelpersMixin``) —
    unlike ``test_live_segment_concurrency.py``'s harness, which overrides
    ``_publish`` and therefore never touches durable job-state persistence.

    ``captured_frames`` records every envelope handed to the ProgressService
    broadcaster (the websocket boundary — a legitimate R2 mock point) so
    tests can assert which TOPICS an ephemeral child is still allowed to emit
    on (segments.progress) versus banned from (jobs.lifecycle / queue.items /
    chapters.progress).
    """

    def __init__(self, capture_broadcasts: bool = False) -> None:
        self.voice_bridge = MagicMock()
        self.captured_frames: list[dict] = []
        if capture_broadcasts:
            def _capture(payload: dict, channel: str = "jobs") -> None:
                self.captured_frames.append(payload)
            self.progress_service = ProgressService(
                reconcile_fn=reconcile_work_item,
                eta_fn=estimate_eta_seconds,
                broadcaster=_capture,
            )
        else:
            self.progress_service = create_progress_service()


class MockStream:
    def __init__(self, lines: list[str]):
        self._lines = list(lines)

    def readline(self) -> str:
        if self._lines:
            return self._lines.pop(0)
        return ""

    def close(self) -> None:
        pass


def _make_segment(seg_id: str, order: int, *, character_id: str, text: str) -> dict:
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


def _fake_script_entry(group: dict, chapter_dir: Path, **kw) -> dict:
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


@pytest.fixture(autouse=True)
def _reset_semaphores(monkeypatch):
    from app.orchestration.scheduler import resources as _res  # noqa: PLC0415
    monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
    for sem in list(_res._engine_semaphores.values()):
        sem.reset()
    _res._global_cap_gate.reset()
    yield
    for sem in list(_res._engine_semaphores.values()):
        sem.reset()
    _res._global_cap_gate.reset()


@pytest.fixture(autouse=True)
def _clear_jobs():
    from app.db.state import clear_all_jobs  # noqa: PLC0415
    clear_all_jobs()
    yield
    clear_all_jobs()


def _run_chapter_fanout(
    tmp_path: Path, task_id: str, chapter_id: str, *, groups: int, cap: int,
    capture_broadcasts: bool = False,
):
    orc = RealPublishOrchestrator(capture_broadcasts=capture_broadcasts)
    watchdogs: dict[str, TtsServerWatchdog] = {}

    def _fake_generate_via_bridge(**kwargs):
        real_task_id = kwargs["task_id"]
        out_wav = kwargs["out_wav"]
        on_output = kwargs["on_output"]
        wd = watchdogs.setdefault(threading.current_thread().name, TtsServerWatchdog())
        _write_tiny_wav(out_wav)
        wd._drain_stream(None, "stdout", MockStream([f"[ENGINE_ACTIVITY_STARTED] {real_task_id}\n"]))
        wd._drain_stream(None, "stdout", MockStream([
            f"[START_SYNTHESIS] {real_task_id}\n",
            f"[PROGRESS] 100% {real_task_id}\n",
        ]))
        on_output(f"[stub] wrote {out_wav}\n")
        return 0

    bridge_call = make_dispatch_segment_bridge_call(orc)

    task = ChapterSynthesisTask(
        task_id=task_id,
        engine_id="mixed",
        chapter_id=chapter_id,
        project_id="proj-1",
        output_path=str(tmp_path / f"{task_id}.wav"),
        script=_chapter_script(groups),
        max_concurrent_workers=cap,
        bridge_call=bridge_call,
    )

    with patch("plugins.tts_mixed.handler.generate_via_bridge", side_effect=_fake_generate_via_bridge), \
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

    # Parent job row is created by the caller (orchestrator.submit()), not by
    # task.run() itself in this harness — simulate that single durable write
    # here so the assertion below reflects the real production shape (one
    # parent write + N children, none of which should create rows for
    # themselves).
    orc._publish(context=task.describe(), status="completed", progress=1.0)

    return result, orc


@pytest.mark.parametrize("cap", [1, 2])
def test_chapter_fanout_creates_exactly_one_durable_job_row(tmp_path, cap):
    """A 3-group chapter fan-out must produce exactly ONE durable Job row (the
    parent) in ``get_jobs()`` — zero ``{parent}-seg-N`` phantom child rows —
    at both cap=1 (serial) and cap=2 (concurrent).
    """
    from app.db.state import get_jobs  # noqa: PLC0415

    task_id = f"chap-ephemeral-cap{cap}"
    result, _orc = _run_chapter_fanout(tmp_path, task_id, f"chapter-ephemeral-{cap}", groups=3, cap=cap)

    assert result.status == "completed", f"expected completed, got {result}"

    jobs = get_jobs()
    job_ids = set(jobs.keys())
    assert task_id in job_ids, f"expected parent job {task_id!r} to be durable; got {job_ids}"

    child_ids = {jid for jid in job_ids if jid.startswith(f"{task_id}-seg-")}
    assert child_ids == set(), (
        f"ephemeral fan-out children must not create durable Job rows; found {child_ids}"
    )
    assert len(job_ids) == 1, f"expected exactly one durable job row (the parent); got {job_ids}"


def test_ephemeral_children_still_emit_segment_frames_but_no_job_scoped_frames(tmp_path):
    """Review-ratchet regression (2026-07-04): suppressing an ephemeral
    child's ENTIRE publish also killed the ``segments.progress`` frames that
    multiplex through the same chokepoint — the frontend keys its live
    per-segment progress bar by SEGMENT id (``setSegmentProgress`` in
    ``useJobs.ts``), so those frames were load-bearing even though their
    job_id was a phantom. Contract: an ephemeral child may emit
    segment-scoped frames (segments.progress) but must never emit
    jobs.lifecycle / queue.items / chapters.progress frames under its
    synthetic ``{parent}-seg-N`` id.
    """
    task_id = "chap-ephemeral-frames"
    result, orc = _run_chapter_fanout(
        tmp_path, task_id, "chapter-ephemeral-frames", groups=2, cap=2,
        capture_broadcasts=True,
    )
    assert result.status == "completed", f"expected completed, got {result}"

    def _frames(topic: str) -> list[dict]:
        return [f for f in orc.captured_frames if f.get("topic") == topic]

    def _job_id(frame: dict) -> str:
        return str((frame.get("ids") or {}).get("jobId") or "")

    child_prefix = f"{task_id}-seg-"
    for banned_topic in ("jobs.lifecycle", "queue.items", "chapters.progress"):
        offenders = [f for f in _frames(banned_topic) if _job_id(f).startswith(child_prefix)]
        assert offenders == [], (
            f"ephemeral children must not emit {banned_topic} frames; got {offenders}"
        )

    seg_frames = _frames("segments.progress")
    child_seg_frames = [f for f in seg_frames if _job_id(f).startswith(child_prefix)]
    assert child_seg_frames, (
        "ephemeral children must STILL emit segments.progress frames "
        f"(live per-segment bar); captured topics: {[f.get('topic') for f in orc.captured_frames]}"
    )
    # The frames must be keyed by REAL segment ids, which is what the
    # frontend's segment overlay consumes — never the synthetic task id.
    seg_ids = {(f.get("ids") or {}).get("segmentId") for f in child_seg_frames}
    assert seg_ids & {"seg-0", "seg-1"}, f"expected real segment ids on child frames; got {seg_ids}"


def test_live_active_segments_map_populates_during_render_even_at_cap1(tmp_path):
    """Escaped defect fix (2026-07-05): a real chapter fan-out render must
    call update_job(..., active_segments_map=...) with a genuinely non-empty
    ("rendering") entry DURING the render — not just an empty {} at the end.

    R1: before this fix, ChapterSynthesisTask._publish_progress only sampled
    active_segments_map at group-COMPLETION boundaries (inside as_completed),
    at which instant the just-finished child was already excluded and the
    next hadn't started — so the map was structurally always empty regardless
    of concurrency level. Runs at cap=1 (the reported symptom: no
    highlighting even on a real, successful, non-crashing render) —
    concurrency is NOT required to expose this bug.

    This tests the backend aggregation mechanism itself (the real bug's root
    cause). The SEPARATE delivery-leg fix — active_segments_map actually
    reaching a chapters.progress wire frame — is covered by
    tests/api/test_events_contract.py's build_chapter_progress_event tests
    and app/api/ws.py's threading of merged.get("active_segments_map"); this
    test's harness has no app-boot job-listener registration (real
    broadcast_job_updated is wired at app.core.boot, not in a bare unit
    harness), so it asserts at the update_job call boundary instead of the
    websocket boundary.
    """
    calls: list[dict] = []
    from app.db.state import update_job as real_update_job

    def _spy_update_job(job_id, *a, **kw):
        if "active_segments_map" in kw:
            calls.append({"job_id": job_id, **kw})
        return real_update_job(job_id, *a, **kw)

    # _on_child_segment_tick/_publish_progress/_clear_active_segments_map all
    # do `from app.db.state import update_job` LAZILY inside the function —
    # patching the true source (app.db.state.update_job) is what a call-time
    # re-resolution intercepts; there's no module-level name to patch on
    # segment_synthesis itself.
    with patch("app.db.state.update_job", side_effect=_spy_update_job):
        task_id = "chap-live-map"
        result, _orc = _run_chapter_fanout(
            tmp_path, task_id, "chapter-live-map", groups=3, cap=1,
        )
    assert result.status == "completed", f"expected completed, got {result}"

    rendering_calls = [c for c in calls if c.get("active_segments_map")]
    assert rendering_calls, (
        "expected at least one update_job(active_segments_map=...) call with a "
        f"non-empty map during the render; got calls: {calls}"
    )
    assert any(
        entry.get("phase") == "rendering"
        for c in rendering_calls
        for entry in c["active_segments_map"].values()
    ), f"expected at least one 'rendering' phase entry; got {rendering_calls}"


def test_live_active_segments_map_pops_entry_on_child_completion():
    """ChapterSynthesisTask._on_child_segment_tick: diff-gating and terminal
    removal, in isolation (no full render harness needed).

    R1: before this fix, _current_active_segments_map re-derived from
    child.started/child.finished at each call and had no incremental
    live-tick mechanism at all — this class of diff-gate/removal logic did
    not exist.
    """
    from app.orchestration.tasks.segment_synthesis import ChapterSynthesisTask

    task = ChapterSynthesisTask(
        task_id="chap-tick-test", engine_id="mixed", chapter_id="chap-1", project_id="proj-1",
    )

    calls: list[dict] = []
    with patch("app.db.state.update_job", side_effect=lambda *a, **kw: calls.append(kw)):
        # First tick: populates the map, must publish.
        task._on_child_segment_tick(segment_id="seg-A", status="running", progress=0.3, eta_seconds=10)
        assert task._current_active_segments_map() == {
            "seg-A": {"phase": "rendering", "progress": 0.3, "eta_seconds": 10}
        }
        assert len(calls) == 1
        assert calls[0]["active_segments_map"] == {"seg-A": {"phase": "rendering", "progress": 0.3, "eta_seconds": 10}}
        assert calls[0]["skip_job_updated"] is True

        # Identical repeat tick (sub-1% engine chatter): diff-gate must skip the publish.
        task._on_child_segment_tick(segment_id="seg-A", status="running", progress=0.301, eta_seconds=10)
        assert len(calls) == 1, "an unchanged (post-quantization) tick must not trigger update_job"

        # Genuine progress change: must publish again.
        task._on_child_segment_tick(segment_id="seg-A", status="running", progress=0.6, eta_seconds=6)
        assert len(calls) == 2

        # Terminal tick: entry must be removed, map goes back to None (empty).
        task._on_child_segment_tick(segment_id="seg-A", status="done", progress=1.0, eta_seconds=None)
        assert task._current_active_segments_map() is None
        assert len(calls) == 3
        assert calls[2]["active_segments_map"] == {}

        # A second terminal tick for an already-removed segment must not re-publish.
        task._on_child_segment_tick(segment_id="seg-A", status="done", progress=1.0, eta_seconds=None)
        assert len(calls) == 3, "popping an already-absent entry must not trigger a redundant publish"
