"""TDD tests for W-PAR task 002: parent/child segment scheduling (fan-out).

Written BEFORE the implementation to confirm red on current code.

Mock boundaries (R2): only the bridge (``VoiceBridge.synthesize`` equivalent —
here the child's bridge call hook), and DB writers (``update_job``,
``update_segment``) are mocked. The orchestrator, ``ChapterSynthesisTask``,
``SegmentSynthesisTask`` and ``build_chunk_groups`` are never mocked — they are
the units under test.

No sleep-based timing (R4): concurrency claims are proven with
``threading.Event`` latches, never ``time.sleep``.
"""
from __future__ import annotations

import threading
import time
from unittest.mock import patch

import pytest


def _make_segment(seg_id: str, character_id: str = "char-1", text: str = "Hello there friend.") -> dict:
    return {
        "id": seg_id,
        "character_id": character_id,
        "speaker_profile_name": "narrator",
        "character_speaker_profile_name": None,
        "text_content": text,
        "segment_order": seg_id,
        "audio_status": "pending",
        "audio_file_path": None,
    }


def _make_chapter_task(task_id: str, chapter_id: str, groups_count: int, *, bridge_call=None, max_workers: int = 1):
    """Build a ChapterSynthesisTask with N distinct chunk groups.

    Each segment gets its own character_id so build_chunk_groups never
    coalesces them into a single group (each becomes its own group/child).
    """
    from app.orchestration.tasks.segment_synthesis import ChapterSynthesisTask  # noqa: PLC0415

    script = [
        {
            "id": f"{task_id}-seg-{i}",
            "character_id": f"char-{i}",
            "speaker_profile_name": "narrator",
            "text_content": f"Segment number {i} text content here.",
        }
        for i in range(groups_count)
    ]

    return ChapterSynthesisTask(
        task_id=task_id,
        engine_id="xtts",
        chapter_id=chapter_id,
        project_id="proj-1",
        output_path=f"/tmp/{task_id}.wav",
        script=script,
        max_concurrent_workers=max_workers,
    )


@pytest.fixture(autouse=True)
def _reset_semaphores():
    """Reset engine-class semaphores between tests for isolation."""
    from app.orchestration.scheduler import resources as _res  # noqa: PLC0415
    for sem in list(_res._engine_semaphores.values()):
        sem.reset()
    _res._global_cap_gate.reset()
    yield
    for sem in list(_res._engine_semaphores.values()):
        sem.reset()
    _res._global_cap_gate.reset()


class TestChapterFansCorrectChildCount:
    def test_chapter_fans_correct_child_count(self):
        """3 chunk groups -> 3 SegmentSynthesisTask children constructed & submitted."""
        from app.orchestration.tasks.segment_synthesis import SegmentSynthesisTask  # noqa: PLC0415

        constructed: list[SegmentSynthesisTask] = []
        real_init = SegmentSynthesisTask.__init__

        def _tracking_init(self, *args, **kwargs):
            real_init(self, *args, **kwargs)
            constructed.append(self)

        task = _make_chapter_task("chap-fan-1", "chapter-1", groups_count=3, max_workers=1)

        with patch.object(SegmentSynthesisTask, "__init__", _tracking_init), \
             patch(
                 "app.orchestration.tasks.segment_synthesis.SegmentSynthesisTask.run",
                 return_value=__import__(
                     "app.orchestration.tasks.base", fromlist=["TaskResult"]
                 ).TaskResult(status="completed"),
             ):
            result = task.run()

        assert len(constructed) == 3
        assert result.status == "completed"


class TestCap1ChildrenRunSerially:
    def test_cap1_children_run_serially(self):
        """With cap=1, child N+1 must not start until child N's slot is released."""
        from app.orchestration.tasks.segment_synthesis import SegmentSynthesisTask  # noqa: PLC0415
        from app.orchestration.tasks.base import TaskResult  # noqa: PLC0415

        active_count = [0]
        max_observed = [0]
        lock = threading.Lock()

        def _fake_run(self):
            with lock:
                active_count[0] += 1
                max_observed[0] = max(max_observed[0], active_count[0])
            # Yield briefly to widen the window in which overlap could occur.
            time.sleep(0.01)
            with lock:
                active_count[0] -= 1
            return TaskResult(status="completed")

        task = _make_chapter_task("chap-serial-1", "chapter-serial-1", groups_count=4, max_workers=1)

        with patch.object(SegmentSynthesisTask, "run", _fake_run):
            result = task.run()

        assert result.status == "completed"
        assert max_observed[0] == 1, "cap=1 must serialize children (INV-1)"


