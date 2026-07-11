# 006 — §4A.3 segment→chapter ETA composition + §4A.5 convergence-trust (PI7)

- **Status:** done (note: `_should_emit` `_MIN_CONF_DELTA=0.25` added here — 010 to reconcile as throttle policy)
- **Workload:** WL-C correctness
- **Severity / type:** major · correctness (owner's explicit requirement)
- **Effort:** M
- **Blocked by:** 004
- **Blocks:** nothing

## Goal
Implement two coupled §4A behaviors that v1 had **no task for**:
- **§4A.3 segment→chapter ETA composition:** the chapter ETA is a share-weighted blend of the active
  segment's ETA and the remaining segments' calculated ETA, so a **late, high-confidence segment ETA
  dominates** the chapter ETA instead of being averaged away.
- **§4A.5 convergence-trust:** an ETA that is **converging** (stable/shrinking, low CV) **raises**
  confidence rather than lowering it.

The owner's concrete acceptance case: after a run of ~30s-per-segment samples, a segment reporting **4s at
0.91 confidence** must collapse the displayed chapter ETA to **~4s** and **raise** overall confidence.

## Why this matters
Without composition, the chapter ETA is dominated by stale per-chapter averages, so the bar shows a long
ETA even when the active segment is nearly done (the "4s/91% should win" failure). Without convergence-trust,
the confidence metric penalizes the very stability that should increase trust. Both are §4A requirements
that the current code does not implement. See `../00-architecture-map.md` PI7 + acknowledged-scope §4.

## Context an executor needs
- `design-docs/specs/progress-presentation.md` §4A.3 (segment→chapter composition) and §4A.5 (convergence-trust) —
  read the exact blend/weighting the spec prescribes; if the spec is silent on the precise formula, define
  it here and bump the spec in 011.
- `enrich` (001) + the crossfade/ceiling ETA assembly (003b) — composition layers on top of the per-frame
  ETA; it reads the active-segment ETA and segment weights.
- Segment weights / active segment are available in the payload: `active_render_group_weight`,
  `total_render_weight`, `completed_render_weight`, `active_segment_eta_seconds`, `active_segment_progress`
  (`service.py:541-550,672-689`); chapter-level grouped progress comes from `_get_grouped_progress`
  (`orchestrator_helpers.py:465-477`).
- `compute_eta_confidence` (eta.py:36) already takes a `cv` (coefficient of variation) from `EtaSampleRing`
  (eta.py:155-188) — convergence-trust should make a **falling/stable** CV increase confidence. Confirm the
  current formula direction (`c_var = clamp01(1 - K_VAR*cv)`, eta.py:59) already rewards low CV; the new
  work is detecting *convergence* (trend), not just instantaneous CV.
- **⚠️ Missing prerequisite: segment-scope confidence producer (FIX 5).** The §4A.3 blend requires a
  `seg_confidence` (segment-scope confidence), but the live path currently produces only a single
  chapter-level `eta_confidence`. No segment-scope confidence producer exists (grep: zero). This task must
  **first produce a segment-scope confidence** — e.g. a per-segment `EtaSampleRing` keyed by
  `active_segment_id`, or derive it in `enrich` from the segment ETA series — BEFORE the share-weighted
  blend can use `seg_confidence`. Without it the "4s/91% should dominate" acceptance case degrades to
  chapter confidence and is unachievable. Build the segment-scope producer as the first sub-step.

## Target shape / contract
- In `enrich` (or a helper it calls), compute the chapter ETA as a share-weighted blend:
  `chapter_eta = (active_segment_share × active_segment_eta) + (remaining_share × remaining_calculated_eta)`,
  where shares come from render weights. A high-confidence, low active-segment ETA must pull the chapter ETA
  toward it (dominance), not be diluted by the segment count.
- Convergence-trust: track ETA-sample trend (e.g. successive ETA deltas shrinking / CV falling) and let a
  converging series **raise** `eta_confidence` above what instantaneous CV alone would give, bounded by 1.0.
- Preserve §4A.4 ceiling + terminal zeroing; do not let composition produce an ETA above the mechanical
  ceiling.

## Steps
1. **Sub-step: produce segment-scope confidence.** Add a per-segment `EtaSampleRing` (keyed by
   `active_segment_id`) or derive segment confidence from the segment ETA series in `enrich`. This is the
   prerequisite for a meaningful §4A.3 blend — without it step 3 cannot achieve the "4s/91%" acceptance
   case. Test it independently before proceeding.
2. Revert-check test first (R1): drive a sequence of ~30s segment ETA samples, then a single
   `active_segment_eta_seconds=4, seg_confidence≈0.91` frame; assert the **displayed chapter `eta_seconds`
   collapses to ~4s** and `eta_confidence` **rises** vs the prior frame. On pre-change `enrich` the chapter
   ETA stays ~30s (averaged) → red. Confirm red, implement.
3. Implement share-weighted composition in/around `enrich`; implement convergence detection feeding
   confidence.
4. Add boundary tests: composition with multiple segments of differing weights; convergence raising
   confidence vs a noisy/diverging series lowering it.
5. Re-run the 004 parity test (both paths still agree) and the 001 snapshot (update baselines, document).
6. `./venv/bin/python -m pytest tests/orchestration/ -q` and `ruff check`.

## Acceptance criteria
- [ ] A segment-scope confidence producer exists (per-segment ring or equivalent); it produces a numeric
      `seg_confidence` used by the §4A.3 blend.
- [ ] The owner case passes: 30s samples then a 4s/0.91 seg_confidence frame → displayed chapter ETA ≈ 4s
      and overall confidence rises (revert-checked red on pre-change code).
- [ ] Chapter ETA is share-weighted (§4A.3); a high-confidence low segment ETA dominates, not averaged.
- [ ] A converging ETA series raises confidence (§4A.5); a diverging one does not.
- [ ] Composition respects the §4A.4 ceiling and terminal zeroing.
- [ ] `pytest tests/orchestration/` and `ruff check` green.

## Out of scope
- Bootstrap-cps / crossfade plumbing — 003a/003b (this builds on them).
- Snapshot hydration — 007.
