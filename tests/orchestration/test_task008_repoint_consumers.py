"""#232 Task 008 — repoint backend progress/ETA consumers at get_chapter_summary().

Reproduces the two confirmed live bugs this plan exists to fix:

1. 0%-on-resume: ``_get_grouped_progress()``'s ``completed_weight``/
   ``completed_group_count`` locals in ``_dispatch_segment`` were
   zero-initialized on every dispatch call, never seeded from persisted DB
   state, so a resumed/re-submitted job reported 0% even when a real chunk
   of the chapter's characters were already ``done``.
2. ETA undercounting: ``_publish_chapter_dispatch_eta`` derived
   ``total_chars`` from the render script's TOTAL scope (``_build_groups()``),
   never reduced by already-done segments, so the pre-load ETA estimated the
   time to render the WHOLE chapter even on a resume where most of it was
   already finished.

Both fixtures below use UNEQUAL segment lengths (a long "done" segment and a
short "unprocessed" one) so a naive count-weighted implementation cannot
coincidentally produce a passing char-weighted-looking result.

Mock boundaries (R2): the TTS watchdog stream, the bridge/job-handler
registry, and the WS broadcast helpers — never ``orchestrator_helpers``
itself, and never the real ``get_chapter_summary``/DB layer, which is the
thing under test.
"""
from __future__ import annotations

import threading
from unittest.mock import MagicMock, patch

import pytest

from app.core.boot import run_schema_migrations
from app.db import get_connection
from app.db.chapters import create_chapter
from app.db.projects import create_project
from app.engines.watchdog import TtsServerWatchdog
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.tasks.base import TaskContext, StudioTask, TaskResult


# ---------------------------------------------------------------------------
# Shared harness (mirrors tests/orchestration/test_dispatch_isolation.py)
# ---------------------------------------------------------------------------


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
    def __init__(self) -> None:
        self.voice_bridge = MagicMock()
        self.progress_service = MagicMock()
        self.published: list[dict] = []

    def _publish(self, **kwargs) -> None:
        self.published.append(kwargs)


def _make_task(*, task_id: str, script: list[dict], chapter_id: str, engine_id: str = "xtts") -> StudioTask:
    class _ScriptedTask(StudioTask):
        def __init__(self) -> None:
            self.script = script
            self.engine_id = engine_id
            self.submitted_at = 0.0
            self.on_run = None

        def get_expected_duration(self, text: str, engine_id: str) -> float:
            return 30.0

        def describe(self) -> TaskContext:
            return TaskContext(
                task_id=task_id,
                task_type="synthesis",
                chapter_id=chapter_id,
                payload={
                    "script_text": " ".join(e.get("text", "") for e in script),
                    "engine_id": engine_id,
                    "script": script,
                },
            )

        @property
        def prefers_local_execution(self) -> bool:
            return True

        def run(self) -> TaskResult:
            if self.on_run is not None:
                self.on_run()
            return TaskResult(status="completed")

    return _ScriptedTask()


def _insert_segment(conn, seg_id, chapter_id, order, start, end, text, status):
    conn.execute(
        """
        INSERT INTO chapter_segments
            (id, chapter_id, segment_order, text_content, text_hash,
             start_offset, end_offset, character_id, speaker_profile_name,
             audio_status, audio_file_path, audio_generated_at)
        VALUES (?, ?, ?, ?, 'deadbeef', ?, ?, NULL, 'narrator', ?, NULL, NULL)
        """,
        (seg_id, chapter_id, order, text, start, end, status),
    )
    conn.commit()


