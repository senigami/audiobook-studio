"""W-PAR task 003 — per-segment dispatch isolation (KEYSTONE, R-A).

These tests pin the contract that each concurrently-dispatched segment gets its
OWN isolated timing/marker/load state, that every progress frame carries an
explicit ``segment_id``, and that the orchestrator assembles an
``active_segments_map`` from independent per-segment states — while cap=1
remains byte-identical to today (INV-1, the ship-dark gate).

Harness style mirrors ``test_b8_marker_stream_characterization.py``:
``MockOrchestrator(OrchestratorHelpersMixin)`` drives ``_dispatch`` /
``_dispatch_segment`` with a synchronous ``MockStream`` fed through the real
watchdog ``_drain_stream`` (R4: no sleeps; ``threading.Event`` gates the
concurrency test).

Mock boundaries (R2): ``broadcast_tts_log_line``, ``update_job``,
``update_segments_bulk``, and the bridge call. NEVER the timing/marker dicts,
the progress math, or ``orchestrator_helpers`` itself.

STATUS: all three tests are green post-003/008. Test 2
(``test_single_dispatch_segment_call_emits_one_entry_at_a_time``) was updated
in W-PAR 008 when ``_EMIT_ACTIVE_SEGMENTS_MAP`` flipped ON — see that test's
docstring for the single-call-site-vs-genuine-concurrency distinction. Test 3
is the cap=1 characterization regression gate (INV-1) and must stay green.
"""

from __future__ import annotations

import threading
from unittest.mock import MagicMock, patch

import pytest

from app.engines.watchdog import TtsServerWatchdog
from app.orchestration.scheduler.orchestrator_helpers import OrchestratorHelpersMixin
from app.orchestration.tasks.base import TaskContext, StudioTask, TaskResult


# ---------------------------------------------------------------------------
# Shared harness
# ---------------------------------------------------------------------------


class MockStream:
    """Synchronous line source for _drain_stream — no subprocess, no threads."""

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
        self._publish_lock = threading.Lock()

    def _publish(self, **kwargs) -> None:
        # Thread-safe: the isolation test drives two segments concurrently.
        with self._publish_lock:
            self.published.append(kwargs)


def _make_task(*, task_id: str, script: list[dict], engine_id: str = "mixed", ephemeral: bool = False) -> StudioTask:
    class _ScriptedTask(StudioTask):
        def __init__(self) -> None:
            self.script = script
            self.engine_id = engine_id
            self.submitted_at = 0.0
            # Callable set by the test to drive a synthetic marker stream from
            # inside run() (prefers_local_execution path — mirrors the B8 test).
            self.on_run = None

        def get_expected_duration(self, text: str, engine_id: str) -> float:
            return 30.0

        def describe(self) -> TaskContext:
            return TaskContext(
                task_id=task_id,
                task_type="synthesis",
                payload={
                    "script_text": " ".join(e.get("text", "") for e in script),
                    "engine_id": engine_id,
                    "script": script,
                },
                ephemeral=ephemeral,
            )

        @property
        def prefers_local_execution(self) -> bool:
            return True

        def run(self) -> TaskResult:
            if self.on_run is not None:
                self.on_run()
            return TaskResult(status="completed")

    return _ScriptedTask()


_SINGLE_GROUP_SCRIPT = [
    {"id": "seg-A", "ids": ["seg-A"], "text": "Alpha text.", "save_path": "/tmp/a.wav", "weight": 100},
]


# ---------------------------------------------------------------------------
# Test 1 — two concurrent segments do not cross-contaminate (R1 revert-check)
# ---------------------------------------------------------------------------


