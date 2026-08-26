"""Chapter-level admission gate (issue #228).

``ChapterSynthesisTask`` used to carry no ``resource_claim`` at all, so
``TaskOrchestrator.submit()``'s ``_claim_to_dict(getattr(task,
"resource_claim", None))`` produced an empty ``engine_class`` — which skips
every gate in ``reserve_task_resources``, including the global backstop.
Chapters were admitted completely unconditionally: queue N chapters at
cap=M, all N show ``status="running"`` with a live ETA countdown instantly,
even though only M are actually doing anything (their segments block in
``SegmentSynthesisTask``'s own admission loop without publishing anything).

This test submits real ``ChapterSynthesisTask``s (blocked in ``run()`` so
concurrency is observable) through the real ``TaskOrchestrator.submit()``
admission path and asserts at most ``tts_parallel_cap`` are ever
``"running"`` concurrently, and every other one reports ``"queued"`` while
waiting — never ``"preparing"`` or ``"running"``.

Mock boundaries (R2): only ``ChapterSynthesisTask.run`` itself is replaced
(it would otherwise try to fan out real segment synthesis); the real
``TaskOrchestrator.submit()``, real ``reserve_task_resources``/
``ResourceClaim.chapter_admission()`` semaphores, and real
``resolve_effective_cap`` settings resolution all run unmocked.
"""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.orchestration.scheduler.resources import ResourceClaim
from app.orchestration.tasks.base import TaskResult
from app.orchestration.tasks.segment_synthesis import ChapterSynthesisTask


@pytest.fixture(autouse=True)
def _reset_chapter_admission_semaphores():
    """Isolate the chapter-admission pool across tests (module-level singletons)."""
    from app.orchestration.scheduler import resources as _res  # noqa: PLC0415

    def _reset():
        for sem in list(_res._engine_semaphores.values()):
            sem.reset()
        for sem in list(_res._engine_id_semaphores.values()):
            sem.reset()
        _res._global_cap_gate.reset()

    _reset()
    yield
    _reset()


def _make_blocking_chapter_task(
    task_id: str,
    started_events: dict,
    release_event: threading.Event,
    progress_service,
) -> ChapterSynthesisTask:
    task = ChapterSynthesisTask(
        task_id=task_id,
        engine_id="mixed",
        chapter_id=f"chapter-{task_id}",
        project_id="proj-1",
        script=[],
    )
    # Real ChapterSynthesisTask.run() would fan out real segment synthesis
    # (and itself publishes "running" once dispatched, per the fan-out
    # dispatch branch in orchestrator_helpers._dispatch, which calls
    # task.run() directly). Replace it with a blocking stand-in that
    # reproduces that one "running" publish, so this test can observe real
    # admission concurrency without exercising real segment synthesis.
    def _blocking_run() -> TaskResult:
        progress_service.publish(job_id=task_id, status="running")
        started_events[task_id].set()
        release_event.wait(timeout=10.0)
        return TaskResult(status="completed")

    task.run = _blocking_run  # type: ignore[method-assign]
    return task


def _statuses_for(progress_service, task_id: str) -> list[str]:
    return [
        c.kwargs["status"]
        for c in progress_service.publish.call_args_list
        if c.kwargs.get("job_id") == task_id
    ]


class TestChapterAdmissionGate:
    def test_chapter_fanout_respects_tts_parallel_cap(self, orchestrator, progress_service):
        """N chapters submitted at cap=M: at most M ever run concurrently,
        and the rest report queued (never preparing/running) while waiting.
        """
        from app.db.state import update_settings

        cap = 2
        n_chapters = 4
        update_settings({"tts_parallel_cap": cap})

        progress_service.reconcile.return_value = {"artifact_state": "missing", "can_reuse": False}

        task_ids = [f"chapter-task-{i}" for i in range(n_chapters)]
        started_events = {tid: threading.Event() for tid in task_ids}
        release_event = threading.Event()
        tasks = [
            _make_blocking_chapter_task(tid, started_events, release_event, progress_service)
            for tid in task_ids
        ]

        try:
            with ThreadPoolExecutor(max_workers=n_chapters) as pool:
                futures = [pool.submit(orchestrator.submit, task) for task in tasks]

                # Wait for exactly `cap` chapters to actually start running.
                deadline = threading.Event()
                started_count = 0
                for _ in range(100):  # up to ~10s (100 * 0.1s), no fixed sleep-based assertion
                    started_count = sum(1 for e in started_events.values() if e.is_set())
                    if started_count >= cap:
                        break
                    deadline.wait(0.1)
                assert started_count == cap, (
                    f"expected exactly {cap} chapters admitted concurrently, got {started_count}"
                )

                # Give the non-admitted chapters a moment to have published at
                # least their queued event and confirm they never reached
                # preparing/running while genuinely parked at the gate.
                for tid in task_ids:
                    if started_events[tid].is_set():
                        continue
                    statuses = _statuses_for(progress_service, tid)
                    assert "preparing" not in statuses, f"{tid} reached preparing before admission: {statuses}"
                    assert "running" not in statuses, f"{tid} reached running before admission: {statuses}"

                # Confirm the admitted ones actually show running.
                for tid in task_ids:
                    if started_events[tid].is_set():
                        statuses = _statuses_for(progress_service, tid)
                        assert "running" in statuses, f"{tid} was admitted but never published running: {statuses}"

                release_event.set()
                for fut in futures:
                    fut.result(timeout=10.0)
        finally:
            release_event.set()

        # Everything eventually completes.
        for tid in task_ids:
            statuses = _statuses_for(progress_service, tid)
            assert statuses[0] == "queued"
            assert statuses[-1] == "done"
