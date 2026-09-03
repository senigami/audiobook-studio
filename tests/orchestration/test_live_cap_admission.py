"""Tests for W-PAR task 014: live per-engine cap admission.

Covers the target-shape acceptance criteria: `EngineClassSemaphore.try_acquire`'s
new `limit` parameter, `reserve_task_resources` resolving the live limit fresh
on every admission attempt (shrink and grow), and `ResourceClaim.cap` now
meaning the manifest ceiling everywhere it's read.
"""
from __future__ import annotations

import os
from unittest.mock import patch

import pytest


# ===========================================================================
# EngineClassSemaphore.try_acquire(limit=...) unit tests
# ===========================================================================


class TestTryAcquireLimitParameter:
    def _make(self, cap: int = 4):
        from app.orchestration.scheduler.resources import EngineClassSemaphore  # noqa: PLC0415

        return EngineClassSemaphore(cap=cap)

    def test_no_limit_behaves_byte_identically_to_today(self):
        """Existing callers (no `limit` passed) see the structural cap, unchanged."""
        sem = self._make(cap=2)
        a1, r1 = sem.try_acquire("a")
        a2, r2 = sem.try_acquire("b")
        a3, r3 = sem.try_acquire("c")
        assert (a1, r1) == (True, None)
        assert (a2, r2) == (True, None)
        assert a3 is False and r3

    def test_limit_narrows_admission_below_structural_cap(self):
        sem = self._make(cap=4)
        assert sem.try_acquire("a", limit=2)[0] is True
        assert sem.try_acquire("b", limit=2)[0] is True
        # Third would fit under the structural cap=4 but not under limit=2.
        assert sem.try_acquire("c", limit=2)[0] is False

    def test_limit_can_never_raise_above_structural_cap(self):
        sem = self._make(cap=1)
        assert sem.try_acquire("a", limit=100)[0] is True
        # Structural cap=1 still governs — limit can only narrow, never widen.
        assert sem.try_acquire("b", limit=100)[0] is False

    def test_shrink_does_not_evict_in_flight_tasks(self):
        """4 active slots at cap=4; lowering limit to 2 blocks new admission
        but does not evict the 4 already-held slots (release is unconditional)."""
        sem = self._make(cap=4)
        for tid in ("a", "b", "c", "d"):
            assert sem.try_acquire(tid)[0] is True
        assert sem.active_count == 4

        # Live limit drops to 2 — a 5th task must be denied...
        assert sem.try_acquire("e", limit=2)[0] is False
        # ...but the 4 already-admitted tasks remain untouched.
        assert sem.active_count == 4
        # "e" gives up waiting (this test isn't exercising it further) — FIFO
        # waiter fairness (regression fix, 2026-08-26) would otherwise hold
        # "f" behind "e" below, since "e" registered as a waiter first.
        sem.release("e")

        # Releasing frees slots normally regardless of the live limit.
        sem.release("a")
        sem.release("b")
        sem.release("c")
        assert sem.active_count == 1
        # Now strictly under the limit=2 threshold, a new admission succeeds.
        assert sem.try_acquire("f", limit=2)[0] is True

    def test_grow_takes_effect_on_next_call_without_restart(self):
        """Raising the live limit admits more on the very next try_acquire call."""
        sem = self._make(cap=4)
        assert sem.try_acquire("a", limit=1)[0] is True
        assert sem.try_acquire("b", limit=1)[0] is False
        # Limit raised — no restart, no re-construction of the semaphore.
        assert sem.try_acquire("b", limit=2)[0] is True


# ===========================================================================
# reserve_task_resources / release_task_resources: live limit resolved fresh
# ===========================================================================


@pytest.fixture(autouse=True)
def _reset_semaphore_registries():
    """Each test gets fresh engine-class / engine-id semaphore singletons."""
    from app.orchestration.scheduler import resources as res

    res._engine_semaphores.clear()
    res._engine_id_semaphores.clear()
    yield
    res._engine_semaphores.clear()
    res._engine_id_semaphores.clear()


def _claim_dict(*, engine_class="gpu", engine_id="tts_fake", manifest_max=4, task_id="t"):
    return {
        "gpu": True,
        "vram_mb": 0,
        "cpu_heavy": False,
        "exclusive": False,
        "engine_class": engine_class,
        "cap": manifest_max,
        "engine_id": engine_id,
        "manifest_max": manifest_max,
        "task_id": task_id,
    }


