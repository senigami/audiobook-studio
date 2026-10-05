"""Chapter-admission vs. global-cap deadlock (issue #228 follow-up).

Adversarial review found that ``ResourceClaim.chapter_admission()`` (the
fix in ``test_chapter_admission_gate.py``) gave chapters their own
per-engine-class pool, but ``reserve_task_resources``'s global cap backstop
(``MAX_GLOBAL_CONCURRENT_SYNTHESIS``) fires for ANY truthy ``engine_class``
— including ``"chapter_admission"`` — and that backstop is ONE shared
module-level semaphore used by everything. A chapter holds its global-cap
slot for its entire lifetime (until every child finishes), so once enough
chapters are admitted to fill the global pool with parents alone, every
child is denied a global slot forever and the parent's fan-out
``ThreadPoolExecutor`` blocks on a child that can never be admitted —
genuine deadlock, not a throughput issue.

This test reproduces the shape directly against ``reserve_task_resources``/
``release_task_resources`` (real functions, real semaphores) with a real
``SegmentSynthesisTask`` child (not a stub — its ``run()`` is the actual
loop-and-wait-for-a-slot admission logic), rather than going through the
full orchestrator fan-out, to keep the reproduction fast and deterministic
while still exercising the exact code path the deadlock lives in.

Mock boundary (R2): only the child's bridge call is replaced (it would
otherwise try to hit the real TTS bridge); admission itself
(``reserve_task_resources``/``release_task_resources``,
``ResourceClaim.chapter_admission()``, the global cap semaphore) is real.
"""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.orchestration.scheduler import resources as res_mod
from app.orchestration.scheduler.resources import (
    ResourceClaim,
    reserve_task_resources,
    release_task_resources,
)
from app.orchestration.tasks.base import TaskResult
from app.orchestration.tasks.segment_synthesis import SegmentSynthesisTask


@pytest.fixture(autouse=True)
def _reset_semaphores():
    """Isolate every module-level semaphore across tests (shared singletons)."""

    def _reset():
        for sem in list(res_mod._engine_semaphores.values()):
            sem.reset()
        for sem in list(res_mod._engine_id_semaphores.values()):
            sem.reset()
        res_mod._global_cap_gate.reset()

    _reset()
    yield
    _reset()


def _small_global_cap(monkeypatch, cap: int) -> None:
    """Shrink the shared global-cap semaphore to ``cap`` for this test only.

    ``MAX_GLOBAL_CONCURRENT_SYNTHESIS`` is read once at import time to size
    the module-level ``_global_cap_gate`` singleton — reassigning the env var
    after import wouldn't resize it, so swap the singleton itself.
    """
    monkeypatch.setattr(res_mod, "_global_cap_gate", res_mod.EngineClassSemaphore(cap=cap))


class TestChapterAdmissionGlobalCapDeadlock:
    def test_children_are_not_starved_behind_their_own_parents_global_cap_claim(self, monkeypatch):
        """Fill the (shrunk) global pool with chapter-admission claims alone,
        then confirm a real segment child can still be admitted and complete
        — it must never be starved behind its own parents' global-cap slots.
        """
        global_cap = 2
        n_chapters = 2  # == global_cap: pre-fix, this alone fills the pool
        _small_global_cap(monkeypatch, global_cap)

        # Simulate `n_chapters` ChapterSynthesisTasks already admitted and
        # holding their slots for their whole lifetime (real claim shape,
        # real reserve call — mirrors what orchestrator.submit() does for a
        # ChapterSynthesisTask).
        chapter_claims = []
        for i in range(n_chapters):
            claim_dict = {
                "task_id": f"chapter-{i}",
                "engine_class": ResourceClaim.chapter_admission().engine_class,
                "cap": ResourceClaim.chapter_admission().cap,
                "engine_id": ResourceClaim.chapter_admission().engine_id,
                "manifest_max": ResourceClaim.chapter_admission().manifest_max,
            }
            reservation = reserve_task_resources(task_type="chapter_synthesis", resource_claims=claim_dict)
            assert reservation["admitted"], f"chapter {i} should be admitted (its own dedicated pool)"
            chapter_claims.append(claim_dict)

        try:
            # A real child of one of those chapters now tries to get a slot.
            # Pre-fix: the global pool is full of parents alone (cap=2, both
            # slots held by chapter-admission claims), so this child's own
            # reserve_task_resources call is denied the global backstop
            # forever — SegmentSynthesisTask.run()'s admission loop retries
            # every 0.5s and never succeeds. Bound the wait so a pre-fix
            # deadlock fails fast instead of hanging the suite.
            stop_event = threading.Event()
            started = threading.Event()

            def _bridge_call(task: SegmentSynthesisTask) -> TaskResult:
                started.set()
                return TaskResult(status="completed")

            child = SegmentSynthesisTask(
                task_id="segment-child-0",
                parent_task_id="chapter-0",
                engine_id="mixed",
                group={"character_id": "c1"},
                stop_event=stop_event,
                bridge_call=_bridge_call,
            )

            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(child.run)
                admitted_in_time = started.wait(timeout=3.0)
                # Bound the whole thing regardless of outcome so a genuine
                # deadlock can't hang the test suite.
                stop_event.set()
                result = future.result(timeout=5.0)

            assert admitted_in_time, (
                "child segment was never admitted — starved behind its own "
                "parents' global-cap claims (the #228 follow-up deadlock)"
            )
            assert result.status == "completed", (
                f"expected the child to complete once admitted, got {result.status!r}: {result.message}"
            )
        finally:
            for claim_dict in chapter_claims:
                release_task_resources(task_id=claim_dict["task_id"], resource_claims=claim_dict)
