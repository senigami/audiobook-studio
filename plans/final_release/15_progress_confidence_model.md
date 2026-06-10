# 15 — Progress Confidence Model (ETA Trust Handoff)

Design for how the predictive progress bar should weight live backend ETA against its own smooth pacing. Owner's intent (2026-06-10): *"When my confidence is low I rely on the smooth prediction more, in the middle or start of rendering. If my confidence is high I rely on the ETA. As I get closer to the end the ETA is naturally more accurate, so trust hands off to it."* Today this doesn't happen — see Current Defect — and the visible symptom is the bar speeding up and slowing down as the ETA fluctuates.

## Current defect

`frontend/src/components/progress/PredictiveProgressBar/PredictiveProgressBar.tsx`:

1. `evidenceWeightFraction` defaults to 1 (`clamp01(evidenceWeightFraction ?? 1)`, line ~327) and no caller passes it — every update is taken at full trust.
2. Even when < 1, confidence lerps **all three** lane parameters (`startedAtMs`, `startProgress`, `endAtMs`, lines ~329-334). Lerping the anchors changes the *position math*, not the *trust*, and the `shouldCorrectStart` re-anchor above it (lines ~265-303) adopts the incoming percentage outright whenever it is ahead of the visual. Net effect: incoming progress + raw ETA win every update.
3. Raw `etaSeconds` samples are used unsmoothed. Backend ETA naturally jitters (per-segment timing variance), so the lane's end time — and therefore the bar's visible velocity — jumps on every update.

## Design principles

1. **Position and velocity are separate concerns.** Position is governed by the existing floor contract (never moves backward unless explicitly allowed; only `done` reaches 100%). Confidence must modulate **velocity** (the predicted end time / slope), never re-anchor position. A new estimate changes how fast the bar moves from *where it visually is right now*; it never teleports the anchors.
2. **Trust is a blend weight on the end-time estimate only.** One number `w ∈ [0,1]`: 0 = keep the current smooth pacing, 1 = adopt the live ETA fully.
3. **Trust ramps up with progress.** Early in a render the ETA is extrapolating from few samples; near the end it's nearly arithmetic. The handoff should be automatic, not caller-managed.
4. **The signal is smoothed before it's trusted.** Even at high trust, ETA samples pass through an exponential moving average so single outliers can't lurch the bar.
5. **Slope changes are rate-limited.** Whatever the math says, the rendered velocity may only change by a bounded ratio per update, so the eye never catches a lurch.

## The model

All of this lives in the bar (or a small `useEtaConfidence` hook beside it). Callers pass nothing new; `evidenceWeightFraction` is removed.

### 1. Smoothed end-time estimate

Convert each incoming update to an end-time sample (existing `resolveEndAtMs`), then EMA it:

```
etaEndSmoothed += alpha * (etaEndRaw - etaEndSmoothed)
alpha = lerp(ALPHA_MIN, ALPHA_MAX, w)        // ALPHA_MIN = 0.15, ALPHA_MAX = 0.85
```

Low trust → heavy smoothing (outliers barely register). High trust → near-raw tracking.

### 2. Trust weight `w`

```
w = clamp01( base + (1 - base) * ramp(progress) )
ramp(p) = smoothstep(RAMP_START, RAMP_END, p)   // RAMP_START = 0.55, RAMP_END = 0.90
```

`base` is the confidence in the ETA source *independent of progress*, derived adaptively from sample stability rather than hand-tuned:

```
// over the last N=6 end-time samples (ms):
cv = stddev(samples) / max(1, mean(samples - now))   // coefficient of variation of remaining time
base = clamp01(1 - K * cv)                            // K = 2.0; stable samples → base near 1
base = max(base, BASE_FLOOR)                          // BASE_FLOOR = 0.2, never fully ignore the backend
```

Properties: a jittery ETA early in the render yields low `base` and low `w` → the bar coasts on its smoothed pacing. A stable ETA earns trust immediately. Regardless of stability, `ramp` forces the handoff as the render approaches the end (by p≥0.90, w≈1 — the ETA owns the bar).

### 3. Velocity-continuous lane adoption

Replace the confidence-lerped lane construction and the percentage-driven `shouldCorrectStart` re-anchor with:

```
blendedEnd = currentRenderedEnd + (etaEndSmoothed - currentRenderedEnd) * w
newLane = {
  startedAtMs: now,
  startProgress: currentVisualProgress,   // position continuity — always
  endAtMs: clampSlope(blendedEnd),
}
```

`clampSlope`: compute implied velocity `v = (0.995 - currentVisualProgress) / (blendedEnd - now)`; bound it to `[vPrev / SLOPE_CAP, vPrev * SLOPE_CAP]` with `SLOPE_CAP = lerp(1.5, 4.0, w)` — tighter when coasting, looser when the trusted ETA genuinely moved. Keep the existing tick-based lane migration for the transition animation; keep the existing instant snap on phase handoff (preparing → running) and the backward-motion rules exactly as they are.

The progress *floor* logic is untouched: if backend progress exceeds the visual position, the existing forward migration still applies (backend percent remains the authoritative floor per the wiki contract). Confidence only governs the end-time/velocity side.

### 4. Edge rules

- **Overrun:** if `now > blendedEnd` and no terminal event, the existing `autoFinalizing` behavior (≥ 0.995 → finalizing shimmer) already handles it — keep.
- **First sample:** before any ETA sample, seed `etaEndSmoothed` from the first `resolveEndAtMs` and `base = BASE_FLOOR` (start skeptical).
- **Stall detection (optional, flag-gated):** if no progress/ETA update for > STALL_MS (e.g. 10s) while `running`, decay `w` toward 0 so the bar eases off rather than racing to a stale end time.
- **Reset:** clear samples/EMA on `persistenceKey`/`startedAt` change and on terminal states.

## Implementation steps

- [ ] 1. Extract `useEtaConfidence({ persistenceKey, startedAt, status })` hook colocated with the bar: holds the sample ring (N=6), EMA, `base`, and exposes `{ etaEndSmoothed, w }` given each raw `resolveEndAtMs` result. Pure functions for `cv`, `ramp`, `clampSlope` in `predictiveProgressBarHelpers.ts` with unit tests.
- [ ] 2. Rewire `updateLaneToTarget`: delete the confidence lerp of `startedAtMs`/`startProgress` and the ETA-driven parts of `shouldCorrectStart`; adopt the velocity-continuous lane construction above. Keep floor, backward, phase-handoff, and done-transition behavior byte-identical.
- [ ] 3. Remove the `evidenceWeightFraction` prop (no caller passes it; it was documented as a no-op — doc 09 F12 resolves with this).
- [ ] 4. Surface `w`, `base`, `cv`, `etaEndSmoothed`, and clamped-vs-raw slope in the debug snapshot (`predictiveProgressBarDebug.ts`) and the `/progress-test` dev panel so tuning is observable.
- [ ] 5. Tune constants on the dev panel against recorded real render sessions (capture jittery ETA traces; the doc 14 fixture recording can double for this). Constants live in one exported object, not scattered literals.
- [ ] 6. Tests: (a) jittery ETA (±40% sample noise) at p=0.3 produces rendered velocity changes under the slope cap; (b) stable ETA earns `base > 0.8` within 3 samples; (c) at p ≥ 0.9, displayed remaining time tracks raw ETA within one EMA step; (d) floor/backward/done behavior unchanged against existing test suite.

*Acceptance:* on a recorded jittery session, the bar's velocity visibly eases rather than lurching (slope-change log shows all updates within cap), while the final 10% of the render tracks the backend ETA closely and lands its done transition without a long 99.5% stall.
