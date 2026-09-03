"""TDD tests for W-PAR task 007: bracketed ETA under parallelism, the
cap-default-1 toggle-as-setting, and the folded-in per-engine-id
admission finding.

Written BEFORE the implementation to confirm red on current code (R1).
"""

from __future__ import annotations

from unittest.mock import patch

import pytest


# ===========================================================================
# Test A — bracketed ETA under parallel workers (H, R-D, R1)
# ===========================================================================


class TestBracketedEtaUnderParallelism:
    """Drive a 6-segment render (3 XTTS + 3 Voxtral, cap=2 per engine)
    through the ETA model with a stubbed completion sequence delivering
    segments at mixed speeds.
    """

    def _completions(self):
        # (pool, chars_completed, wall_seconds)
        return [
            ("xtts", 1000, 20.0),    # xtts cps = 50
            ("voxtral", 2000, 10.0),  # voxtral cps = 200
            ("xtts", 1200, 24.0),    # xtts cps = 50
            ("voxtral", 1800, 9.0),  # voxtral cps = 200
            ("xtts", 900, 18.0),     # xtts cps = 50
            ("voxtral", 2100, 10.5),  # voxtral cps = 200
        ]

    def test_estimating_before_three_completions(self):
        from app.orchestration.progress.eta import BracketedEtaTracker

        tracker = BracketedEtaTracker(pool_caps={"xtts": 2, "voxtral": 2})
        completions = self._completions()
        for pool, chars, wall in completions[:2]:
            tracker.record_completion(pool=pool, chars_completed=chars, wall_seconds=wall)

        result = tracker.bracket(remaining_chars=5000)
        assert result.eta_display == "estimating…"

    def test_bracket_after_three_completions_has_low_less_than_high(self):
        from app.orchestration.progress.eta import BracketedEtaTracker

        tracker = BracketedEtaTracker(pool_caps={"xtts": 2, "voxtral": 2})
        for pool, chars, wall in self._completions():
            tracker.record_completion(pool=pool, chars_completed=chars, wall_seconds=wall)

        result = tracker.bracket(remaining_chars=5000)
        assert result.eta_low_seconds is not None
        assert result.eta_high_seconds is not None
        assert result.eta_low_seconds < result.eta_high_seconds
        assert result.eta_display.startswith("~")
        assert "–" in result.eta_display  # en dash bracket

    def test_bottleneck_rate_is_min_of_pool_rates(self):
        """Bottleneck rate = min(pool_cps * pool_cap) across pools."""
        from app.orchestration.progress.eta import BracketedEtaTracker

        tracker = BracketedEtaTracker(pool_caps={"xtts": 2, "voxtral": 2})
        for pool, chars, wall in self._completions():
            tracker.record_completion(pool=pool, chars_completed=chars, wall_seconds=wall)

        # xtts: 3100 chars / 62.0 s = 50 cps; pool_rate = 50 * 2 = 100
        # voxtral: 5900 chars / 29.5 s = 200 cps; pool_rate = 200 * 2 = 400
        # bottleneck = min(100, 400) = 100
        effective_cps = tracker.effective_cps()
        assert effective_cps is not None
        assert effective_cps == pytest.approx(100.0, rel=0.05)


class TestBracketedEtaCap1Parity:
    """Test B — cap=1 ETA parity (INV-1, guard).

    Guard test, not a bug-fix test: at cap=1 the bracketed model must reduce
    exactly to today's single-stream CPS with eta_low == eta_high (no bracket).
    """

    def test_single_worker_cap1_has_no_bracket(self):
        from app.orchestration.progress.eta import BracketedEtaTracker

        tracker = BracketedEtaTracker(pool_caps={"xtts": 1})
        # Single-stream completions, one pool only.
        tracker.record_completion(pool="xtts", chars_completed=1000, wall_seconds=20.0)
        tracker.record_completion(pool="xtts", chars_completed=1000, wall_seconds=20.0)
        tracker.record_completion(pool="xtts", chars_completed=1000, wall_seconds=20.0)

        result = tracker.bracket(remaining_chars=2000)
        assert result.eta_low_seconds == result.eta_high_seconds
        assert result.eta_display is not None
        assert "–" not in result.eta_display
        assert result.eta_display.startswith("~")

    def test_cap1_matches_single_stream_cps_numerically(self):
        from app.orchestration.progress.eta import BracketedEtaTracker, estimate_eta_seconds

        tracker = BracketedEtaTracker(pool_caps={"xtts": 1})
        tracker.record_completion(pool="xtts", chars_completed=1000, wall_seconds=20.0)
        tracker.record_completion(pool="xtts", chars_completed=1000, wall_seconds=20.0)
        tracker.record_completion(pool="xtts", chars_completed=1000, wall_seconds=20.0)

        result = tracker.bracket(remaining_chars=2000)
        # cps = 3000 / 60 = 50 -> eta = 2000 / 50 = 40
        legacy = estimate_eta_seconds(completed_units=0, total_units=2000, observed_cps=50.0)
        assert result.eta_low_seconds == legacy
        assert result.eta_high_seconds == legacy


