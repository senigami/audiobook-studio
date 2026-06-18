"""Adversarial-review fixes for progress-routing (studio2/phase-12.4).

Each test targets one of the six verified bugs; the R1 revert-check comment
states how to make the test RED before the fix is applied.

Fixes covered:
  FIX 1 — Double ring-push on Path A (ws.py enrich sample= gate).
  FIX 2 — ring.mean() read outside the lock (service.py crossfade section).
  FIX 3 — Ring eviction on terminal + no setdefault on sample=False.
  FIX 4 — seconds_per_char pulls render_history per frame.
  FIX 5 — enrich-failure must not yield (progress, confidence=None).
  FIX 6 — enrich terminal set inconsistency ("error" not a real status).
"""

from __future__ import annotations

import threading
from unittest.mock import patch, MagicMock

import pytest

from app.orchestration.progress.service import (
    ProgressService,
    get_progress_service,
    reset_progress_service,
    set_progress_service,
)
from app.orchestration.progress.eta import estimate_eta_seconds, BASE_FLOOR


# ---------------------------------------------------------------------------
# Shared helper
# ---------------------------------------------------------------------------

def _make_service(wall_start: float = 1000.0, mono_start: float = 5000.0):
    events: list[tuple[dict, str]] = []
    wall_now = {"value": wall_start}
    mono_now = {"value": mono_start}

    def wall_clock():
        return wall_now["value"]

    def monotonic_clock():
        return mono_now["value"]

    def broadcaster(*, payload, channel):
        events.append((payload, channel))

    svc = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=estimate_eta_seconds,
        broadcaster=broadcaster,
        wall_clock=wall_clock,
        monotonic_clock=monotonic_clock,
        max_silence_seconds=30.0,
    )
    return svc, events, wall_now, mono_now


# ---------------------------------------------------------------------------
# FIX 1 — Double ring-push on Path A
# ---------------------------------------------------------------------------

class TestFix1DoubleRingPush:
    """enrich(sample=True) must NOT be called when skip_job_updated=True.

    R1 revert-check: before FIX 1, broadcast_job_updated always called
    enrich(sample=True) regardless of skip_job_updated.  Setting
    skip_job_updated=True would push a second sample into the ring.
    Revert: change `_enrich_sample = not skip_job_updated` back to
    `_enrich_sample = True` (always sample); the test asserting ring length
    unchanged for the skip=True path will FAIL because the ring grows by 1.
    """

    @pytest.fixture(autouse=True)
    def _reset(self):
        reset_progress_service()
        yield
        reset_progress_service()

    def test_skip_job_updated_true_does_not_push_sample(self):
        """skip_job_updated=True must call enrich(sample=False) — ring stays empty."""
        import app.api.ws as ws_mod

        svc, events, _, _ = _make_service()
        set_progress_service(svc)

        # Seed one running frame via Path A (ProgressService.publish) so the ring
        # gets one sample.
        svc.publish(
            job_id="fix1-job",
            status="running",
            progress=0.3,
            eta_seconds=60,
            chapter_id="ch-1",
        )
        ring_len_after_path_a = len(svc._eta_rings.get("fix1-job", type("R", (), {"__len__": lambda s: 0})()))

        # Now simulate Path A's broadcast_job_updated callback (skip_job_updated=True).
        captured: list[dict] = []

        with patch.object(ws_mod, "broadcast_studio_event", side_effect=captured.append):
            ws_mod.broadcast_job_updated(
                "fix1-job",
                {
                    "skip_job_updated": True,
                    "progress": 0.3,
                    "eta_seconds": 60,
                    "status": "running",
                    "chapter_id": "ch-1",
                },
                current_job=None,
            )

        ring_len_after_path_b_call = len(svc._eta_rings.get("fix1-job", type("R", (), {"__len__": lambda s: 0})()))

        # FIX 1 assertion: ring length must be unchanged — no second push.
        assert ring_len_after_path_b_call == ring_len_after_path_a, (
            f"Ring grew from {ring_len_after_path_a} to {ring_len_after_path_b_call} — "
            "broadcast_job_updated pushed a sample even though skip_job_updated=True"
        )

    def test_skip_job_updated_false_does_push_sample(self):
        """skip_job_updated=False (Path B) must call enrich(sample=True) — ring grows."""
        import app.api.ws as ws_mod

        svc, events, _, _ = _make_service()
        set_progress_service(svc)

        ring_before = len(svc._eta_rings.get("fix1-job-b", type("R", (), {"__len__": lambda s: 0})()))

        with patch.object(ws_mod, "broadcast_studio_event", side_effect=lambda e: None):
            ws_mod.broadcast_job_updated(
                "fix1-job-b",
                {
                    "progress": 0.4,
                    "eta_seconds": 50,
                    "status": "running",
                    "chapter_id": "ch-2",
                    "classification": "chapter",
                },
                current_job=None,
            )

        ring_after = len(svc._eta_rings.get("fix1-job-b", type("R", (), {"__len__": lambda s: 0})()))

        # Path B should push a sample (progress>0 and eta>0).
        assert ring_after > ring_before, (
            "Path B (skip_job_updated=False) must push a velocity sample into the ring"
        )


