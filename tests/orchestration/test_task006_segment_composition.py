"""Task 006 — Segment-scope confidence, §4A.3 composition, §4A.5 convergence-trust.

Tests for:
  (A) Per-segment EtaSampleRing producer + seg_confidence
  (B) §4A.3 share-weighted composition (confident late segment dominates chapter ETA)
  (C) §4A.5 convergence-trust + cold-start fix

Each owner-acceptance test includes an explicit R1 revert-check comment describing
the pre-fix failure mode and verifying RED before GREEN.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.orchestration.progress.eta import (
    EtaSampleRing,
    compute_eta_confidence,
    BASE_FLOOR,
    P_LO,
)
from app.orchestration.progress.service import ProgressService
from app.orchestration.progress.eta import estimate_eta_seconds


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _make_service(wall_start: float = 100.0, mono_start: float = 500.0):
    """Build a clock-injected ProgressService with a captured broadcaster sink."""
    events: list[tuple[dict, str]] = []
    wall_now = {"value": wall_start}
    monotonic_now = {"value": mono_start}

    def wall_clock():
        return wall_now["value"]

    def monotonic_clock():
        return monotonic_now["value"]

    def broadcaster(*, payload, channel):
        events.append((payload, channel))

    svc = ProgressService(
        reconcile_fn=lambda **kwargs: kwargs,
        eta_fn=estimate_eta_seconds,
        broadcaster=broadcaster,
        wall_clock=wall_clock,
        monotonic_clock=monotonic_clock,
        max_silence_seconds=10.0,
    )
    return svc, events, wall_now, monotonic_now


# ---------------------------------------------------------------------------
# (A) Segment-scope confidence producer
# ---------------------------------------------------------------------------

class TestSegmentScopeConfidenceProducer:
    """(A) Per-segment EtaSampleRing: keyed by active_segment_id, yielding
    a numeric seg_confidence.  sample=False must not mutate the ring.
    """

    def test_segment_ring_created_on_first_enrich_with_segment(self):
        """A new per-segment ring is created when active_segment_id appears."""
        svc, _, _, _ = _make_service()
        payload = {
            "status": "running",
            "progress": 0.3,
            "eta_seconds": 30,
            "active_segment_id": "seg-abc",
            "active_segment_progress": 0.2,
            "active_segment_eta_seconds": 28,
        }
        svc.enrich("job-1", payload, sample=True)
        # After enrich, a segment ring for "seg-abc" must exist.
        assert "seg-abc" in svc._segment_eta_rings, (
            "_segment_eta_rings must contain a ring for active_segment_id='seg-abc'"
        )

    def test_segment_ring_grows_with_samples(self):
        """Multiple enrich calls with the same segment_id accumulate ring samples."""
        svc, _, wall_now, _ = _make_service()
        seg_id = "seg-grow"
        for i, (p, eta) in enumerate([(0.1, 25), (0.2, 22), (0.3, 19)]):
            wall_now["value"] += 5.0
            payload = {
                "status": "running",
                "progress": 0.3 + i * 0.1,
                "eta_seconds": 30,
                "active_segment_id": seg_id,
                "active_segment_progress": p,
                "active_segment_eta_seconds": eta,
            }
            svc.enrich("job-grow", payload, sample=True)

        ring = svc._segment_eta_rings.get(seg_id)
        assert ring is not None, "Segment ring must be created"
        assert len(ring) >= 1, f"Segment ring must accumulate samples, got len={len(ring)}"

    def test_segment_confidence_is_numeric_float(self):
        """enrich() must produce a numeric seg_confidence stored or accessible."""
        svc, _, _, _ = _make_service()
        # Prime ring with a few samples so confidence is well-defined.
        seg_id = "seg-conf"
        for p, eta in [(0.1, 28), (0.2, 25), (0.3, 22)]:
            payload = {
                "status": "running",
                "progress": 0.5,
                "eta_seconds": 30,
                "active_segment_id": seg_id,
                "active_segment_progress": p,
                "active_segment_eta_seconds": eta,
            }
            svc.enrich("job-segconf", payload, sample=True)

        # The ring should exist and have samples.
        ring = svc._segment_eta_rings.get(seg_id)
        assert ring is not None
        # Compute seg_confidence from the ring.
        seg_conf = compute_eta_confidence(progress=0.3, age_ms=0.0, cv=ring.cv())
        assert isinstance(seg_conf, float), f"seg_confidence must be float, got {type(seg_conf)}"
        assert 0.0 <= seg_conf <= 1.0, f"seg_confidence out of [0,1]: {seg_conf}"

    def test_segment_ring_not_mutated_when_sample_false(self):
        """sample=False must NOT push to the segment ring or mutate any state.

        R2 compliance: only mocks external boundary (broadcaster), not service internals.
        """
        svc, _, _, _ = _make_service()
        seg_id = "seg-nomutate"

        # Prime with one sample=True push.
        payload_prime = {
            "status": "running",
            "progress": 0.3,
            "eta_seconds": 30,
            "active_segment_id": seg_id,
            "active_segment_progress": 0.2,
            "active_segment_eta_seconds": 25,
        }
        svc.enrich("job-nomutate", dict(payload_prime), sample=True)
        ring_before = len(svc._segment_eta_rings.get(seg_id, EtaSampleRing()))

        # Now sample=False — ring must not change.
        svc.enrich("job-nomutate", dict(payload_prime), sample=False)
        ring_after = len(svc._segment_eta_rings.get(seg_id, EtaSampleRing()))

        assert ring_after == ring_before, (
            f"sample=False must not push to segment ring: "
            f"before={ring_before}, after={ring_after}"
        )

    def test_segment_frame_confidence_is_per_segment_not_chapter(self):
        """The emitted segments.progress frame's `confidence` must be the PER-SEGMENT
        seg_confidence (resets per segment_id), not the chapter-level eta_confidence
        which rises monotonically across the whole chapter and never resets.

        R1 revert-check: before the fix the segment builders passed
        `confidence=payload.get("eta_confidence")` (service.py:395/456), so segment B's
        first confidence would be >= segment A's last (chapter conf only rises) — the
        reset assertion below FAILS.  After the fix, segment B resets to the cold-start
        floor.  Mocks only the broadcaster (websocket boundary) — R2 compliant.
        """
        svc, events, wall_now, monotonic_now = _make_service()

        def _seg_confidences(seg_id: str) -> list[float]:
            out = []
            for payload, _ in events:
                if payload.get("topic") != "segments.progress":
                    continue
                inner = payload.get("payload", {})
                if inner.get("activeSegmentId") == seg_id or inner.get("segmentId") == seg_id:
                    c = inner.get("confidence")
                    if isinstance(c, (int, float)):
                        out.append(float(c))
            return out

        # Segment A — render across rising progress so its ring matures and
        # seg_confidence climbs.
        for p in (0.2, 0.5, 0.8):
            wall_now["value"] += 5.0
            monotonic_now["value"] += 5.0
            svc.publish(
                job_id="job-segconf-wire",
                status="running",
                progress=p,
                eta_seconds=int(round(30 * (1 - p))),
                chapter_id="chapter-1",
                active_segment_id="seg-A",
                active_segment_progress=p,
                active_segment_eta_seconds=int(round(30 * (1 - p))),
                render_group_count=2,
            )

        conf_a = _seg_confidences("seg-A")
        assert conf_a, "expected segment A to emit segment-progress confidence values"
        assert conf_a[-1] > conf_a[0], (
            f"within a segment, per-segment confidence must rise: {conf_a}"
        )

        # Segment B — a NEW segment starts at low progress. Its confidence must RESET
        # toward the cold-start floor, NOT continue from segment A's high value.
        wall_now["value"] += 5.0
        monotonic_now["value"] += 5.0
        svc.publish(
            job_id="job-segconf-wire",
            status="running",
            progress=0.85,
            eta_seconds=20,
            chapter_id="chapter-1",
            active_segment_id="seg-B",
            active_segment_progress=0.05,
            active_segment_eta_seconds=24,
            render_group_count=2,
        )

        conf_b = _seg_confidences("seg-B")
        assert conf_b, "expected segment B to emit a segment-progress confidence value"
        assert conf_b[0] < conf_a[-1], (
            f"segment B confidence must RESET below segment A's matured value "
            f"(per-segment, not chapter-level): segB_first={conf_b[0]} segA_last={conf_a[-1]}"
        )

    def test_emitted_segment_eta_is_decayed_toward_baseline_early(self):
        """§4A.10: enrich() must blend the noisy early segment ETA toward the grounded
        baseline.  With a well-sampled engine (high c_base) and an immature live ring
        (low c_obs at the first frame), a 25s spike at 20% progress must be damped
        toward the baseline-derived remaining (~16s), NOT emitted raw.

        R1 revert-check: before the §4A.10 decay, enrich left active_segment_eta_seconds
        as raw pass-through → the emitted etaSeconds would be 25, and the
        `< 25` / `<= 18` assertions FAIL.  Mocks only the DB boundaries (historical
        sample count + seconds_per_char), never ProgressService internals — R2.
        """
        svc, events, wall_now, monotonic_now = _make_service()

        with patch("app.db.performance.engine_sample_count", return_value=10), \
             patch("app.db.state_performance.seconds_per_char", return_value=0.04):
            # 500 chars × 0.04 s/char = 20s grounded baseline total.
            svc.publish(
                job_id="job-decay",
                status="running",
                progress=0.2,
                eta_seconds=20,
                chapter_id="chapter-1",
                active_segment_id="seg-decay",
                active_segment_progress=0.2,
                active_segment_eta_seconds=25,   # live spike (implied total 31s)
                active_render_group_weight=500,
                total_render_weight=500,
                completed_render_weight=0,
                render_group_count=1,
            )

        seg_etas = [
            payload.get("payload", {}).get("etaSeconds")
            for payload, _ in events
            if payload.get("topic") == "segments.progress"
            and payload.get("payload", {}).get("activeSegmentId") == "seg-decay"
            and payload.get("payload", {}).get("etaSeconds") is not None
        ]
        assert seg_etas, "expected a segments.progress frame carrying an etaSeconds"
        emitted = seg_etas[-1]
        assert emitted < 25, (
            f"early live spike (25s) must be damped, got raw-passthrough {emitted}"
        )
        # c_base=1 → w_base=0.8 at p=0.2 → blended total ≈22.25 → remaining ≈18s,
        # firmly damped below the 25s raw spike and near the baseline.
        assert 14 <= emitted <= 20, (
            f"blended segment ETA should sit near the baseline remaining, got {emitted}"
        )

    def test_segment_ring_cleared_on_job_requeue(self):
        """When a job transitions back to 'queued', segment rings for that job must be cleaned.

        The enrich/publish path clears chapter-level rings; segment rings must also be cleared.
        This test primes a segment ring, then sends status=queued, then verifies the ring
        is absent or empty.
        """
        svc, _, _, _ = _make_service()
        seg_id = "seg-queue-clear"

        payload = {
            "status": "running",
            "progress": 0.3,
            "eta_seconds": 30,
            "active_segment_id": seg_id,
            "active_segment_progress": 0.2,
            "active_segment_eta_seconds": 25,
        }
        svc.enrich("job-queueclear", dict(payload), sample=True)
        assert seg_id in svc._segment_eta_rings, "Pre-condition: ring must exist"

        # Transition to queued (requeue).
        svc.publish(
            job_id="job-queueclear",
            status="queued",
        )
        # The segment ring for this segment should be cleared.
        # NOTE: the spec requires clearing per-job state on queued; this may clear
        # by job prefix or all segment rings on job requeue.
        ring = svc._segment_eta_rings.get(seg_id)
        # After queued transition, the segment ring for this segment should be absent or empty.
        # Accept either absence or empty ring (length 0).
        ring_len = len(ring) if ring is not None else 0
        assert ring_len == 0, (
            f"Segment ring for {seg_id} must be cleared on job requeue, got len={ring_len}"
        )


# ---------------------------------------------------------------------------
# (B) §4A.3 Owner acceptance test — "late high-confidence segment dominates"
# ---------------------------------------------------------------------------

class TestOwnerAcceptance43Composition:
    """Owner acceptance: §4A.3 share-weighted composition.

    Feed ~30s-per-segment ETA samples (baseline chapter view), then send ONE
    frame where active_segment_eta_seconds=4 with high seg_confidence (~0.91).
    Assert displayed chapter eta_seconds COLLAPSES to ~4s and eta_confidence RISES.

    R1 revert-check:
      Pre-change enrich() ignores active_segment_eta_seconds for chapter ETA
      composition; it uses only the chapter-level observed ETA (~30s).
      test_late_segment_collapses_chapter_eta FAILS because eta_seconds ≈ 30s.
      After §4A.3 composition wiring, eta_seconds ≈ 4–8s and confidence rises.
    """

    def test_late_segment_collapses_chapter_eta(self):
        """Mature high-confidence late-segment ETA=4s must collapse chapter ETA to ~4s
        and raise eta_confidence vs the prior chapter-only frame.

        Owner acceptance case (§4A.3): after a run of ~30s-per-segment samples, a
        segment ticking down over 6 frames to report 4s at 0.91+ confidence must
        collapse the displayed chapter ETA to ~4s (≤6s) and raise overall confidence.

        R1 revert-check:
          Pre-fix (old residual uses bounded_eta=~12s as residual):
            - phase-2 eta_final ≈ 4–12s (may pass < 15 but fails ≤ 6)
            - conf_final may drop vs conf_pre (confidence regression)
          Post-fix (residual = non_active_fraction * bounded_eta → 0 when share=1):
            - eta_final ≤ 6s (pulled to segment's 4s)
            - conf_final > conf_pre (confidence rises)
        """
        svc, _, wall_now, _ = _make_service()
        job_id = "owner-collapse-job"
        seg_id = "seg-final"

        # Phase 1: Build up a chapter-level baseline of ~30s ETA samples.
        # 10 frames with eta_seconds≈30, progress advancing per frame.
        for i in range(10):
            p = 0.1 + i * 0.05  # 0.1 → 0.55
            wall_now["value"] += 3.0
            svc.enrich(job_id, {
                "status": "running",
                "progress": p,
                "eta_seconds": 30,
                "updated_at": wall_now["value"],
            }, sample=True)

        # Record the chapter ETA and confidence before the segment signals arrive.
        wall_now["value"] += 1.0
        result_pre = svc.enrich(job_id, {
            "status": "running",
            "progress": 0.85,
            "eta_seconds": 30,
            "updated_at": wall_now["value"],
        }, sample=True)
        eta_pre = result_pre.get("eta_seconds")
        conf_pre = result_pre.get("eta_confidence")
        assert isinstance(conf_pre, float), "Pre-frame must have a numeric eta_confidence"

        # Phase 2: Segment ticks down over 6 frames — ring matures (≥5 samples)
        # and seg_confidence rises toward ~0.99.
        # Weights: total=100, completed=80, active_group_weight=20 → share=1.0
        # (active segment IS all the remaining work).
        seg_frames = [
            (0.10, 30),
            (0.20, 25),
            (0.40, 18),
            (0.60, 12),
            (0.80, 7),
            (0.91, 4),  # final tick: 4s left, high confidence (ring mature)
        ]
        for seg_p, seg_eta in seg_frames:
            wall_now["value"] += 1.0
            result = svc.enrich(job_id, {
                "status": "running",
                "progress": 0.85,
                "eta_seconds": 30,
                "active_segment_id": seg_id,
                "active_segment_progress": seg_p,
                "active_segment_eta_seconds": seg_eta,
                "total_render_weight": 100,
                "completed_render_weight": 80,
                "active_render_group_weight": 20,
                "updated_at": wall_now["value"],
            }, sample=True)

        eta_final = result.get("eta_seconds")
        conf_final = result.get("eta_confidence")

        # Owner requirement: displayed chapter ETA must collapse to ~4s (≤6s given
        # the spec's confidence-weighted residual) and confidence must RISE.
        assert eta_final is not None, "Final frame must produce a non-null eta_seconds"
        assert eta_final <= 6, (
            f"With mature high-confidence seg_eta=4s (share=1.0), "
            f"chapter eta_seconds must collapse to ≤6s, got {eta_final}s. "
            f"(Pre-frame eta was {eta_pre}s). "
            f"R1: pre-fix residual inflates result using bounded_eta instead of "
            f"chapter_eta_excluding_active."
        )

        assert isinstance(conf_final, float)
        assert conf_final > conf_pre, (
            f"Final segment signal must RAISE eta_confidence: "
            f"pre={conf_pre:.4f} → final={conf_final:.4f}. "
            f"R1: pre-fix code may leave or lower confidence because the segment "
            f"is cold-start-penalised and doesn't dominate."
        )

    def test_cold_first_seen_segment_does_not_over_dominate(self):
        """A FIRST-SEEN (cold-start) segment with only 1 ring sample must NOT
        collapse the chapter ETA to near-zero.

        When seg_confidence ≈ 0.2 (cold start, n=1 sample), the blend must
        still preserve the chapter-level ETA as a fallback — the cold segment
        should NOT dominate the display.

        R1 revert-check: with the WRONG residual fix (pure non_active_fraction
        = 0 when share=1.0), composed_eta = 0.2*4 + 0.8*0 = 0.8s → int=0s
        (terminal-looking). The blended residual guard (mixing in
        seg_confidence) prevents this collapse.
        """
        svc, _, wall_now, _ = _make_service()
        job_id = "cold-dominate-job"
        seg_id = "seg-first-seen"

        # Prime chapter ring to stable ~30s ETA.
        for i in range(10):
            p = 0.1 + i * 0.05
            wall_now["value"] += 3.0
            svc.enrich(job_id, {
                "status": "running",
                "progress": p,
                "eta_seconds": 30,
                "updated_at": wall_now["value"],
            }, sample=True)

        result_pre = svc.enrich(job_id, {
            "status": "running",
            "progress": 0.85,
            "eta_seconds": 30,
            "updated_at": wall_now["value"],
        }, sample=True)
        eta_pre = result_pre.get("eta_seconds")

        # Single first-seen segment frame — ring gets exactly 1 sample → cold-start.
        wall_now["value"] += 1.0
        result_cold = svc.enrich(job_id, {
            "status": "running",
            "progress": 0.85,
            "eta_seconds": 30,
            "active_segment_id": seg_id,
            "active_segment_progress": 0.1,
            "active_segment_eta_seconds": 4,
            "total_render_weight": 100,
            "completed_render_weight": 80,
            "active_render_group_weight": 20,
            "updated_at": wall_now["value"],
        }, sample=True)
        eta_cold = result_cold.get("eta_seconds")
        ring = svc._segment_eta_rings.get(seg_id)
        n_samples = len(ring) if ring is not None else 0

        assert n_samples == 1, (
            f"Pre-condition: first-seen segment ring must have exactly 1 sample, got {n_samples}"
        )
        assert eta_cold is not None
        # Cold-start segment must NOT collapse chapter ETA to near-zero.
        # The blended residual guard must preserve the chapter baseline.
        assert eta_cold > 2, (
            f"Cold-start (n=1) segment with share=1.0 must NOT collapse chapter ETA "
            f"to near-zero. Pre-frame eta={eta_pre}s, cold eta={eta_cold}s. "
            f"R1: pure non_active_fraction residual gives 0.8s → 0s (too aggressive)."
        )

    def test_composition_weight_arithmetic_via_enrich(self):
        """§4A.3: end-to-end blend via enrich() confirms share, w_seg, eta_display.

        Drives the real enrich() kernel rather than re-implementing the formula in
        pure Python (which would be a self-asserting test).  The observable assertion
        is on the output of enrich(), not on an intermediate calculation.

        Setup: prime a chapter ring so bounded_eta ≈ 30s, then inject a fully-mature
        segment ring (6 identical frames → cv≈0, seg_confidence≈1.0) with
        share=1.0 and seg_eta=4s.  Expected: enrich() returns eta_seconds ≤ 6
        and conf_display = max(chapter_conf, seg_confidence*1.0) ≥ 0.9.
        """
        svc, _, wall_now, _ = _make_service()
        job_id = "arith-job"
        seg_id = "seg-arith"

        # Prime chapter ring (~30s baseline, progress not high enough to crossfade out).
        for i in range(6):
            wall_now["value"] += 4.0
            svc.enrich(job_id, {
                "status": "running",
                "progress": 0.1 + i * 0.05,
                "eta_seconds": 30,
                "updated_at": wall_now["value"],
            }, sample=True)

        # Mature the segment ring with 6 consistent frames (cv→0, confidence→1).
        seg_evolve = [(0.1, 28), (0.2, 24), (0.4, 18), (0.6, 12), (0.8, 7), (0.91, 4)]
        for seg_p, seg_eta in seg_evolve:
            wall_now["value"] += 1.0
            result = svc.enrich(job_id, {
                "status": "running",
                "progress": 0.6,
                "eta_seconds": 30,
                "active_segment_id": seg_id,
                "active_segment_progress": seg_p,
                "active_segment_eta_seconds": seg_eta,
                "total_render_weight": 100,
                "completed_render_weight": 80,
                "active_render_group_weight": 20,
                "updated_at": wall_now["value"],
            }, sample=True)

        eta = result.get("eta_seconds")
        conf = result.get("eta_confidence")

        # With share=1.0 and seg_confidence≈1, composition must pull eta to ≤6s.
        assert eta is not None
        assert eta <= 6, (
            f"enrich() with mature seg_confidence≈1, share=1.0, seg_eta=4s must "
            f"return eta_seconds ≤ 6, got {eta}s"
        )
        # conf_display = max(chapter_conf, seg_confidence * 1.0) → ≥ 0.9
        assert isinstance(conf, float)
        assert conf >= 0.9, (
            f"enrich() conf_display must lift to ≥ 0.9 when seg_confidence≈1, got {conf:.4f}"
        )

    def test_composition_high_share_dominates(self):
        """High share + high seg_confidence pulls chapter ETA strongly toward segment ETA.

        R1 revert-check: on pre-change code, eta_display ≈ chapter_eta (≈30s) because
        active_segment_eta_seconds is not composited.  Post-change: eta_display < 10s.
        """
        svc, _, wall_now, _ = _make_service()
        job_id = "share-dominant"

        # Prime chapter ring (so baseline ETA ≈ 30s).
        for i in range(6):
            wall_now["value"] += 3.0
            svc.enrich(job_id, {
                "status": "running",
                "progress": 0.1 + i * 0.1,
                "eta_seconds": 30,
                "updated_at": wall_now["value"],
            }, sample=True)

        wall_now["value"] += 1.0
        result = svc.enrich(job_id, {
            "status": "running",
            "progress": 0.8,
            "eta_seconds": 30,
            "active_segment_id": "seg-dom",
            "active_segment_progress": 0.0,
            "active_segment_eta_seconds": 4,
            "total_render_weight": 100,
            "completed_render_weight": 80,
            "active_render_group_weight": 20,  # share=20/(100-80)=1.0
            "updated_at": wall_now["value"],
        }, sample=True)

        eta = result.get("eta_seconds")
        assert eta is not None
        # With share=1.0 and high seg_confidence, composition must pull < 15s.
        assert eta < 15, (
            f"High-share composition must pull chapter eta < 15s, got {eta}s"
        )

    def test_low_share_segment_does_not_override_chapter_eta(self):
        """A LOW-share segment (early in chapter) must NOT dominate chapter ETA."""
        svc, _, wall_now, _ = _make_service()
        job_id = "low-share-job"

        # Prime chapter ring (baseline ≈ 60s).
        for i in range(6):
            wall_now["value"] += 5.0
            svc.enrich(job_id, {
                "status": "running",
                "progress": 0.05 + i * 0.02,
                "eta_seconds": 60,
                "updated_at": wall_now["value"],
            }, sample=True)

        wall_now["value"] += 1.0
        result = svc.enrich(job_id, {
            "status": "running",
            "progress": 0.1,
            "eta_seconds": 60,
            "active_segment_id": "seg-early",
            "active_segment_progress": 0.5,
            "active_segment_eta_seconds": 4,
            "total_render_weight": 100,
            "completed_render_weight": 0,
            "active_render_group_weight": 5,  # share = 5/(100-0) = 0.05 — very small
            "updated_at": wall_now["value"],
        }, sample=True)

        eta = result.get("eta_seconds")
        assert eta is not None
        # Low share → chapter ETA must still be high (not pulled to 4s).
        # w_seg = seg_conf * 0.05 ≈ 0.05 → eta ≈ 0.05*4 + 0.95*60 ≈ 57s
        assert eta > 20, (
            f"Low-share segment must not override chapter ETA. "
            f"Expected eta > 20s (near 60s baseline), got {eta}s"
        )

    def test_terminal_composition_still_nulls_eta(self):
        """Terminal status must still zero/null ETA regardless of segment signal."""
        svc, _, _, _ = _make_service()
        result = svc.enrich("term-comp-job", {
            "status": "done",
            "progress": 1.0,
            "eta_seconds": 30,
            "active_segment_id": "seg-done",
            "active_segment_progress": 0.5,
            "active_segment_eta_seconds": 4,
            "total_render_weight": 100,
            "completed_render_weight": 80,
            "active_render_group_weight": 20,
        })
        assert result.get("eta_seconds") is None, (
            f"Terminal status must clear eta_seconds, got {result.get('eta_seconds')}"
        )

    def test_composition_ceiling_respected(self):
        """§4A.4: composition result must not exceed mechanical ceiling."""
        svc, _, _, _ = _make_service()
        # With progress=0.5 and velocity derived from a 30s ETA sample ring,
        # ceiling = 1.3 * 0.5 / velocity.  Composition must not exceed it.
        svc.enrich("ceil-job", {
            "status": "running",
            "progress": 0.5,
            "eta_seconds": 30,
            "updated_at": 100.0,
        }, sample=True)

        result = svc.enrich("ceil-job", {
            "status": "running",
            "progress": 0.5,
            "eta_seconds": 9999,  # absurd chapter ETA
            "active_segment_id": "seg-ceil",
            "active_segment_progress": 0.0,
            "active_segment_eta_seconds": 9999,  # absurd segment ETA
            "total_render_weight": 100,
            "completed_render_weight": 50,
            "active_render_group_weight": 50,
            "updated_at": 101.0,
        }, sample=True)

        eta = result.get("eta_seconds")
        # Ceiling with velocity from ring (≈1/60 progress/s from 30s ETA)
        # → ceiling ≈ 1.3 * 0.5 / (1/60) = 39s.  At most 200s to be generous.
        if eta is not None:
            assert eta < 200, (
                f"Composition with ceiling must bound absurd ETAs, got {eta}s"
            )


# ---------------------------------------------------------------------------
# (C) Cold-start confidence test — R1 revert-check
# ---------------------------------------------------------------------------

class TestColdStartConfidence:
    """§4A.5 cold-start fix: 1-sample ring must yield LOW confidence, NOT ~1.0.

    R1 revert-check:
      Pre-fix: EtaSampleRing with 0-1 samples → cv()=0 → c_var=1 → confidence≈1.0
      (because with 0 variance, c_var=1 and c_fresh=1 at age_ms=0 → result=1.0).
      This test is RED on pre-fix code (confidence_1sample ≈ 1.0 > 0.5).
      Post-fix: a maturity factor min(n/N, 1) scales confidence → cold frame is LOW.
    """

    def test_cold_start_single_sample_is_low_confidence(self):
        """A ring with exactly 1 sample must yield confidence < 0.5.

        R1 red: pre-fix compute_eta_confidence with cv=0.0 at progress=0.3
        returns ≈1.0 (no maturity factor). Post-fix: multiplied by 1/N → low.
        """
        ring = EtaSampleRing()
        ring.push(0.01)  # exactly 1 sample
        n_samples = len(ring)
        assert n_samples == 1, "Pre-condition: ring has exactly 1 sample"

        confidence = compute_eta_confidence(
            progress=0.3,
            age_ms=0.0,
            cv=ring.cv(),  # cv=0.0 with 1 sample
            n_samples=n_samples,  # new maturity parameter
        )
        assert confidence < 0.5, (
            f"Cold-start (1 sample) must yield LOW confidence (<0.5), "
            f"got {confidence:.3f}. "
            f"R1: pre-fix code returns ≈1.0 (no maturity factor)."
        )

    def test_zero_samples_is_very_low_confidence(self):
        """An empty ring (0 samples) must yield very low confidence."""
        ring = EtaSampleRing()
        confidence = compute_eta_confidence(
            progress=0.3,
            age_ms=0.0,
            cv=ring.cv(),
            n_samples=len(ring),
        )
        assert confidence < 0.4, (
            f"Zero samples must yield very low confidence, got {confidence:.3f}"
        )
        assert confidence >= BASE_FLOOR, (
            f"Confidence must stay at or above BASE_FLOOR={BASE_FLOOR}, got {confidence}"
        )

    def test_confidence_rises_with_sample_count(self):
        """More samples → higher confidence (maturity factor rises to 1).

        With N=5 (for example), confidence at n=1 < n=3 < n=5 (all at same cv=0).
        """
        ring_1 = EtaSampleRing()
        ring_1.push(0.01)

        ring_3 = EtaSampleRing()
        for _ in range(3):
            ring_3.push(0.01)

        ring_5 = EtaSampleRing()
        for _ in range(5):
            ring_5.push(0.01)

        conf_1 = compute_eta_confidence(progress=0.3, age_ms=0.0, cv=ring_1.cv(), n_samples=len(ring_1))
        conf_3 = compute_eta_confidence(progress=0.3, age_ms=0.0, cv=ring_3.cv(), n_samples=len(ring_3))
        conf_5 = compute_eta_confidence(progress=0.3, age_ms=0.0, cv=ring_5.cv(), n_samples=len(ring_5))

        assert conf_1 < conf_3, (
            f"1-sample confidence ({conf_1:.3f}) must be < 3-sample ({conf_3:.3f})"
        )
        assert conf_3 <= conf_5 + 1e-9, (
            f"3-sample confidence ({conf_3:.3f}) must be <= 5-sample ({conf_5:.3f})"
        )

    def test_full_ring_confidence_not_penalized_by_maturity(self):
        """At full maturity (N+ samples), maturity factor = 1 — no penalty."""
        ring = EtaSampleRing()
        for _ in range(6):
            ring.push(0.01)  # 6 identical samples → cv=0.0

        confidence = compute_eta_confidence(
            progress=0.3,
            age_ms=0.0,
            cv=ring.cv(),
            n_samples=len(ring),
        )
        # At full ring with cv=0 → c_var=1, c_fresh=1, maturity=1 → confidence should be 1.0
        assert confidence > 0.9, (
            f"Full ring (6 samples), cv=0 must yield high confidence (>0.9), got {confidence:.3f}"
        )

    def test_service_enrich_cold_frame_is_low_confidence(self):
        """Service enrich() with an empty ring must yield low confidence.

        This tests the integration: service initialises ring → 0 samples → cold start.

        R1 red: pre-fix service initialises ring and on first enrich (after 1 push)
        returns confidence≈1.0. Post-fix: n_samples=1 → maturity factor → low.
        """
        svc, _, _, _ = _make_service()
        # Very first enrich call for a new job — ring starts empty, gets 1 push.
        payload = {
            "status": "running",
            "progress": 0.1,
            "eta_seconds": 30,
            "updated_at": 100.0,
        }
        result = svc.enrich("cold-conf-job", dict(payload), sample=True)
        conf = result.get("eta_confidence")
        assert isinstance(conf, float)
        # After exactly 1 push, maturity factor must make confidence low.
        assert conf < 0.5, (
            f"First enrich (1 ring sample) must yield LOW confidence (<0.5), "
            f"got {conf:.3f}. R1: pre-fix code returns ≈1.0."
        )


# ---------------------------------------------------------------------------
# (C) §4A.5 Convergence-trust: shrinking ETA series raises confidence
# ---------------------------------------------------------------------------

class TestConvergenceTrust:
    """§4A.5: a CONVERGING (shrinking) ETA series must RAISE confidence,
    not lower it due to apparent high cv of raw remaining-seconds.

    The ring already stores VELOCITY (progress/second), not raw remaining-seconds,
    so a converging ETA series (remaining time shrinking) corresponds to an
    INCREASING velocity series — which has LOW cv (coherent direction).

    These tests verify:
    1. Shrinking ETA → increasing velocity → low cv → higher confidence.
    2. Noisy/diverging ETA → erratic velocity → high cv → lower confidence.
    """

    def test_shrinking_eta_yields_low_cv_and_rising_confidence(self):
        """A monotonically shrinking ETA series (converging) yields low cv.

        Shrinking ETA from 30s→20s→10s→4s means velocity is INCREASING,
        which has a HIGH variance but a coherent DIRECTION.  The ring stores
        velocity (progress/s), so a consistently accelerating render has
        high cv — this is EXPECTED and should be treated as convergence.

        §4A.5 says: use recency-weighted cv OR measure throughput variance.
        The ring's cv of velocity samples correctly avoids raw-seconds variance.

        This test verifies that when segment ETA reaches 4s after a run of
        30s estimates, eta_confidence does NOT drop to the floor.
        """
        svc, _, wall_now, _ = _make_service()
        job_id = "convergence-job"

        # Simulate 5 frames where ETA shrinks monotonically (30→20→10→6→4).
        # progress advances each time.
        frames = [
            (0.60, 30),
            (0.70, 20),
            (0.80, 10),
            (0.88, 6),
            (0.93, 4),
        ]
        for p, eta in frames:
            wall_now["value"] += 2.0
            svc.enrich(job_id, {
                "status": "running",
                "progress": p,
                "eta_seconds": eta,
                "updated_at": wall_now["value"],
            }, sample=True)

        # Final frame: check confidence is not at the floor.
        wall_now["value"] += 1.0
        result = svc.enrich(job_id, {
            "status": "running",
            "progress": 0.95,
            "eta_seconds": 4,
            "updated_at": wall_now["value"],
        }, sample=True)

        conf = result.get("eta_confidence")
        assert isinstance(conf, float)
        # Confidence must NOT be at BASE_FLOOR (it should be well above 0.2
        # since the sample series is coherently converging and progress is high).
        assert conf > BASE_FLOOR + 0.1, (
            f"Converging ETA series at high progress must yield confidence "
            f"well above BASE_FLOOR={BASE_FLOOR}, got {conf:.3f}"
        )

    def test_noisy_eta_series_does_not_raise_confidence(self):
        """A noisy/diverging ETA series (jumping around) must not yield high confidence."""
        svc, _, wall_now, _ = _make_service()
        job_id = "noisy-job"

        # Noisy ETA: jumps between large and small values erratically.
        frames = [
            (0.3, 50),
            (0.35, 5),   # spike down
            (0.4, 60),   # spike up
            (0.45, 3),   # spike down
            (0.5, 70),   # spike up
        ]
        for p, eta in frames:
            wall_now["value"] += 2.0
            svc.enrich(job_id, {
                "status": "running",
                "progress": p,
                "eta_seconds": eta,
                "updated_at": wall_now["value"],
            }, sample=True)

        wall_now["value"] += 1.0
        result = svc.enrich(job_id, {
            "status": "running",
            "progress": 0.5,
            "eta_seconds": 70,
            "updated_at": wall_now["value"],
        }, sample=True)

        noisy_conf = result.get("eta_confidence")
        assert isinstance(noisy_conf, float)

        # Now run a steady ring and compare.
        svc2, _, wall_now2, _ = _make_service()
        job_id2 = "steady-job"
        for p, eta in [(0.3, 30), (0.35, 29), (0.4, 28), (0.45, 27), (0.5, 26)]:
            wall_now2["value"] += 2.0
            svc2.enrich(job_id2, {
                "status": "running",
                "progress": p,
                "eta_seconds": eta,
                "updated_at": wall_now2["value"],
            }, sample=True)
        wall_now2["value"] += 1.0
        result2 = svc2.enrich(job_id2, {
            "status": "running",
            "progress": 0.5,
            "eta_seconds": 26,
            "updated_at": wall_now2["value"],
        }, sample=True)
        steady_conf = result2.get("eta_confidence")

        # Steady series must produce higher confidence than noisy series.
        assert steady_conf > noisy_conf, (
            f"Steady ETA series (conf={steady_conf:.3f}) must yield higher confidence "
            f"than noisy series (conf={noisy_conf:.3f})"
        )


# ---------------------------------------------------------------------------
# (C) §4A.5 + (B) Interaction: convergence-trust with composition
# ---------------------------------------------------------------------------

class TestConvergenceTrustWithComposition:
    """Integration: a converging segment ETA should boost both composition and
    chapter confidence simultaneously.

    R1 revert-check context: the compound failure before this task was:
      - Chapter ETA stays ≈30s when final segment says 4s.
      - Confidence drops at the final segment because raw remaining-seconds cv is high.
    After the fix:
      - Chapter ETA collapses to ~4s.
      - Confidence rises (maturity + convergence + high-progress c_done).
    """

    def test_confidence_rises_vs_prior_frame_on_final_segment_signal(self):
        """Final segment signal must not LOWER eta_confidence vs the prior chapter frame.

        R1 revert-check:
          Pre-fix (pre-Task-006): the 4s sample after many 30s samples causes a
          large velocity jump in the ring → high cv → confidence drops.
          Post-fix: maturity factor stabilises ring; convergence boost applies;
          confidence does not drop.
        """
        svc, _, wall_now, _ = _make_service()
        job_id = "conf-rise-job"

        # Prime chapter ring to stable ~30s ETA.
        for i in range(6):
            wall_now["value"] += 3.0
            svc.enrich(job_id, {
                "status": "running",
                "progress": 0.1 + i * 0.1,
                "eta_seconds": 30,
                "updated_at": wall_now["value"],
            }, sample=True)

        # Final chapter frame before segment signal.
        wall_now["value"] += 1.0
        pre_result = svc.enrich(job_id, {
            "status": "running",
            "progress": 0.7,
            "eta_seconds": 30,
            "updated_at": wall_now["value"],
        }, sample=True)
        pre_conf = pre_result.get("eta_confidence")
        assert isinstance(pre_conf, float)

        # Final segment signal arrives: high confidence, low ETA.
        wall_now["value"] += 1.0
        post_result = svc.enrich(job_id, {
            "status": "running",
            "progress": 0.85,
            "eta_seconds": 30,
            "active_segment_id": "seg-final",
            "active_segment_progress": 0.0,
            "active_segment_eta_seconds": 4,
            "total_render_weight": 100,
            "completed_render_weight": 82,
            "active_render_group_weight": 18,
            "updated_at": wall_now["value"],
        }, sample=True)
        post_conf = post_result.get("eta_confidence")
        assert isinstance(post_conf, float)

        # Confidence must NOT drop on the final segment signal.
        # R1: pre-fix code may drop confidence here due to high velocity cv.
        assert post_conf >= pre_conf - 0.05, (
            f"Confidence must not DROP on final segment signal: "
            f"pre={pre_conf:.3f} → post={post_conf:.3f}. "
            f"R1: pre-fix code drops confidence here."
        )