# ===========================================================================
# Test C — toggle cap enforcement (INV-1, INV-5, R1)
# ===========================================================================


class TestEffectiveCapResolution:
    """TTS_PARALLEL_CAP / TTS_ENGINE_CAPS settings, clamped by manifest max."""

    def test_default_cap_is_two_clamped_by_manifest_max(self):
        """2026-07-05: parallel rendering ships as the default (was cap=1 'ships dark')."""
        from app.orchestration.scheduler.cap_settings import DEFAULT_GLOBAL_CAP, resolve_effective_cap

        assert DEFAULT_GLOBAL_CAP == 2

        effective = resolve_effective_cap(engine_id="tts_xtts", manifest_max=8, settings={})
        assert effective == 2

        # A manifest ceiling below the new default (e.g. Voxtral/Mixed at 1)
        # still wins — the default never overrides plugin-author safety limits.
        effective_clamped = resolve_effective_cap(engine_id="tts_voxtral", manifest_max=1, settings={})
        assert effective_clamped == 1

    def test_explicit_cap_one_setting_still_overrides_the_new_default(self):
        """An operator/test can still force sequential behavior via an explicit setting."""
        from app.orchestration.scheduler.cap_settings import resolve_effective_cap

        effective = resolve_effective_cap(
            engine_id="tts_xtts", manifest_max=8, settings={"tts_parallel_cap": 1}
        )
        assert effective == 1

    def test_global_parallel_cap_clamped_by_manifest_max(self):
        from app.orchestration.scheduler.cap_settings import resolve_effective_cap

        settings = {"tts_parallel_cap": 3}
        effective = resolve_effective_cap(engine_id="tts_xtts", manifest_max=2, settings=settings)
        assert effective == 2, "manifest max must win when smaller than the requested cap"

    def test_per_engine_cap_override_wins_over_global(self):
        from app.orchestration.scheduler.cap_settings import resolve_effective_cap

        settings = {"tts_parallel_cap": 1, "tts_engine_caps": {"tts_voxtral": 4}}
        effective = resolve_effective_cap(engine_id="tts_voxtral", manifest_max=8, settings=settings)
        assert effective == 4

    def test_per_engine_cap_still_clamped_by_manifest_max(self):
        from app.orchestration.scheduler.cap_settings import resolve_effective_cap

        settings = {"tts_engine_caps": {"tts_voxtral": 8}}
        effective = resolve_effective_cap(engine_id="tts_voxtral", manifest_max=4, settings=settings)
        assert effective == 4

    def test_env_var_global_cap_used_when_no_setting(self, monkeypatch):
        from app.orchestration.scheduler.cap_settings import resolve_effective_cap

        monkeypatch.setenv("TTS_PARALLEL_CAP", "3")
        effective = resolve_effective_cap(engine_id="tts_xtts", manifest_max=8, settings={})
        assert effective == 3

    def test_no_engine_id_branching_same_code_path_for_any_engine(self):
        """INV-5: the same resolution function applies uniformly to any engine_id."""
        from app.orchestration.scheduler.cap_settings import resolve_effective_cap

        settings = {"tts_parallel_cap": 2}
        for engine_id in ("tts_xtts", "tts_voxtral", "some_future_engine"):
            effective = resolve_effective_cap(engine_id=engine_id, manifest_max=5, settings=settings)
            assert effective == 2


# ===========================================================================
# Review finding — per-engine-id admission independent of the shared class gate
# ===========================================================================