class TestReserveTaskResourcesLiveLimit:
    def test_shrinking_setting_blocks_new_admission_without_evicting(self, monkeypatch):
        from app.orchestration.scheduler.resources import (
            reserve_task_resources,
            release_task_resources,
        )
        from app.db.state import update_settings

        monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
        update_settings({"tts_parallel_cap": 4, "tts_engine_caps": {}})

        claims = [_claim_dict(manifest_max=4, task_id=f"seg-{i}") for i in range(4)]
        for c in claims:
            r = reserve_task_resources(task_type="synthesis", resource_claims=c)
            assert r["admitted"] is True, r

        # Live-shrink the setting to 2 — already-admitted 4 tasks are untouched,
        # but a NEW admission attempt (re-entering reserve_task_resources with
        # the SAME claim, exactly as the orchestrator's retry loop does) must
        # now resolve limit=2 fresh and deny.
        update_settings({"tts_parallel_cap": 2})
        new_claim = _claim_dict(manifest_max=4, task_id="seg-new")
        r = reserve_task_resources(task_type="synthesis", resource_claims=new_claim)
        assert r["admitted"] is False, "a fresh admission attempt must respect the newly-lowered live limit"

        for c in claims:
            release_task_resources(task_id=c["task_id"], resource_claims=c)

    def test_raising_setting_takes_effect_on_next_call_without_restart(self, monkeypatch):
        from app.orchestration.scheduler.resources import (
            reserve_task_resources,
            release_task_resources,
        )
        from app.db.state import update_settings

        monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
        update_settings({"tts_parallel_cap": 1, "tts_engine_caps": {}})

        c1 = _claim_dict(manifest_max=4, task_id="raise-1")
        c2 = _claim_dict(manifest_max=4, task_id="raise-2")
        r1 = reserve_task_resources(task_type="synthesis", resource_claims=c1)
        assert r1["admitted"] is True
        r2 = reserve_task_resources(task_type="synthesis", resource_claims=c2)
        assert r2["admitted"] is False, "cap=1 must deny the second concurrent task"

        # Raise the setting — next admission attempt for the queued second
        # task must succeed without any process restart.
        update_settings({"tts_parallel_cap": 4})
        r2b = reserve_task_resources(task_type="synthesis", resource_claims=c2)
        assert r2b["admitted"] is True, "raising the live limit must take effect on the very next reserve call"

        release_task_resources(task_id="raise-1", resource_claims=c1)
        release_task_resources(task_id="raise-2", resource_claims=c2)

    def test_ensure_min_cap_only_ever_sees_manifest_ceiling_not_live_limit(self, monkeypatch):
        """A lowered live limit must never regrow/shrink the structural semaphore
        cap via ensure_min_cap — only the manifest ceiling reaches it."""
        from app.orchestration.scheduler import resources as res
        from app.db.state import update_settings

        monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
        update_settings({"tts_parallel_cap": 4, "tts_engine_caps": {}})

        c = _claim_dict(manifest_max=4, task_id="ceiling-test")
        res.reserve_task_resources(task_type="synthesis", resource_claims=c)
        sem = res.get_engine_semaphore("gpu")
        assert sem._cap == 4, "structural ceiling must equal manifest_max regardless of the live setting"
        res.release_task_resources(task_id="ceiling-test", resource_claims=c)


# ===========================================================================
# ResourceClaim.cap now means the manifest ceiling
# ===========================================================================


class TestResourceClaimCapMeansManifestCeiling:
    def test_manifest_resource_claim_sets_cap_and_manifest_max_equal(self):
        from app.orchestration.tasks.synthesis import _manifest_resource_claim

        with patch(
            "app.tts_server.plugin_loader.get_manifest_max_concurrent_workers",
            return_value=4,
        ), patch("app.orchestration.scheduler.cap_settings.resolve_effective_cap", return_value=1) as mock_resolve:
            claim = _manifest_resource_claim("some-engine")

        assert claim.cap == 4, "cap must be the manifest ceiling, not the effective/live cap"
        assert claim.manifest_max == 4
        # This function must not bake resolve_effective_cap into `cap` anymore —
        # the live limit is resolved later, inside reserve_task_resources.
        mock_resolve.assert_not_called()

    def test_generation_pool_sizing_uses_manifest_ceiling_not_lowered_live_cap(self):
        """W-PAR task 014 step 3: generation.py's chapter-parent ThreadPoolExecutor
        sizing reads `_manifest_resource_claim(engine_id).cap`. Under this task's
        change `.cap` is the manifest ceiling, so a mid-chapter live-cap LOWER
        (`tts_parallel_cap`/`tts_engine_caps`) must NOT shrink the parent pool's
        bound — per-child admission (`reserve_task_resources`) is the sole live
        throttle; the pool itself sizes to the ceiling so a later live-cap RAISE
        also takes effect without recreating the pool."""
        from app.orchestration.tasks.synthesis import _manifest_resource_claim
        from app.db.state import update_settings

        with patch(
            "app.tts_server.plugin_loader.get_manifest_max_concurrent_workers",
            return_value=4,
        ):
            # Even with the live setting lowered to 1, the claim's `cap`
            # (what generation.py reads for pool sizing) must stay at the
            # manifest ceiling (4), not the lowered live/effective value.
            update_settings({"tts_parallel_cap": 1, "tts_engine_caps": {}})
            claim = _manifest_resource_claim("pool-sizing-engine")

        assert claim.cap == 4, "chapter-parent pool sizing must use the manifest ceiling, not a lowered live cap"