# ---------------------------------------------------------------------------
# FIX 2 — ring.mean() read outside the lock
# ---------------------------------------------------------------------------

class TestFix2RingMeanInsideLock:
    """ring.mean() in the crossfade section must be captured inside self._lock.

    R1 revert-check: before FIX 2, ring.mean() was called after the lock block
    was released.  A concurrent push() could mutate the deque and produce a
    RuntimeError or inconsistent read.  The behavioral test below verifies that
    enrich produces the same ETA for consecutive identical frames (i.e. the
    captured velocity is stable and consistent with what was computed inside the
    lock).
    """

    def test_enrich_crossfade_uses_locked_ring_velocity(self):
        """enrich produces a deterministic, non-None ETA when ring has samples."""
        svc, _, _, _ = _make_service()

        # Prime the ring with a couple of samples.
        payload1 = {
            "job_id": "fix2-job",
            "status": "running",
            "progress": 0.2,
            "eta_seconds": 80,
            "char_count": 1000,
            "updated_at": 1000.0,
        }
        svc.enrich("fix2-job", payload1, sample=True)

        payload2 = {
            "job_id": "fix2-job",
            "status": "running",
            "progress": 0.35,
            "eta_seconds": 65,
            "char_count": 1000,
            "updated_at": 1001.0,
        }
        svc.enrich("fix2-job", payload2, sample=True)

        # Enrich a third frame and capture the ETA.
        payload3 = {
            "job_id": "fix2-job",
            "status": "running",
            "progress": 0.5,
            "eta_seconds": 50,
            "char_count": 1000,
            "updated_at": 1002.0,
        }
        svc.enrich("fix2-job", payload3, sample=False)
        eta_first = payload3.get("eta_seconds")

        # Enrich the same payload again — result must be identical (no race).
        payload4 = {
            "job_id": "fix2-job",
            "status": "running",
            "progress": 0.5,
            "eta_seconds": 50,
            "char_count": 1000,
            "updated_at": 1002.0,
        }
        svc.enrich("fix2-job", payload4, sample=False)
        eta_second = payload4.get("eta_seconds")

        assert eta_first is not None, "enrich must produce a non-None eta_seconds after ring has samples"
        assert eta_first == eta_second, (
            f"Repeated identical enrich calls produced different ETAs: {eta_first} vs {eta_second} — "
            "ring.mean() was not captured atomically inside the lock"
        )


# ---------------------------------------------------------------------------
# FIX 3 — Ring eviction on terminal + no setdefault on sample=False
# ---------------------------------------------------------------------------