def test_two_concurrent_segments_isolated_timing_and_markers():
    """INV-6: two concurrent ``_dispatch_segment`` invocations with interleaved
    marker lines keep timing / marker / load state fully independent.

    RED today: ``_dispatch_segment`` does not exist. GREEN after extraction only
    if segment A's ENGINE_ACTIVITY / START_SEGMENT / SEGMENT_SAVED state never
    bleeds into segment B's and vice versa.
    """
    orc = MockOrchestrator()

    script_a = [{"id": "seg-A", "ids": ["seg-A"], "text": "Alpha.", "save_path": "/tmp/a.wav", "weight": 100}]
    script_b = [{"id": "seg-B", "ids": ["seg-B"], "text": "Beta.", "save_path": "/tmp/b.wav", "weight": 100}]

    task_a = _make_task(task_id="job-A", script=script_a)
    task_b = _make_task(task_id="job-B", script=script_b)

    # Gate the two threads so their marker lines actually interleave (R4: Event,
    # not sleep). A opens its engine-activity window, then waits for B to open
    # its own before either confirms — the pre-isolation shared scalars would
    # let B's activity overwrite A's pending window.
    a_opened = threading.Event()
    b_opened = threading.Event()

    results: dict[str, object] = {}

    # One watchdog PER TASK, dispatched by the calling thread's own task_id via
    # `threading.local`. `unittest.mock.patch` mutates a SHARED module attribute,
    # so nested `with patch(get_watchdog=...)` blocks in two different threads
    # race each other (thread B's patch can shadow thread A's watchdog mid-call,
    # misattributing A's log_listener registration to B's watchdog and producing
    # a false cross-talk signal that has nothing to do with `_dispatch_segment`
    # itself). A single outer patch resolved via thread-local state avoids that
    # entirely — the isolation under test is `_dispatch_segment`'s state, not
    # the mocking strategy's thread-safety.
    watchdogs: dict[str, TtsServerWatchdog] = {"job-A": TtsServerWatchdog(), "job-B": TtsServerWatchdog()}
    _thread_local = threading.local()

    def _watchdog_for_current_thread():
        return watchdogs[_thread_local.task_id]

    def _run_segment(*, sid: str, task, script, other_opened: threading.Event, self_opened: threading.Event):
        task_id = task.describe().task_id
        _thread_local.task_id = task_id
        wd = watchdogs[task_id]

        # Feed markers with an interleave barrier between activity-open and confirm.
        pre = [
            "[ENGINE_ACTIVITY_STARTED] %s\n" % task_id,
        ]
        post = [
            "[START_SEGMENT] %s %s\n" % (sid, task_id),
            "[PROGRESS] 100%% %s\n" % task_id,
            "[SEGMENT_SAVED] /tmp/%s.wav %s\n" % (sid[-1].lower(), task_id),
        ]

        def _drive():
            wd._drain_stream(None, "stdout", MockStream(pre))
            self_opened.set()
            other_opened.wait(timeout=5)
            wd._drain_stream(None, "stdout", MockStream(post))

        task.on_run = _drive
        results[sid] = orc._dispatch_segment(task=task, context=task.describe())

    with patch("app.engines.watchdog.get_watchdog", side_effect=_watchdog_for_current_thread), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_tts_log_line", lambda *a, **kw: None):
        ta = threading.Thread(target=_run_segment, kwargs=dict(
            sid="seg-A", task=task_a, script=script_a, other_opened=b_opened, self_opened=a_opened))
        tb = threading.Thread(target=_run_segment, kwargs=dict(
            sid="seg-B", task=task_b, script=script_b, other_opened=a_opened, self_opened=b_opened))
        ta.start()
        tb.start()
        ta.join(timeout=10)
        tb.join(timeout=10)

    res_a = results["seg-A"]
    res_b = results["seg-B"]

    timing_a = res_a.timing  # type: ignore[attr-defined]
    timing_b = res_b.timing  # type: ignore[attr-defined]

    # Each segment observed its OWN engine-activity window, independently.
    assert timing_a["engine_activity_started_at"] is not None
    assert timing_b["engine_activity_started_at"] is not None

    # Load-observed / marker sets never contain the other segment's id.
    assert "seg-B" not in res_a.marker_state["start_segment_ids"]  # type: ignore[attr-defined]
    assert "seg-A" not in res_b.marker_state["start_segment_ids"]  # type: ignore[attr-defined]
    assert res_a.marker_state["start_segment_ids"] == {"seg-A"}  # type: ignore[attr-defined]
    assert res_b.marker_state["start_segment_ids"] == {"seg-B"}  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Test 2 — active_segments_map carries both segment ids (C2 contract)
# ---------------------------------------------------------------------------


def test_single_dispatch_segment_call_emits_one_entry_at_a_time():
    """W-PAR 008: ``_EMIT_ACTIVE_SEGMENTS_MAP`` is now ON (flipped once the
    parent-side multi-entry aggregation landed in ``ChapterSynthesisTask``).

    This test exercises the OLD single-``_dispatch_segment``-call path (one
    call processing a 2-group script sequentially — the pre-008 sequential
    mixed-handler shape, not the new concurrent parent/child fan-out). At
    that call site there is only ever ONE active segment at a time, so every
    populated ``active_segments_map`` frame must carry exactly one entry —
    for whichever segment is active at that moment — never both
    simultaneously (that would misrepresent true concurrency where none
    exists). The genuine multi-entry (both sids present at once) case is
    covered separately by
    ``tests/orchestration/test_live_segment_concurrency.py`` and
    ``ChapterSynthesisTask``'s own aggregation tests, where real concurrent
    children exist.
    """
    orc = MockOrchestrator()
    script = [
        {"id": "seg-A", "ids": ["seg-A"], "text": "Alpha.", "save_path": "/tmp/a.wav", "weight": 50},
        {"id": "seg-B", "ids": ["seg-B"], "text": "Beta.", "save_path": "/tmp/b.wav", "weight": 50},
    ]
    task = _make_task(task_id="job-chapter", script=script)

    wd = TtsServerWatchdog()

    def _drive():
        for sid, path in (("seg-A", "/tmp/a.wav"), ("seg-B", "/tmp/b.wav")):
            wd._drain_stream(None, "stdout", MockStream([
                "[START_SEGMENT] %s job-chapter\n" % sid,
                "[PROGRESS] 50%% job-chapter\n",
            ]))

    task.on_run = _drive

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_tts_log_line", lambda *a, **kw: None):
        orc._dispatch(task=task, context=task.describe())

    populated = [e["active_segments_map"] for e in orc.published if e.get("active_segments_map")]
    assert populated, "expected active_segments_map to be emitted now that the flag is on"
    for entry_map in populated:
        assert len(entry_map) == 1, (
            f"a single _dispatch_segment call must report exactly one active segment "
            f"at a time (no genuine concurrency at this call site); got {entry_map}"
        )
    seen_sids = {sid for entry_map in populated for sid in entry_map}
    assert seen_sids == {"seg-A", "seg-B"}, f"expected both segments represented across frames; got {seen_sids}"