def _run_dispatch(task, script, todo_id: str = "todo-seg") -> tuple[list[dict], object]:
    """Drive one ``_dispatch_segment`` call for the single group named
    *todo_id* in *script* (the only group whose markers this helper feeds —
    mirrors a resume where the already-``done`` groups are reused, never
    re-rendered, so only the still-unresolved group actually emits engine
    markers)."""
    orc = MockOrchestrator()
    wd = TtsServerWatchdog()

    pre = ["[ENGINE_ACTIVITY_STARTED] %s\n" % task.describe().task_id]
    post = [
        "[START_SEGMENT] %s %s\n" % (todo_id, task.describe().task_id),
        "[PROGRESS] 100%% %s\n" % task.describe().task_id,
        "[SEGMENT_SAVED] /tmp/todo.wav %s\n" % task.describe().task_id,
    ]

    def _drive():
        wd._drain_stream(None, "stdout", MockStream(pre))
        wd._drain_stream(None, "stdout", MockStream(post))

    task.on_run = _drive

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_tts_log_line", lambda *a, **kw: None):
        result = orc._dispatch_segment(task=task, context=task.describe())

    return orc.published, result


# ---------------------------------------------------------------------------
# Bug 1 — 0%-on-resume
# ---------------------------------------------------------------------------


def test_dispatch_seeds_completed_weight_from_persisted_done_segments():
    """RED on pre-fix code: ``completed_weight``/``completed_group_count``
    start at ``[0.0]``/``[0]`` unconditionally, so the START_SEGMENT frame
    for the one remaining group reports ``completed_render_weight == 0``
    and a grouped ``progress`` with no credit for the already-done segment.

    GREEN after the fix: both are seeded from ``get_chapter_summary()``,
    filtered to this job's own script ids, so the long already-``done``
    segment's char weight is present from the very first frame.
    """
    run_schema_migrations()
    with get_connection() as conn:
        pid = create_project("P-008-a", "/tmp")
        cid = create_chapter(pid, "C-008-a")
        long_done_text = "x" * 990
        short_todo_text = "y" * 10
        _insert_segment(conn, "done-seg-a", cid, 0, 0, 990, long_done_text, "done")
        _insert_segment(conn, "todo-seg-a", cid, 1, 990, 1000, short_todo_text, "unprocessed")

    # This dispatch's own script re-covers the WHOLE chapter (both groups) —
    # the shape of a post-restart re-submission — but only "todo-seg-a" is
    # actually fanned out for rendering; "done-seg-a" is reused as-is.
    script = [
        {"id": "done-seg-a", "ids": ["done-seg-a"], "text": "x" * 990, "save_path": "/tmp/done.wav", "weight": 990},
        {"id": "todo-seg-a", "ids": ["todo-seg-a"], "text": "y" * 10, "save_path": "/tmp/todo.wav", "weight": 10},
    ]
    task = _make_task(task_id="job-resume", script=script, chapter_id=cid)

    published, result = _run_dispatch(task, script, todo_id="todo-seg-a")

    start_frames = [p for p in published if p.get("reason_code") == "START_SEGMENT"]
    assert start_frames, "expected a START_SEGMENT frame for todo-seg-a"
    frame = start_frames[0]

    # 990 of the 1000-char chapter was already done before this dispatch
    # even started — the seeded weight must reflect that, not 0.
    assert frame["completed_render_weight"] == 990
    assert frame["completed_render_groups"] == 1
    assert frame["progress"] > 0.9, (
        f"grouped progress should already credit the done segment, got {frame['progress']}"
    )