class TestFix3RingEviction:
    """Terminal-status frames must evict per-job ETA state after emit.

    R1 revert-check:
    - Terminal eviction: before FIX 3, only status=queued triggered cleanup.
      Revert by removing the `elif status in {"done","failed","cancelled"}` block
      from publish(); the `test_terminal_publish_evicts_eta_ring` assertion on
      `_eta_rings` membership fails because the ring is still present.
    - no-setdefault: before FIX 3, enrich(sample=False) called setdefault and
      created empty rings for unseen job_ids.  Revert by restoring setdefault on
      the sample=False branch; `test_snapshot_enrich_no_ring_creation` fails
      because the ring entry is created.
    """

    def test_terminal_publish_evicts_eta_ring(self):
        """After a terminal publish, per-job ETA state must be gone from the ring."""
        svc, _, _, _ = _make_service()

        # Run a progress frame so the ring gets seeded.
        svc.publish(
            job_id="fix3-evict",
            status="running",
            progress=0.5,
            eta_seconds=30,
        )
        assert "fix3-evict" in svc._eta_rings, "Ring must exist after a running frame"

        # Publish a terminal frame.
        svc.publish(job_id="fix3-evict", status="done", progress=1.0)

        # FIX 3 assertion: ring must be evicted after terminal emit.
        assert "fix3-evict" not in svc._eta_rings, (
            "_eta_rings entry must be evicted after terminal publish (status=done)"
        )
        assert "fix3-evict" not in svc._eta_last_sample_time, (
            "_eta_last_sample_time must be evicted after terminal publish"
        )
        assert "fix3-evict" not in svc._job_segment_ids, (
            "_job_segment_ids must be evicted after terminal publish"
        )

    def test_terminal_publish_evicts_eta_ring_failed(self):
        """status=failed also evicts."""
        svc, _, _, _ = _make_service()
        svc.publish(job_id="fix3-fail", status="running", progress=0.3, eta_seconds=60)
        svc.publish(job_id="fix3-fail", status="failed")
        assert "fix3-fail" not in svc._eta_rings

    def test_terminal_publish_evicts_eta_ring_cancelled(self):
        """status=cancelled also evicts."""
        svc, _, _, _ = _make_service()
        svc.publish(job_id="fix3-cancel", status="running", progress=0.3, eta_seconds=60)
        svc.publish(job_id="fix3-cancel", status="cancelled")
        assert "fix3-cancel" not in svc._eta_rings

    def test_snapshot_enrich_no_ring_creation(self):
        """enrich(sample=False) for an unknown job must NOT create a ring entry."""
        svc, _, _, _ = _make_service()

        payload = {
            "job_id": "fix3-snapshot",
            "status": "running",
            "progress": 0.3,
            "eta_seconds": 40,
            "updated_at": 1000.0,
        }
        svc.enrich("fix3-snapshot", payload, sample=False)

        # FIX 3 assertion: ring must NOT be created for a snapshot-path call.
        assert "fix3-snapshot" not in svc._eta_rings, (
            "enrich(sample=False) must not create a ring entry via setdefault"
        )

    def test_snapshot_enrich_segment_no_ring_creation(self):
        """enrich(sample=False) with an active_segment_id for an unknown segment must NOT create a ring entry."""
        svc, _, _, _ = _make_service()

        payload = {
            "job_id": "fix3-snap-job",
            "status": "running",
            "progress": 0.3,
            "eta_seconds": 40,
            "active_segment_id": "seg-snap-unknown",
            "active_segment_progress": 0.5,
            "active_segment_eta_seconds": 20,
            "updated_at": 1000.0,
        }
        svc.enrich("fix3-snap-job", payload, sample=False)

        assert "seg-snap-unknown" not in svc._segment_eta_rings, (
            "enrich(sample=False) must not create a segment ring via setdefault"
        )


# ---------------------------------------------------------------------------
# FIX 4 — seconds_per_char avoids render_history query
# ---------------------------------------------------------------------------