class TestPerEngineIdAdmission:
    """Two different engine IDs resolving to the same engine_class must NOT
    silently converge to whichever cap was requested LARGEST — each engine_id
    gets its own admission ceiling in addition to the shared class gate.
    """

    def setup_method(self):
        from app.orchestration.scheduler import resources as _res  # noqa: PLC0415
        _res.set_paused(False)
        for _sem in list(_res._engine_semaphores.values()):
            _sem.reset()
        for _sem in list(_res._engine_id_semaphores.values()):
            _sem.reset()

    def test_two_engine_ids_same_class_do_not_converge_to_largest_cap(self, monkeypatch):
        """engine_a (cap=1) and engine_b (cap=4) both map to engine_class='gpu'.

        Before the fix: get_engine_semaphore("gpu", cap) grows the SHARED class
        semaphore to whichever cap was requested largest (self-healing grow-only
        fix from commit 7dd218aa) — so engine_a would silently be admitted past
        its own declared cap=1 once engine_b's cap=4 request grew the shared
        semaphore. The fix adds a per-engine-id ceiling independent of the
        class-level gate.
        """
        monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
        from app.orchestration.scheduler.resources import (  # noqa: PLC0415
            reserve_task_resources,
            release_task_resources,
            get_engine_semaphore,
        )

        # Class semaphore has ample headroom (cap=4) so the class-level gate is
        # never the reason engine_a is denied — only engine_a's OWN per-engine-id
        # ceiling (cap=1) is under test here.
        get_engine_semaphore("gpu", 4).reset()

        # engine_b requests cap=4 for itself and takes 3 of the 4 class slots —
        # plenty of class-level headroom remains for engine_a.
        admitted = []
        for i in range(3):
            r = reserve_task_resources(
                task_type="synthesis",
                resource_claims={
                    "task_id": f"b{i}",
                    "engine_class": "gpu",
                    "engine_id": "engine_b",
                    "cap": 4,
                },
            )
            admitted.append(r["admitted"])
        assert all(admitted), "engine_b should be admitted up to its own cap=4"

        # engine_a declares cap=1 for ITSELF. The shared "gpu" class semaphore
        # still has one free slot (3/4 held by engine_b) — a class-only gate
        # would admit a second engine_a task. The per-engine-id ceiling must
        # deny it once engine_a itself is holding its own single slot.
        r_a1 = reserve_task_resources(
            task_type="synthesis",
            resource_claims={
                "task_id": "a1",
                "engine_class": "gpu",
                "engine_id": "engine_a",
                "cap": 1,
            },
        )
        r_a2 = reserve_task_resources(
            task_type="synthesis",
            resource_claims={
                "task_id": "a2",
                "engine_class": "gpu",
                "engine_id": "engine_a",
                "cap": 1,
            },
        )
        assert r_a1["admitted"] is True
        assert r_a2["admitted"] is False, (
            "engine_a declared cap=1 for itself — it must not be able to run a "
            "second concurrent task just because the shared class semaphore "
            "(grown by engine_b, a same-class sibling) still has headroom."
        )

        # Cleanup.
        for i in range(3):
            release_task_resources(
                task_id=f"b{i}",
                resource_claims={"task_id": f"b{i}", "engine_class": "gpu", "engine_id": "engine_b", "cap": 4},
            )
        release_task_resources(
            task_id="a1",
            resource_claims={"task_id": "a1", "engine_class": "gpu", "engine_id": "engine_a", "cap": 1},
        )

    def test_engine_id_denial_leaves_global_cap_count_unchanged(self, monkeypatch):
        """A denial by the per-engine-id gate must not leak or inflate the
        global cap gate's active-slot count.

        On a per-engine-id denial, `reserve_task_resources` releases the
        class semaphore and the global cap slot inline, then falls through to
        a second `if not admitted and _used_global_cap` release further down.
        `EngineClassSemaphore.release` is documented idempotent for a
        `task_id` no longer held, so the fallthrough release is a safe no-op
        — this test pins that safety property (a non-idempotent release
        implementation would otherwise silently free one MORE global cap slot
        than was ever reserved for every denied-by-engine-id request).
        """
        monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
        from app.orchestration.scheduler.resources import (  # noqa: PLC0415
            reserve_task_resources,
            release_task_resources,
            get_engine_semaphore,
            get_engine_id_semaphore,
            _global_cap_gate,
        )

        get_engine_semaphore("double_release_test_class", 5).reset()
        get_engine_id_semaphore("double_release_engine", 1).reset()

        # Occupy the engine_id's own cap=1 slot with a different task first.
        r0 = reserve_task_resources(
            task_type="synthesis",
            resource_claims={
                "task_id": "t0",
                "engine_class": "double_release_test_class",
                "engine_id": "double_release_engine",
                "cap": 1,
            },
        )
        assert r0["admitted"] is True

        before = _global_cap_gate.active_count
        r1 = reserve_task_resources(
            task_type="synthesis",
            resource_claims={
                "task_id": "t1",
                "engine_class": "double_release_test_class",
                "engine_id": "double_release_engine",
                "cap": 1,
            },
        )
        assert r1["admitted"] is False, "t1 must be denied by the per-engine-id gate (t0 already holds it)"
        after = _global_cap_gate.active_count
        assert after == before, (
            "global cap gate active count changed after a denied reservation — "
            "the global cap slot was released more than once for the single "
            "denied request, silently inflating available global concurrency."
        )

        release_task_resources(
            task_id="t0",
            resource_claims={"task_id": "t0", "engine_class": "double_release_test_class", "engine_id": "double_release_engine", "cap": 1},
        )

    def test_no_engine_id_declared_falls_back_to_class_only_gate(self, monkeypatch):
        """Backward compatibility: claims without engine_id (legacy callers /
        existing tests) are governed only by the class-level gate — no new
        per-engine-id ceiling is silently introduced for callers that never
        opted in by declaring engine_id.
        """
        monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "1")
        from app.orchestration.scheduler.resources import (  # noqa: PLC0415
            reserve_task_resources,
            release_task_resources,
            get_engine_semaphore,
        )

        get_engine_semaphore("no_engine_id_test_class", 2).reset()

        r1 = reserve_task_resources(
            task_type="synthesis",
            resource_claims={"task_id": "n1", "engine_class": "no_engine_id_test_class", "cap": 2},
        )
        r2 = reserve_task_resources(
            task_type="synthesis",
            resource_claims={"task_id": "n2", "engine_class": "no_engine_id_test_class", "cap": 2},
        )
        assert r1["admitted"] is True
        assert r2["admitted"] is True

        release_task_resources(
            task_id="n1", resource_claims={"task_id": "n1", "engine_class": "no_engine_id_test_class", "cap": 2},
        )
        release_task_resources(
            task_id="n2", resource_claims={"task_id": "n2", "engine_class": "no_engine_id_test_class", "cap": 2},
        )

    def test_currently_live_engines_unaffected_toggle_off(self, monkeypatch):
        """With ENGINE_CLASS_ADMISSION explicitly disabled, the per-engine-id
        gate must not change behavior at all — everything still funnels
        through the single shared exclusive gate (legacy fallback, still
        available for an operator who forces the old behavior).
        """
        monkeypatch.setenv("ENGINE_CLASS_ADMISSION", "0")
        from app.orchestration.scheduler import resources as _res  # noqa: PLC0415
        from app.orchestration.scheduler.resources import (  # noqa: PLC0415
            reserve_task_resources,
            release_task_resources,
        )

        _res.get_exclusive_gate().reset()

        r1 = reserve_task_resources(
            task_type="synthesis",
            resource_claims={"task_id": "x1", "engine_class": "gpu", "engine_id": "xtts", "cap": 1},
        )
        r2 = reserve_task_resources(
            task_type="synthesis",
            resource_claims={"task_id": "x2", "engine_class": "gpu", "engine_id": "xtts", "cap": 1},
        )
        assert r1["admitted"] is True
        assert r2["admitted"] is False

        release_task_resources(
            task_id="x1", resource_claims={"task_id": "x1", "engine_class": "gpu", "engine_id": "xtts", "cap": 1},
        )


class TestExclusiveClassRejectsGrowthAboveOne:
    """The 'exclusive' resource class must never be requested at cap > 1 —
    today only ResourceClaim.exclusive_claim() ever constructs it (always
    cap=1), which is safe by accident, not by enforcement. Add an explicit
    rejection so a future caller cannot silently grow it.
    """

    def test_get_engine_semaphore_rejects_exclusive_cap_above_one(self):
        from app.orchestration.scheduler.resources import get_engine_semaphore

        with pytest.raises(ValueError, match="exclusive"):
            get_engine_semaphore("exclusive", 2)

    def test_get_engine_semaphore_allows_exclusive_cap_one(self):
        from app.orchestration.scheduler.resources import get_engine_semaphore

        sem = get_engine_semaphore("exclusive", 1)
        assert sem.active_count == 0

    def test_ensure_min_cap_rejects_growth_above_one_for_exclusive_semaphore(self):
        """A semaphore constructed for the exclusive class must reject growth
        past cap=1 even via the ensure_min_cap self-healing path."""
        from app.orchestration.scheduler.resources import EngineClassSemaphore

        sem = EngineClassSemaphore(cap=1, class_name="exclusive")
        with pytest.raises(ValueError, match="exclusive"):
            sem.ensure_min_cap(2)