def test_dispatch_partial_scope_job_never_exceeds_full_progress():
    """A job whose script covers only PART of the chapter must never seed a
    percentage over 100% by crediting OTHER chapter segments outside its
    own script's scope (the frontier-tier correction in the task file).
    """
    run_schema_migrations()
    with get_connection() as conn:
        pid = create_project("P-008-b", "/tmp")
        cid = create_chapter(pid, "C-008-b")
        # Three chapter segments; only "todo-seg" and "in-scope-done" belong
        # to this job's script. "outside-done" is done but NOT part of this
        # job's own script — it must not contribute to this job's weight.
        _insert_segment(conn, "in-scope-done-b", cid, 0, 0, 500, "a" * 500, "done")
        _insert_segment(conn, "outside-done-b", cid, 1, 500, 1000, "b" * 500, "done")
        _insert_segment(conn, "todo-seg-b", cid, 2, 1000, 1010, "c" * 10, "unprocessed")

    # This job's own script only names in-scope-done-b + todo-seg-b — a
    # partial re-queue of the unresolved batches, per the recovery re-queue
    # shape.
    script = [
        {"id": "in-scope-done-b", "ids": ["in-scope-done-b"], "text": "a" * 500, "save_path": "/tmp/a.wav", "weight": 500},
        {"id": "todo-seg-b", "ids": ["todo-seg-b"], "text": "c" * 10, "save_path": "/tmp/c.wav", "weight": 10},
    ]
    task = _make_task(task_id="job-partial", script=script, chapter_id=cid)

    published, result = _run_dispatch(task, script, todo_id="todo-seg-b")

    start_frames = [p for p in published if p.get("reason_code") == "START_SEGMENT"]
    assert start_frames
    frame = start_frames[0]

    # Only "in-scope-done"'s 500 chars count — never outside-done's 500.
    assert frame["completed_render_weight"] == 500
    assert frame["completed_render_groups"] == 1
    assert frame["progress"] <= 0.99


# ---------------------------------------------------------------------------
# Bug 2 — ETA undercounting
# ---------------------------------------------------------------------------


def test_chapter_dispatch_eta_uses_chars_remaining_not_chapter_total():
    """RED on pre-fix code: ``_publish_chapter_dispatch_eta`` sums
    ``group["text_length"]`` across ALL groups from ``_build_groups()``
    (the chapter's TOTAL char count) with no reduction for already-``done``
    segments, so the pre-load ETA estimates the time to render the whole
    chapter even when most of it is already finished.

    GREEN after the fix: the ETA input is ``chars_remaining`` — this job's
    own script ids, filtered to NOT-done — not the chapter's total.
    """
    run_schema_migrations()
    with get_connection() as conn:
        pid = create_project("P-008-c", "/tmp")
        cid = create_chapter(pid, "C-008-c")
        long_done_text = "x" * 990
        short_todo_text = "y" * 10
        _insert_segment(conn, "done-seg-c", cid, 0, 0, 990, long_done_text, "done")
        _insert_segment(conn, "todo-seg-c", cid, 1, 990, 1000, short_todo_text, "unprocessed")

    class _ChapterTask(StudioTask):
        def __init__(self) -> None:
            self.engine_id = "xtts"

        def get_expected_duration(self, text, engine_id):
            return 30.0

        def describe(self):
            return TaskContext(
                task_id="job-eta",
                task_type="synthesis",
                chapter_id=cid,
                payload={"engine_id": "xtts"},
            )

        def _build_groups(self):
            return [
                {"segments": [{"id": "done-seg-c"}], "text_length": 990},
                {"segments": [{"id": "todo-seg-c"}], "text_length": 10},
            ]

        def run(self) -> TaskResult:
            return TaskResult(status="completed")

    orc = MockOrchestrator()
    task = _ChapterTask()
    ctx = task.describe()

    # A calibrated cps of 1.0 char/sec makes the arithmetic legible:
    # full-chapter ETA would be ~1000s, remaining-only ETA ~10s.
    with patch.object(orc, "_resolve_engine_calibration", return_value=(1.0, 0.0, "model-x")), \
         patch.object(orc, "_expected_cold_load_seconds", return_value=0.0):
        orc._publish_chapter_dispatch_eta(task=task, context=ctx)

    assert orc.published, "expected a preparing/pre_load_eta frame"
    frame = orc.published[0]
    assert frame["reason_code"] == "pre_load_eta"
    # Full-chapter (bug) would be ~1000s; remaining-only (fix) should be
    # under 100s — a wide margin that only the bug, not overhead rounding,
    # could cross.
    assert frame["eta_seconds"] < 100, (
        f"ETA should reflect only the 10 remaining chars, got {frame['eta_seconds']}s"
    )