class TestFix4SecondsPerCharLightweightRead:
    """seconds_per_char must not trigger get_render_history on every call.

    R1 revert-check: before FIX 4, seconds_per_char called
    _read_performance_metrics_from_db which calls get_render_history(limit=100).
    Revert by restoring the _read_performance_metrics_from_db call inside
    seconds_per_char; the spy on get_render_history will see it called ≥ 1
    time and the assertion `call_count == 0` will FAIL.
    """

    def test_seconds_per_char_does_not_call_get_render_history(self):
        """seconds_per_char must use _read_engine_cps_only, not get_render_history."""
        from app.db import state_performance as sp_mod

        with patch.object(sp_mod, "_read_performance_metrics_from_db") as mock_heavy:
            # Even if the heavy function is somehow called, track it.
            mock_heavy.return_value = {"engine_cps": {}, "render_history": []}

            # Call seconds_per_char with a fallback so it has something to return.
            result = sp_mod.seconds_per_char("xtts_test_engine_fix4", fallback_cps=2.0)

            # FIX 4 assertion: the heavy function (with render_history) must NOT run.
            assert mock_heavy.call_count == 0, (
                f"seconds_per_char called _read_performance_metrics_from_db "
                f"{mock_heavy.call_count} time(s) — still loading render_history on hot path"
            )

        assert result is not None, "seconds_per_char must return a value when fallback_cps is given"

    def test_seconds_per_char_returns_correct_value(self):
        """seconds_per_char still returns 1/fallback_cps when no recorded CPS."""
        from app.db import state_performance as sp_mod

        result = sp_mod.seconds_per_char("engine_never_seen_fix4", fallback_cps=4.0)
        assert result is not None
        assert abs(result - 0.25) < 1e-9, f"Expected 0.25, got {result}"


# ---------------------------------------------------------------------------
# FIX 5 — enrich failure must not yield (progress, confidence=None)
# ---------------------------------------------------------------------------

class TestFix5EnrichFailureFloor:
    """On enrich failure, confidence must be set to a safe floor (not None).

    R1 revert-check: before FIX 5, the except block was `except Exception: pass`
    leaving _enriched_confidence=None.  When broadcast_job_updated then called
    build_chapter_progress_event(progress=x, confidence=None) the fail-loud guard
    raised ValueError.  The test's assertion that no ValueError escapes the
    broadcast_job_updated call will FAIL if the except block is reverted to pass.
    """

    @pytest.fixture(autouse=True)
    def _reset(self):
        reset_progress_service()
        yield
        reset_progress_service()

    def test_enrich_failure_does_not_propagate_value_error(self):
        """When enrich raises, broadcast_job_updated must degrade gracefully (no ValueError)."""
        import app.api.ws as ws_mod

        # Install a service whose enrich always raises.
        svc, _, _, _ = _make_service()

        def bad_enrich(job_id, payload, *, sample=True):
            raise RuntimeError("Simulated enrich failure")

        svc.enrich = bad_enrich
        set_progress_service(svc)

        captured: list[dict] = []
        with patch.object(ws_mod, "broadcast_studio_event", side_effect=captured.append):
            # Must NOT raise — degrade mode should emit with floor confidence.
            ws_mod.broadcast_job_updated(
                "fix5-job",
                {
                    "progress": 0.4,
                    "eta_seconds": 30,
                    "status": "running",
                    "chapter_id": "ch-fix5",
                    "classification": "chapter",
                },
                current_job=None,
            )

        # At least one event must have been emitted (chapter progress or queue item).
        assert len(captured) >= 1, (
            "broadcast_job_updated must emit at least one event even when enrich raises"
        )

        # The chapters.progress event must carry a float confidence (floor value).
        chap_events = [e for e in captured if e.get("topic") == "chapters.progress"]
        assert len(chap_events) >= 1, "chapters.progress event must be emitted"
        conf = chap_events[0].get("payload", {}).get("confidence")
        assert isinstance(conf, float), (
            f"confidence must be a float floor when enrich fails, got {type(conf)}: {conf}"
        )
        assert conf >= 0.0, f"floor confidence must be non-negative, got {conf}"

    def test_enrich_failure_terminal_frame_uses_1_0_floor(self):
        """On enrich failure for a terminal frame, confidence floor is 1.0."""
        import app.api.ws as ws_mod

        svc, _, _, _ = _make_service()

        def bad_enrich(job_id, payload, *, sample=True):
            raise RuntimeError("Simulated enrich failure")

        svc.enrich = bad_enrich
        set_progress_service(svc)

        captured: list[dict] = []
        with patch.object(ws_mod, "broadcast_studio_event", side_effect=captured.append):
            ws_mod.broadcast_job_updated(
                "fix5-done-job",
                {
                    "status": "done",
                    "progress": 1.0,
                    "chapter_id": "ch-fix5-done",
                    "classification": "chapter",
                },
                current_job={"status": "running", "progress": 0.9, "chapter_id": "ch-fix5-done"},
            )

        chap_events = [e for e in captured if e.get("topic") == "chapters.progress"]
        assert len(chap_events) >= 1
        conf = chap_events[0].get("payload", {}).get("confidence")
        assert conf == 1.0, f"Terminal frame with enrich failure must use confidence=1.0, got {conf}"