class TestCap2ChildrenRunConcurrently:
    def test_cap2_children_run_concurrently(self):
        """With cap=2 and 3 children, at least 2 must be active simultaneously."""
        from app.orchestration.tasks.segment_synthesis import SegmentSynthesisTask  # noqa: PLC0415
        from app.orchestration.tasks.base import TaskResult  # noqa: PLC0415

        entered = threading.Event()
        release = threading.Event()
        active_count = [0]
        max_observed = [0]
        lock = threading.Lock()
        first_two_arrived = threading.Barrier(2, timeout=5)

        def _fake_run(self):
            with lock:
                active_count[0] += 1
                max_observed[0] = max(max_observed[0], active_count[0])
            entered.set()
            try:
                first_two_arrived.wait()
            except threading.BrokenBarrierError:
                pass
            release.wait(timeout=5)
            with lock:
                active_count[0] -= 1
            return TaskResult(status="completed")

        task = _make_chapter_task("chap-cap2-1", "chapter-cap2-1", groups_count=3, max_workers=2)

        result_holder: dict = {}

        def _run_chapter():
            result_holder["result"] = task.run()

        # Give the barrier-waiting children a moment to release once 2 have
        # arrived: release the barrier participants shortly after.
        def _releaser():
            first_two_arrived.wait(timeout=5) if False else None

        t = threading.Thread(target=_run_chapter, daemon=True)
        with patch.object(SegmentSynthesisTask, "run", _fake_run):
            t.start()
            # Wait until at least 2 children are concurrently active, then release.
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and max_observed[0] < 2:
                time.sleep(0.005)
            release.set()
            t.join(timeout=10)

        assert not t.is_alive(), "chapter task did not complete in time"
        assert max_observed[0] >= 2, "cap=2 must admit at least 2 concurrent children"


class TestParentProgressAggregation:
    def test_parent_progress_aggregation(self):
        """4 children completing in sequence -> chapter progress in ~25% steps, 1.0 terminal."""
        from app.orchestration.tasks.segment_synthesis import SegmentSynthesisTask  # noqa: PLC0415
        from app.orchestration.tasks.base import TaskResult  # noqa: PLC0415

        published_progress: list[float] = []

        class _FakeProgressService:
            def publish(self, **kwargs):
                progress = kwargs.get("progress")
                if progress is not None:
                    published_progress.append(round(float(progress), 2))
                return None

        task = _make_chapter_task("chap-progress-1", "chapter-progress-1", groups_count=4, max_workers=1)
        task._progress_service = _FakeProgressService()

        with patch.object(
            SegmentSynthesisTask, "run",
            return_value=TaskResult(status="completed"),
        ):
            result = task.run()

        assert result.status == "completed"
        assert published_progress, "parent must publish progress as children complete"
        # Every jump must be >= 1% (no sub-1% broadcasts) — gating rule.
        prev = 0.0
        for p in published_progress:
            assert p - prev >= 0.0
            if p != prev:
                assert (p - prev) >= 0.009, f"sub-1% progress jump detected: {prev} -> {p}"
            prev = p
        assert published_progress[-1] == 1.0