def test_chapter_dispatch_eta_excludes_done_groups_from_overhead():
    """RED on pre-fix code (mcgonagall F2): ``chars_remaining`` is reduced
    to this job's not-done chars, but ``len(groups)`` passed to
    ``calculate_chapter_startup_eta`` is still the FULL chapter's group
    count, so ``(group_count - 1) * inter_group_overhead`` charges
    phantom inter-group-reload overhead for every already-``done`` group
    that will never actually render.

    The pre-existing test above can't catch this: it patches
    ``_resolve_engine_calibration`` to return overhead ``0.0``, which
    zeroes out the exact term this bug inflates. This test uses a
    realistic non-zero overhead (100s) so the phantom-overhead term is
    actually observable.

    GREEN after the fix: overhead is charged only for
    ``groups_remaining`` — groups with at least one not-done segment —
    never for groups that are entirely ``done``.
    """
    run_schema_migrations()
    with get_connection() as conn:
        pid = create_project("P-008-f", "/tmp")
        cid = create_chapter(pid, "C-008-f")
        _insert_segment(conn, "done-seg-f1", cid, 0, 0, 500, "x" * 500, "done")
        _insert_segment(conn, "done-seg-f2", cid, 1, 500, 1000, "x" * 500, "done")
        _insert_segment(conn, "todo-seg-f", cid, 2, 1000, 1010, "y" * 10, "unprocessed")

    class _ChapterTask(StudioTask):
        def __init__(self) -> None:
            self.engine_id = "xtts"

        def get_expected_duration(self, text, engine_id):
            return 30.0

        def describe(self):
            return TaskContext(
                task_id="job-eta-f",
                task_type="synthesis",
                chapter_id=cid,
                payload={"engine_id": "xtts"},
            )

        def _build_groups(self):
            # Three groups (the chapter's TOTAL scope); only the last is
            # actually still unresolved — mirrors a resume of a mostly-done
            # chapter.
            return [
                {"segments": [{"id": "done-seg-f1"}], "text_length": 500},
                {"segments": [{"id": "done-seg-f2"}], "text_length": 500},
                {"segments": [{"id": "todo-seg-f"}], "text_length": 10},
            ]

        def run(self) -> TaskResult:
            return TaskResult(status="completed")

    orc = MockOrchestrator()
    task = _ChapterTask()
    ctx = task.describe()

    # cps=1.0 char/sec, inter_group_overhead=100s (realistic, non-zero —
    # the term the pre-existing test's overhead=0.0 patch hides).
    # Fix: 1 remaining group -> 0 overhead boundaries -> ~10s.
    # Bug: 3 total groups -> 2 overhead boundaries -> ~10 + 200 = 210s.
    with patch.object(orc, "_resolve_engine_calibration", return_value=(1.0, 100.0, "model-x")), \
         patch.object(orc, "_expected_cold_load_seconds", return_value=0.0):
        orc._publish_chapter_dispatch_eta(task=task, context=ctx)

    assert orc.published, "expected a preparing/pre_load_eta frame"
    frame = orc.published[0]
    assert frame["reason_code"] == "pre_load_eta"
    assert frame["eta_seconds"] < 50, (
        f"phantom overhead for already-done groups: expected ~10s, got {frame['eta_seconds']}s"
    )


# ---------------------------------------------------------------------------
# Bug 1b — orchestrator.recover()'s re-queue publish call
# ---------------------------------------------------------------------------


