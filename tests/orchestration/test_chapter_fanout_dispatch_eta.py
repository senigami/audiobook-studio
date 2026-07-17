"""Chapter-level dispatch ETA for fan-out parents (W-MIX-LA parity restoration).

Regression (owner report, 2026-07-06): after the concurrent fan-out
(`is_chapter_fanout` → `_dispatch` bypasses `_dispatch_segment`), NOTHING
published a durable, positive `eta_seconds` on the PARENT chapter job during
the `preparing` window. The pre-fan-out path emitted the proactive
`pre_load_eta` frame from `_dispatch_segment` (W-MIX-LA 006); children still
compute their own group-scoped frames but publish them EPHEMERALLY
(segments.progress only — `orchestrator_publish._publish` skips durable job
writes for ephemeral contexts, and the frame carries no `active_segment_id`,
so `_on_child_segment_tick` drops it). Result: the global queue bar
(`checkpointMode='queue'`, progress-presentation.md §2.6 / I10) never saw a
positive ETA and fell back to the indeterminate pulse — the "queue row stuck
on preparing" symptom.

R1 revert-check: on pre-fix code (`_dispatch` fan-out branch calls
`task.run()` with no `_publish_chapter_dispatch_eta`), no frame for the
parent job carries a positive `eta_seconds` during `preparing`, and the
durable job row's `eta_seconds` stays None — both assertions below go red.

Mock boundaries (R2): external I/O only — TTS-server health, DB performance
history, the engine bridge (`generate_via_bridge`), and the websocket
broadcaster. Real `ChapterSynthesisTask`, `_dispatch`,
`_publish_chapter_dispatch_eta`, `_publish`, and job-state persistence run.
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
    """Same harness shape as test_ephemeral_child_no_durable_job.py: real
    ``_publish`` (durable job-state writes) + a captured broadcaster at the
    websocket boundary.
    """

    def __init__(self) -> None:
        self.voice_bridge = MagicMock()
        self.captured_frames: list[dict] = []

        def _capture(payload: dict, channel: str = "jobs") -> None:
            self.captured_frames.append(payload)

        self.progress_service = ProgressService(
            reconcile_fn=reconcile_work_item,
            eta_fn=estimate_eta_seconds,
            broadcaster=_capture,
        )


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


def _cold_health(engine_id: str = "mixed") -> dict:
    return {
        "status": "ok",
        "engines": [{"engine_id": engine_id, "status": "ready", "model_warm": False}],
    }


def _run_fanout_through_dispatch(tmp_path: Path, task_id: str, chapter_id: str):
    """Drive a 3-group chapter fan-out through the REAL `_dispatch` entry
    (the production path from `submit()`), with calibration + model-load
    history seeded and the engine reported cold."""
    orc = RealPublishOrchestrator()
    watchdogs: dict[str, TtsServerWatchdog] = {}

    def _fake_generate_via_bridge(**kwargs):
        real_task_id = kwargs["task_id"]
        out_wav = kwargs["out_wav"]
        on_output = kwargs["on_output"]
        wd = watchdogs.setdefault(threading.current_thread().name, TtsServerWatchdog())
        _write_tiny_wav(out_wav)
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
        script=_chapter_script(3),
        max_concurrent_workers=2,
        bridge_call=bridge_call,
    )
    context = task.describe()

    history = [
        {"engine": "mixed", "cps": 50.0, "inter_group_overhead_seconds": 2.0},
        {"engine": "mixed", "cps": 45.0, "inter_group_overhead_seconds": 2.5},
    ]

    with patch("tts_engines.tts_mixed.handler.generate_via_bridge", side_effect=_fake_generate_via_bridge), \
         patch("app.engines.watchdog.get_watchdog", side_effect=lambda: watchdogs.setdefault(threading.current_thread().name, TtsServerWatchdog())), \
         patch("app.engines.watchdog.get_server_health", return_value=_cold_health("mixed")), \
         patch("app.db.performance.expected_model_load_seconds", return_value=25.0), \
         patch("app.db.state.get_performance_metrics", return_value={"render_history": history}), \
         patch("app.tts_server.performance_settings.resolve_engine_settings_model", return_value=None), \
         patch("app.tts_server.performance_settings.filter_history_for_engine_model", side_effect=lambda h, e, m: h), \
         patch("app.core.config.get_chapter_dir", return_value=tmp_path), \
         patch("app.domain.chunk_groups.build_script_entry_for_group", side_effect=_fake_script_entry), \
         patch("app.db.speakers.get_speaker_settings", return_value={}), \
         patch("app.engines.behavior.extract_engine_settings", return_value={}), \
         patch("app.db.update_segment", lambda *a, **kw: None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_tts_log_line", lambda *a, **kw: None), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.orchestration.tasks.segment_synthesis._manifest_resource_claim", side_effect=_raised_cap_claim), \
         patch("app.orchestration.progress.service.get_progress_service", return_value=orc.progress_service):
        # The last patch above matters: ChapterSynthesisTask._resolve_progress_service()
        # falls back to the global ProgressService singleton whenever no
        # progress_service was injected at construction (which this harness never
        # does) — without redirecting that singleton to `orc.progress_service`,
        # every `_publish_progress` frame (all "running"/"completed" chapter-level
        # broadcasts) would silently land on the production singleton instead of
        # `orc.captured_frames`, and tests asserting on those frames would see none.
        result = orc._dispatch(task=task, context=context)

    return result, orc


def _parent_frames(orc: RealPublishOrchestrator, task_id: str) -> list[dict]:
    return [
        f for f in orc.captured_frames
        if str((f.get("ids") or {}).get("jobId") or "") == task_id
    ]


def test_parent_job_gets_positive_durable_eta_during_preparing_window(tmp_path):
    """The parent chapter job's own top-level ``eta_seconds`` must become
    positive during the (cold-engine) preparing window: a ``preparing`` frame
    with ``reason_code='pre_load_eta'`` and a positive ETA must be emitted
    BEFORE any child/running work, and the durable job row must carry the
    value (that is what the queue row's I10 determinate fill reads)."""
    from app.db.state import get_jobs  # noqa: PLC0415

    task_id = "chap-dispatch-eta"
    result, orc = _run_fanout_through_dispatch(tmp_path, task_id, "chapter-dispatch-eta")
    assert result.status == "completed", f"expected completed, got {result}"

    frames = _parent_frames(orc, task_id)
    assert frames, f"expected parent-scoped frames; got topics {[f.get('topic') for f in orc.captured_frames]}"

    def _inner(frame: dict) -> dict:
        return frame.get("payload") or {}

    preparing_eta_indexes = [
        i for i, f in enumerate(frames)
        if _inner(f).get("status") == "preparing"
        and isinstance(_inner(f).get("etaSeconds"), (int, float))
        and _inner(f).get("etaSeconds") > 0
    ]
    assert preparing_eta_indexes, (
        "expected at least one parent 'preparing' frame with a positive etaSeconds "
        f"(the dispatch pre_load_eta frame); got: {[( _inner(f).get('status'), _inner(f).get('etaSeconds'), _inner(f).get('reasonCode')) for f in frames]}"
    )

    running_indexes = [i for i, f in enumerate(frames) if _inner(f).get("status") == "running"]
    if running_indexes:
        assert min(preparing_eta_indexes) < min(running_indexes), (
            "the preparing+ETA frame must precede the first running frame "
            "(continuous queue-bar fill through the preparing→running boundary, §2.6)"
        )

    # Durable: the parent Job row carried the positive ETA AT dispatch time
    # (queue hydration reads the row, not just the live frame stream) — check
    # the dispatch-time frame's own payload rather than the row's state after
    # `_dispatch()` returns. This harness runs synchronously to full chapter
    # completion, and as of the 2026-07-07 live-decay fix the durable
    # eta_seconds correctly reaches 0 once the render actually finishes (see
    # test_chapter_eta_decays_as_groups_complete_instead_of_staying_frozen) —
    # asserting "still positive after completion" here would be re-asserting
    # the staleness bug this suite exists to catch, not the dispatch behavior
    # this test is actually named for.
    dispatch_frame_payload = _inner(frames[min(preparing_eta_indexes)])
    dispatch_eta = dispatch_frame_payload.get("etaSeconds")
    assert isinstance(dispatch_eta, int) and dispatch_eta > 0, (
        f"expected a positive durable-bound eta_seconds on the dispatch frame; got {dispatch_eta!r}"
    )
    # Cold engine + 25s load history: the load term must be included
    # (synthesis for ~51 chars at ~47.5cps + 2 group boundaries ≈ 6s; +25s load).
    assert dispatch_eta >= 25, (
        f"expected the cold-load term (25s) baked into the dispatch ETA; got {dispatch_eta}"
    )
    job = get_jobs().get(task_id)
    assert job is not None, f"expected a durable parent job row; got {set(get_jobs())}"
    assert job.eta_seconds in (None, 0), (
        f"expected the durable eta_seconds to have decayed to 0 once the chapter fully "
        f"completed (2026-07-07 fix), not stay frozen at the dispatch-time value; "
        f"got {job.eta_seconds!r}"
    )


def test_no_calibration_history_no_fabricated_dispatch_eta(tmp_path):
    """No render history → no calculated ETA → NO dispatch frame (the
    no-fabrication principle, B10/1.7.1): the parent job's eta_seconds stays
    unset rather than inventing a countdown."""
    from app.db.state import get_jobs  # noqa: PLC0415

    orc = RealPublishOrchestrator()

    task = ChapterSynthesisTask(
        task_id="chap-no-calib",
        engine_id="mixed",
        chapter_id="chapter-no-calib",
        project_id="proj-1",
        output_path=str(tmp_path / "chap-no-calib.wav"),
        script=_chapter_script(2),
        max_concurrent_workers=1,
        bridge_call=lambda child: __import__("app.orchestration.tasks.base", fromlist=["TaskResult"]).TaskResult(status="completed"),
    )
    context = task.describe()

    with patch("app.engines.watchdog.get_server_health", return_value=_cold_health("mixed")), \
         patch("app.db.performance.expected_model_load_seconds", return_value=25.0), \
         patch("app.db.state.get_performance_metrics", return_value={"render_history": []}), \
         patch("app.tts_server.performance_settings.resolve_engine_settings_model", return_value=None), \
         patch("app.tts_server.performance_settings.filter_history_for_engine_model", side_effect=lambda h, e, m: h), \
         patch("app.orchestration.tasks.segment_synthesis._manifest_resource_claim", side_effect=_raised_cap_claim):
        result = orc._dispatch(task=task, context=context)

    assert result.status == "completed", f"expected completed, got {result}"
    pre_load_frames = [
        f for f in orc.captured_frames
        if (f.get("payload") or {}).get("reasonCode") == "pre_load_eta"
    ]
    assert pre_load_frames == [], (
        f"no calibration history must mean no fabricated dispatch ETA; got {pre_load_frames}"
    )
    job = get_jobs().get("chap-no-calib")
    assert job is None or job.eta_seconds in (None, 0), (
        f"parent eta_seconds must stay unset without calibration; got {getattr(job, 'eta_seconds', None)!r}"
    )


def test_chapter_eta_decays_as_groups_complete_instead_of_staying_frozen(tmp_path):
    """Owner report, 2026-07-07: the chapter ETA never counted down through a
    real render — it stayed pinned at the dispatch-time estimate (570s in the
    captured debug session) from 0% all the way to 97% complete.

    Root cause: ``_publish_progress``'s "running" frames never computed or
    passed an ``eta_seconds`` at all (always ``None``), AND never durably
    wrote status/progress/eta_seconds via ``update_job`` — so the persisted
    job row stayed frozen at whatever ``_publish_chapter_dispatch_eta`` wrote
    once, before rendering even started. Every later ``_on_child_segment_tick``
    tick (which only ever writes ``active_segments_map``) merged against that
    frozen row and re-broadcast the stale dispatch-time snapshot verbatim for
    the rest of the render.

    This asserts the ETA must actually decrease as groups complete (size-/
    count-weighted decay of the dispatch estimate), not simply "be present."
    """
    from app.db.state import get_jobs  # noqa: PLC0415

    task_id = "chap-live-eta"
    result, orc = _run_fanout_through_dispatch(tmp_path, task_id, "chapter-live-eta")
    assert result.status == "completed", f"expected completed, got {result}"

    def _inner(frame: dict) -> dict:
        return frame.get("payload") or {}

    running_frames = [
        f for f in _parent_frames(orc, task_id)
        if f.get("topic") == "chapters.progress" and _inner(f).get("status") == "running"
    ]
    running_etas = [_inner(f).get("etaSeconds") for f in running_frames]
    assert len(running_frames) >= 2, (
        f"expected at least a dispatch-time announce plus one group-completion "
        f"'running' frame; got {len(running_frames)}: {running_etas}"
    )

    first_eta, last_eta = running_etas[0], running_etas[-1]
    assert isinstance(first_eta, (int, float)) and first_eta > 0, (
        f"expected the FIRST running frame (dispatch-time announce, 0 groups done) "
        f"to carry the full calibrated ETA; got {first_eta!r} across {running_etas}"
    )
    assert isinstance(last_eta, (int, float)) and last_eta < first_eta, (
        f"expected the ETA to DECREASE as groups completed (not stay frozen at "
        f"the dispatch-time value); running-frame etaSeconds sequence was {running_etas}"
    )

    # Durable: the job row itself must not be left holding the stale
    # dispatch-time eta_seconds after the chapter has actually progressed —
    # this is what every later _on_child_segment_tick tick would otherwise
    # re-broadcast verbatim (the exact mechanism of the escaped defect).
    job = get_jobs().get(task_id)
    assert job is not None
    assert job.eta_seconds in (None, 0) or job.eta_seconds < first_eta, (
        f"expected the durable job row's eta_seconds to reflect completion, not the "
        f"frozen dispatch-time value {first_eta}; got {job.eta_seconds!r}"
    )