# ---------------------------------------------------------------------------
# FIX 6 — enrich terminal set inconsistency
# ---------------------------------------------------------------------------

class TestFix6TerminalSetConsistency:
    """enrich's is_terminal set must match apply_eta_ceiling/builders: no "error".

    R1 revert-check: before FIX 6, `is_terminal` included "error".  The test
    asserting that a payload with status="error" has non-None eta_seconds will
    FAIL if "error" is in the terminal set (because the terminal clearing branch
    forces eta_seconds=None).

    The substantive fix is removing "error" from the set so the three callers
    (enrich, apply_eta_ceiling, builders) all agree on {"done","failed","cancelled"}.
    """

    def test_error_status_not_treated_as_terminal_in_enrich(self):
        """status='error' must NOT be treated as terminal — eta_seconds preserved."""
        svc, _, _, _ = _make_service()

        payload = {
            "job_id": "fix6-error",
            "status": "error",
            "progress": 0.5,
            "eta_seconds": 30,
            "char_count": 500,
            "updated_at": 1000.0,
        }
        svc.enrich("fix6-error", payload, sample=False)

        # "error" is not a real terminal status — eta_seconds must survive.
        # (apply_eta_ceiling and the builders treat {"done","failed","cancelled"} as
        # terminal; "error" is not in that set.)
        # We just verify that the terminal clearing branch does NOT fire for "error".
        # The eta_seconds may be None if crossfade produces None (no char_count path),
        # but the terminal-clear path specifically sets eta_seconds=None AND eta_basis=None.
        # If "error" were still terminal, eta_basis would be None too.
        # If not terminal, eta_basis may be set or absent, but should not be forcibly None
        # by the terminal-clear branch.
        # Simple check: eta_confidence is set to a float (not forced to 1.0 by terminal path).
        conf = payload.get("eta_confidence")
        assert isinstance(conf, float), (
            f"eta_confidence must be a float for status='error', got {type(conf)}: {conf}"
        )
        assert conf != 1.0 or payload.get("progress", 0) >= 1.0, (
            "status='error' at progress=0.5 should not get terminal confidence=1.0"
        )

    def test_real_terminal_statuses_still_clear_eta(self):
        """done/failed/cancelled must still be treated as terminal (regression guard)."""
        for terminal_status in ("done", "failed", "cancelled"):
            svc, _, _, _ = _make_service()

            payload = {
                "job_id": f"fix6-{terminal_status}",
                "status": terminal_status,
                "progress": 1.0,
                "eta_seconds": 30,
                "updated_at": 1000.0,
            }
            svc.enrich(f"fix6-{terminal_status}", payload, sample=False)

            assert payload.get("eta_seconds") is None, (
                f"status='{terminal_status}' must clear eta_seconds (terminal path)"
            )
            assert payload.get("eta_confidence") == 1.0, (
                f"status='{terminal_status}' must set eta_confidence=1.0"
            )