def test_dispatch_does_not_double_credit_already_done_seeded_segment():
    """RED on pre-fix code (mcgonagall F1): the seed block above adds a
    'done' segment's char_count into completed_weight[0]/
    completed_group_count[0], but nothing then suppresses the NORMAL
    completed_weight[0] += w on that same group's own [SEGMENT_SAVED]
    marker. A rendered script entry whose DB row is still 'done' at
    dispatch time (the exact shape ``_SyntheticSegmentTask`` builds, and
    what a re-fanned-out group whose artifact fails ``_group_needs_render``
    produces even under ``is_bake``) gets counted TWICE: once by the seed,
    once by the marker.

    GREEN after the fix: the seeded leader id is skipped exactly once on
    its own [SEGMENT_SAVED], so completed_render_weight/groups never
    exceed this job's own total_weight/render_group_count.
    """
    run_schema_migrations()
    with get_connection() as conn:
        pid = create_project("P-008-e", "/tmp")
        cid = create_chapter(pid, "C-008-e")
        # Single-group dispatch whose one segment is already 'done' --
        # mirrors _SyntheticSegmentTask (segment_synthesis.py:201-212) being
        # fanned out even though its row never left 'done'.
        _insert_segment(conn, "done-seg-e", cid, 0, 0, 500, "x" * 500, "done")

    # _run_dispatch's SEGMENT_SAVED marker always names "/tmp/todo.wav"
    # (see the harness above) regardless of todo_id, so the script's own
    # save_path must match that fixed path for the marker to resolve.
    script = [
        {"id": "done-seg-e", "ids": ["done-seg-e"], "text": "x" * 500, "save_path": "/tmp/todo.wav", "weight": 500},
    ]
    task = _make_task(task_id="job-synthetic-e", script=script, chapter_id=cid)

    # Drive START_SEGMENT + PROGRESS + [SEGMENT_SAVED] for the SAME
    # already-done leader (todo_id == the seeded segment's own id) — the
    # reviewer's exact repro shape.
    published, result = _run_dispatch(task, script, todo_id="done-seg-e")

    saved_frames = [p for p in published if p.get("reason_code") == "SEGMENT_SAVED"]
    assert saved_frames, "expected a SEGMENT_SAVED frame"
    frame = saved_frames[-1]

    # total_weight for this job is 500 (one group). Double credit would
    # report 1000/2; the fix must cap at the job's own true total.
    assert frame["completed_render_weight"] == 500, (
        f"double-credited: expected 500, got {frame['completed_render_weight']}"
    )
    assert frame["completed_render_groups"] == 1, (
        f"double-credited: expected 1 group, got {frame['completed_render_groups']}"
    )


def test_recover_requeue_publishes_real_persisted_progress():
    """RED on pre-fix code: the "Unresolved batches re-queued" publish call
    in ``TaskOrchestrator.recover()`` passes no ``progress`` kwarg at all,
    so the frontend sees a bare ``status="queued"`` with implied 0% even
    when the chapter is mostly done.

    GREEN after the fix: the call passes the real persisted percent from
    ``get_chapter_summary()``.
    """
    from app.orchestration.scheduler.orchestrator import TaskOrchestrator
    from app.orchestration.tasks.base import TaskContext

    run_schema_migrations()
    with get_connection() as conn:
        pid = create_project("P-008-d", "/tmp")
        cid = create_chapter(pid, "C-008-d")
        _insert_segment(conn, "done-seg-d", cid, 0, 0, 990, "x" * 990, "done")
        _insert_segment(conn, "todo-seg-d", cid, 1, 990, 1000, "y" * 10, "unprocessed")

    progress_service = MagicMock()
    progress_service.publish.return_value = None
    progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}
    voice_bridge = MagicMock()
    orchestrator = TaskOrchestrator(progress_service=progress_service, voice_bridge=voice_bridge)

    ctx = TaskContext(
        task_id="recovered-008",
        task_type="synthesis",
        source="ui",
        chapter_id=cid,
        payload={"_recovered_from_status": "running", "engine_id": "xtts", "script_text": "text", "output_path": "/tmp/out.wav"},
    )
    with patch(
        "app.orchestration.scheduler.orchestrator.load_recoverable_task_contexts",
        return_value=[ctx],
    ):
        orchestrator.recover()

    queued_calls = [c for c in progress_service.publish.call_args_list if c.kwargs.get("status") == "queued"]
    assert queued_calls, "expected a queued re-dispatch publish call"
    queued_kwargs = queued_calls[0].kwargs
    assert queued_kwargs.get("progress") is not None, "queued re-dispatch must not omit progress"
    # 990/1000 == 99.0% persisted -> 0.99 fraction.
    assert queued_kwargs["progress"] == pytest.approx(0.99, abs=1e-6)