# ---------------------------------------------------------------------------
# Test 3 — cap=1 golden path (ship-dark regression gate, INV-1)
# ---------------------------------------------------------------------------


# Baseline captured from pre-refactor `_dispatch` (2026-07-02, commit at the
# start of task 003 phase 2) for the exact CLEAN_STREAM below. Each tuple is
# (status, reason_code, progress, active_segment_id, completed_render_groups)
# — the fields that must be byte-identical at cap=1 (INV-1). `active_segments_map`
# is a NEW additive field (directive 1) and is deliberately excluded from this
# tuple; its presence/absence is asserted separately and must NOT change this
# sequence.
_CAP1_BASELINE_SEQUENCE = [
    ("preparing", "LOADING_MODEL", 0.0, None, None),
    ("running", None, 0.0, None, None),
    ("running", None, 0.0, "seg-A", 0),
    ("running", "SEGMENT_PENDING", 0.0, "seg-A", 0),
    ("running", "START_SEGMENT", 0.25, "seg-A", 0),
    ("running", "SEGMENT_PROGRESS", 0.25, "seg-A", 0),
    ("running", "SEGMENT_PROGRESS", 0.5, "seg-A", 0),
    ("running", "SEGMENT_PROGRESS", 0.99, "seg-A", 0),
    ("running", "SEGMENT_SAVED", 0.99, None, 1),
]


def test_cap1_golden_path_progress_and_status_unchanged():
    """INV-1 (ship-dark gate): a single-segment dispatch through the
    (refactored) path emits the SAME ordered sequence of existing fields
    (status, reason_code, progress, active_segment_id, completed_render_groups)
    as the pre-refactor baseline.

    Per directive 1, adding the new `active_segments_map` field to frames is
    permitted (additive) and asserted separately — it must not alter the
    existing-field sequence above.

    This test is GREEN on pre-003 code and MUST stay green after the
    extraction. Any drift in the pinned sequence is a ship-dark blocker.
    """
    orc = MockOrchestrator()
    task = _make_task(task_id="job-cap1", script=_SINGLE_GROUP_SCRIPT)
    wd = TtsServerWatchdog()

    stream = [
        "[START_SYNTHESIS] job-cap1\n",
        "[START_SEGMENT] seg-A job-cap1\n",
        "[PROGRESS] 25% job-cap1\n",
        "[PROGRESS] 50% job-cap1\n",
        "[PROGRESS] 100% job-cap1\n",
        "[SEGMENT_SAVED] /tmp/a.wav job-cap1\n",
        "[CHAPTER_SYNTHESIS_COMPLETE] job-cap1\n",
    ]

    task.on_run = lambda: wd._drain_stream(None, "stdout", MockStream(stream[:]))

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_tts_log_line", lambda *a, **kw: None):
        orc._dispatch(task=task, context=task.describe())

    running = [e for e in orc.published if e.get("status") == "running" and e.get("progress") is not None]
    progresses = [e["progress"] for e in running]
    assert progresses == sorted(progresses), "grouped progress must be monotonically non-decreasing"

    actual_sequence = [
        (
            e.get("status"),
            e.get("reason_code"),
            e.get("progress"),
            e.get("active_segment_id"),
            e.get("completed_render_groups"),
        )
        for e in orc.published
    ]
    assert actual_sequence == _CAP1_BASELINE_SEQUENCE, (
        "cap=1 existing-field event sequence drifted from the pre-refactor "
        "baseline (INV-1 ship-dark gate)"
    )

    saved = [e for e in orc.published if e.get("reason_code") == "SEGMENT_SAVED"]
    assert saved, "expected a SEGMENT_SAVED frame for the single group"
    assert saved[-1]["active_segment_id"] is None
    assert saved[-1]["completed_render_groups"] == 1

    # Additive-only: active_segments_map may be present post-003 but must not
    # replace or shift any existing field above.
    for e in orc.published:
        if "active_segments_map" in e and e["active_segments_map"] is not None:
            assert isinstance(e["active_segments_map"], dict)