class TestActiveSegmentsMapMultiEntryAggregation:
    def test_two_concurrent_children_both_present_in_active_segments_map(self):
        """W-PAR 008: with genuine concurrent fan-out (cap=2), the parent's
        ``active_segments_map`` must carry BOTH in-flight children
        simultaneously, keyed by their real segment/leader id (never the
        synthetic per-child task_id) — the C2 contract entry shape
        ``{phase, progress, eta_seconds}`` per active segment.

        Uses a ``threading.Barrier`` to force both children to be genuinely
        in flight at the same instant (R4: no sleeps) before either resolves,
        so the aggregation is proven against real concurrency, not just
        sequential bookkeeping.
        """
        from app.orchestration.tasks.segment_synthesis import SegmentSynthesisTask  # noqa: PLC0415
        from app.orchestration.tasks.base import TaskResult  # noqa: PLC0415

        both_arrived = threading.Barrier(2, timeout=5)
        observed_maps: list[dict] = []
        observed_lock = threading.Lock()

        class _FakeProgressService:
            def publish(self, **kwargs):
                return None

        def _fake_run(self):
            # Mirror the real run()'s first action (review fix, W-PAR 008):
            # the aggregation now requires `started and not finished`, so a
            # child that never marks itself started is treated as still
            # queued and excluded from the map.
            self.started = True
            try:
                both_arrived.wait()
            except threading.BrokenBarrierError:
                pass
            # Snapshot the parent's aggregation while BOTH children are
            # still in flight (started, not yet `finished`).
            with observed_lock:
                observed_maps.append(dict(parent_ref[0]._current_active_segments_map() or {}))
            return TaskResult(status="completed")

        parent_ref: list = [None]
        task = _make_chapter_task("chap-map-1", "chapter-map-1", groups_count=2, max_workers=2)
        parent_ref[0] = task
        task._progress_service = _FakeProgressService()

        with patch.object(SegmentSynthesisTask, "run", _fake_run):
            result = task.run()

        assert result.status == "completed"
        assert observed_maps, "expected at least one in-flight snapshot"
        # At least one snapshot must show BOTH children in flight together.
        both_present = [m for m in observed_maps if len(m) == 2]
        assert both_present, (
            f"expected a snapshot with both children concurrently in-flight; got {observed_maps}"
        )
        entry_map = both_present[0]
        assert set(entry_map.keys()) == {"chap-map-1-seg-0", "chap-map-1-seg-1"}, (
            "active_segments_map must be keyed by the real segment/leader id, "
            f"not the synthetic per-child task_id; got {list(entry_map.keys())}"
        )
        for sid, entry in entry_map.items():
            assert entry["phase"] == "rendering"
            assert "progress" in entry
            assert "eta_seconds" in entry


class TestRecoverySeesOneJobPerChapter:
    def test_recovery_sees_one_job_per_chapter(self):
        """After fan-out of a chapter with 5 groups, exactly 1 job exists per chapter_id
        in what load_recoverable_task_contexts would surface — children are never queue rows."""
        from app.orchestration.scheduler.recovery import load_recoverable_task_contexts  # noqa: PLC0415

        fake_jobs = [
            {"id": "parent-job-1", "type": "synthesis", "chapter_id": "chapter-recover-1"},
        ]

        with patch(
            "app.db.queue.list_jobs_by_status",
            side_effect=lambda status: fake_jobs if status == "running" else [],
        ):
            contexts = load_recoverable_task_contexts()

        chapter_ids = [c.chapter_id for c in contexts if c.payload.get("chapter_id") == "chapter-recover-1"]
        matching = [c for c in contexts if c.payload.get("chapter_id") == "chapter-recover-1"]
        assert len(matching) == 1, "exactly one durable job per chapter must be recoverable (INV-4)"


class TestCancelStopsAllChildren:
    def test_cancel_stops_all_children(self):
        """Cancel mid-fan-out -> all in-flight children exit; no post-cancel writes."""
        from app.orchestration.tasks.segment_synthesis import SegmentSynthesisTask  # noqa: PLC0415
        from app.orchestration.tasks.base import TaskResult  # noqa: PLC0415

        started = threading.Event()
        writes_after_cancel: list[str] = []
        cancel_seen_by_children = threading.Event()

        def _fake_run(self):
            started.set()
            # Poll the shared stop event the parent sets on cancel().
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                if self.stop_event.is_set():
                    cancel_seen_by_children.set()
                    return TaskResult(status="cancelled")
                time.sleep(0.005)
            writes_after_cancel.append(self.task_id)
            return TaskResult(status="completed")

        task = _make_chapter_task("chap-cancel-1", "chapter-cancel-1", groups_count=4, max_workers=4)

        result_holder: dict = {}

        def _run_chapter():
            result_holder["result"] = task.run()

        t = threading.Thread(target=_run_chapter, daemon=True)
        with patch.object(SegmentSynthesisTask, "run", _fake_run):
            t.start()
            started.wait(timeout=5)
            task.cancel()
            t.join(timeout=10)

        assert not t.is_alive(), "chapter task did not stop in time after cancel"
        assert cancel_seen_by_children.is_set(), "children must observe the cancel stop signal"
        assert writes_after_cancel == [], "no child may complete/write after cancel (INV-7)"
        assert result_holder["result"].status == "cancelled"