# ---------------------------------------------------------------------------
# Test 4 — foreign-sid guard rejects a START_SEGMENT naming another task's
# segment (escaped defect, 2026-07-06)
# ---------------------------------------------------------------------------


def test_start_segment_with_foreign_sid_is_ignored():
    """A correctly-tagged (this task's own task_id) START_SEGMENT marker
    naming a sid that isn't among this dispatch's own script entries must be
    ignored, not adopted as active_seg_id.

    R1 revert-check: this reproduces the exact shape of the 2026-07-06
    escaped defect (owner-reported cross-attributed segment highlighting
    once ENGINE_CLASS_ADMISSION defaulted on) — a concurrent sibling
    dispatch's unsynchronized stderr write can interleave with this task's
    own line such that the WATCHDOG's task_id extraction lands on THIS
    task's own correctly-formed [PROGRESS]/[START_SYNTHESIS] segment of the
    merged line while the [START_SEGMENT] segment embedded in the same
    physical line names a FOREIGN sid belonging to the sibling. Without the
    guard, `active_seg_id[0]` is poisoned to the foreign sid and every
    subsequent (correctly-tagged, legitimate) PROGRESS tick for this task
    publishes under the wrong segment id until this task's own next real
    START_SEGMENT arrives — pre-fix, the assertion below fails because
    `active_segment_id` for the PROGRESS frame is the foreign sid, not None.
    """
    orc = MockOrchestrator()
    task = _make_task(task_id="job-cap1", script=_SINGLE_GROUP_SCRIPT, ephemeral=True)
    wd = TtsServerWatchdog()

    stream = [
        "[START_SYNTHESIS] job-cap1\n",
        # Foreign sid: not "seg-A" (this task's own script), simulating a
        # merged line where the START_SEGMENT half named a sibling's segment.
        "[START_SEGMENT] seg-FOREIGN job-cap1\n",
        "[PROGRESS] 50% job-cap1\n",
    ]

    task.on_run = lambda: wd._drain_stream(None, "stdout", MockStream(stream[:]))

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_tts_log_line", lambda *a, **kw: None):
        orc._dispatch(task=task, context=task.describe())

    foreign_hits = [e for e in orc.published if e.get("active_segment_id") == "seg-FOREIGN"]
    assert not foreign_hits, (
        f"active_segment_id must never be poisoned by a foreign sid not in "
        f"this task's own script. Published frames with foreign sid: {foreign_hits}"
    )

    progress_frames = [e for e in orc.published if e.get("reason_code") == "SEGMENT_PROGRESS"]
    for frame in progress_frames:
        assert frame.get("active_segment_id") != "seg-FOREIGN", (
            f"PROGRESS frame incorrectly attributed to foreign sid: {frame}"
        )


def test_start_segment_with_own_group_member_sid_is_accepted():
    """A multi-member group's OWN real member ids must still be accepted —
    the foreign-sid guard checks against the union of every script entry's
    full member-id list, not just the leader."""
    orc = MockOrchestrator()
    script = [
        {"id": "seg-A", "ids": ["seg-A", "seg-A2"], "text": "Alpha.", "save_path": "/tmp/a.wav", "weight": 100},
    ]
    task = _make_task(task_id="job-multi", script=script, ephemeral=True)
    wd = TtsServerWatchdog()

    stream = [
        "[START_SYNTHESIS] job-multi\n",
        "[START_SEGMENT] seg-A job-multi\n",
        "[SEGMENT_SAVED] /tmp/a.wav job-multi\n",
        # Second real member of the SAME group — must be accepted, not
        # treated as foreign.
        "[START_SEGMENT] seg-A2 job-multi\n",
        "[PROGRESS] 100% job-multi\n",
    ]

    task.on_run = lambda: wd._drain_stream(None, "stdout", MockStream(stream[:]))

    with patch("app.engines.watchdog.get_watchdog", return_value=wd), \
         patch("app.jobs.registry.JobHandlerRegistry.get_handler", return_value=None), \
         patch("app.db.update_segments_bulk", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_segments_updated", lambda *a, **kw: None), \
         patch("app.api.ws.broadcast_tts_log_line", lambda *a, **kw: None):
        orc._dispatch(task=task, context=task.describe())

    seg_a2_hits = [e for e in orc.published if e.get("active_segment_id") == "seg-A2"]
    assert seg_a2_hits, "seg-A2 (a real member of this task's own group) must be accepted, not rejected as foreign"
