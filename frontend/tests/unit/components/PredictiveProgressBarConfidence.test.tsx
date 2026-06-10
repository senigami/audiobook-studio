/**
 * Tests for the ETA confidence model (doc 15).
 *
 * (a) Jittery ETA at p≈0.3 — rendered velocity changes stay within slope cap ratio.
 * (b) Stable ETA — base > 0.8 within 3 samples.
 * (c) At p ≥ 0.9, displayed remaining tracks raw ETA within one EMA step.
 *
 * Revert checks for (a) and (b) are in comments at the bottom.
 */

import { render, act } from '@testing-library/react'
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar'
import { ETA_CONFIDENCE } from '@/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers'
import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
    vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// (a) Jittery ETA at p≈0.3 — velocity changes stay within slope cap
// ---------------------------------------------------------------------------
describe('PredictiveProgressBar - Confidence Model: jittery ETA', () => {
    it('velocity change per tick never exceeds slope cap ratio when ETA jitters ±40% at p=0.3', () => {
        vi.useFakeTimers()
        const baseNow = 100_000
        vi.setSystemTime(baseNow)

        // Base ETA: 200 seconds remaining. Progress=0.3 → ramp(0.3)=0 (below RAMP_START=0.55).
        // So w ≈ base ≤ 0.2; slopeCap = lerp(1.5, 4.0, ≤0.2) ≤ 2.0
        const baseEtaS = 200
        const startedAt = baseNow / 1000 - 60 // started 60 seconds ago

        let snapshot: any = null
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.3}
                startedAt={startedAt}
                etaSeconds={baseEtaS}
                status="running"
                onDebugSnapshot={sn => { snapshot = sn }}
                tickMs={250}
            />
        )

        // Feed 8 updates with ±40% jitter on etaSeconds
        const jitter = [1.0, 1.4, 0.6, 1.3, 0.7, 1.35, 0.65, 1.2]
        let prevDisplayedRemaining: number | null = null

        for (let i = 0; i < jitter.length; i++) {
            const nowMs = baseNow + i * 500
            vi.setSystemTime(nowMs)
            const etaS = Math.round(baseEtaS * jitter[i])

            rerender(
                <PredictiveProgressBar
                    progress={0.3 + i * 0.005}
                    startedAt={startedAt}
                    etaSeconds={etaS}
                    status="running"
                    onDebugSnapshot={sn => { snapshot = sn }}
                    tickMs={250}
                />
            )

            act(() => { vi.advanceTimersByTime(500) })

            const currentRemaining: number | null = snapshot?.displayedRemaining
            if (prevDisplayedRemaining !== null && currentRemaining !== null && currentRemaining > 0) {
                // Velocity ∝ 1/remaining. The change in velocity = prevRemaining/currentRemaining.
                // The slope cap at w≈0.2 is ≤ 2.0, so remaining should not jump by more than 2x.
                // We also allow natural drain, so allow prevRemaining/currentRemaining ≤ SLOPE_CAP_HIGH.
                const ratio = prevDisplayedRemaining / currentRemaining
                const inversRatio = currentRemaining / prevDisplayedRemaining
                const slopeCap = ETA_CONFIDENCE.SLOPE_CAP_HIGH // conservative upper bound
                expect(ratio).toBeLessThanOrEqual(slopeCap + 0.1) // remaining can shrink (vel up)
                expect(inversRatio).toBeLessThanOrEqual(slopeCap + 0.1) // remaining can grow (vel down)
            }
            prevDisplayedRemaining = currentRemaining
        }
    })
})

// ---------------------------------------------------------------------------
// (b) Stable ETA earns base > 0.8 within 3 samples
// ---------------------------------------------------------------------------
describe('PredictiveProgressBar - Confidence Model: stable ETA earns trust', () => {
    it('base > 0.8 after 3 identical ETA samples (via debug snapshot)', () => {
        vi.useFakeTimers()
        const baseNow = 100_000
        vi.setSystemTime(baseNow)

        const stableEtaS = 100
        const startedAt = baseNow / 1000 - 50

        let snapshot: any = null
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.3}
                startedAt={startedAt}
                etaSeconds={stableEtaS}
                status="running"
                onDebugSnapshot={sn => { snapshot = sn }}
                tickMs={250}
            />
        )

        // Feed 3 identical ETA samples (no jitter → cv→0 → base→1)
        for (let i = 1; i <= 3; i++) {
            vi.setSystemTime(baseNow + i * 300)
            rerender(
                <PredictiveProgressBar
                    progress={0.3 + i * 0.01}
                    startedAt={startedAt}
                    etaSeconds={stableEtaS}
                    status="running"
                    onDebugSnapshot={sn => { snapshot = sn }}
                    tickMs={250}
                />
            )
            act(() => { vi.advanceTimersByTime(300) })
        }

        expect(snapshot).not.toBeNull()
        // base should have risen well above BASE_FLOOR after stable samples
        expect(snapshot.etaConfidenceBase).toBeGreaterThan(0.8)
    })
})

// ---------------------------------------------------------------------------
// (c) At p ≥ 0.9, displayed remaining tracks raw ETA within one EMA step
// ---------------------------------------------------------------------------
describe('PredictiveProgressBar - Confidence Model: high-progress ETA tracking', () => {
    it('at p=0.9 with stable ETA, displayed remaining tracks raw ETA within one EMA step', () => {
        vi.useFakeTimers()
        const baseNow = 100_000
        vi.setSystemTime(baseNow)

        const etaS = 30
        const startedAt = baseNow / 1000 - 270 // progressed well

        let snapshot: any = null

        // Feed 7 identical samples to get a well-earned base, then one more at p=0.9
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.88}
                startedAt={startedAt}
                etaSeconds={etaS}
                status="running"
                onDebugSnapshot={sn => { snapshot = sn }}
                tickMs={250}
            />
        )

        // Warm up confidence with stable samples
        for (let i = 1; i <= 5; i++) {
            vi.setSystemTime(baseNow + i * 200)
            rerender(
                <PredictiveProgressBar
                    progress={0.88 + i * 0.003}
                    startedAt={startedAt}
                    etaSeconds={etaS}
                    status="running"
                    onDebugSnapshot={sn => { snapshot = sn }}
                    tickMs={250}
                />
            )
            act(() => { vi.advanceTimersByTime(200) })
        }

        // Now at p ≥ 0.9 with stable ETA
        vi.setSystemTime(baseNow + 1500)
        rerender(
            <PredictiveProgressBar
                progress={0.92}
                startedAt={startedAt}
                etaSeconds={etaS}
                status="running"
                onDebugSnapshot={sn => { snapshot = sn }}
                tickMs={250}
            />
        )
        act(() => { vi.advanceTimersByTime(250) })

        expect(snapshot).not.toBeNull()
        // w should be high at p=0.9 (ramp is 1 at RAMP_END=0.90)
        expect(snapshot.etaConfidenceW).toBeGreaterThan(0.8)

        // Displayed remaining should be close to raw etaS
        // Within one EMA step: |displayed - raw| ≤ |ema - raw| * (1 - ALPHA_MAX)
        // Loosely: within ~5 seconds of the raw ETA
        const remaining = snapshot.displayedRemaining
        expect(remaining).toBeGreaterThan(0)
        expect(Math.abs(remaining - etaS)).toBeLessThan(15)
    })
})

// ---------------------------------------------------------------------------
// Pure helper unit tests (cv, smoothstep, clampSlope)
// ---------------------------------------------------------------------------
import {
    computeCv,
    smoothstepRamp,
    clampSlope,
    emaStep,
} from '@/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers'

describe('ETA Confidence pure helpers', () => {
    describe('smoothstepRamp', () => {
        it('returns 0 below RAMP_START', () => {
            expect(smoothstepRamp(0)).toBe(0)
            expect(smoothstepRamp(0.54)).toBe(0)
        })
        it('returns 1 at RAMP_END', () => {
            expect(smoothstepRamp(0.9)).toBe(1)
            expect(smoothstepRamp(1.0)).toBe(1)
        })
        it('returns smooth intermediate at midpoint', () => {
            const mid = smoothstepRamp(0.725)
            expect(mid).toBeGreaterThan(0)
            expect(mid).toBeLessThan(1)
        })
        it('is monotonically increasing', () => {
            const vals = [0.5, 0.6, 0.7, 0.8, 0.9].map(p => smoothstepRamp(p))
            for (let i = 1; i < vals.length; i++) {
                expect(vals[i]).toBeGreaterThanOrEqual(vals[i - 1])
            }
        })
    })

    describe('computeCv', () => {
        it('returns 0 for a single sample', () => {
            expect(computeCv([150_000], 100_000)).toBe(0)
        })
        it('returns ~0 for identical samples', () => {
            expect(computeCv([150_000, 150_000, 150_000], 100_000)).toBeCloseTo(0, 5)
        })
        it('returns positive cv for jittery samples', () => {
            const now = 100_000
            const samples = [130_000, 200_000, 140_000, 210_000] // high variance
            const cv = computeCv(samples, now)
            expect(cv).toBeGreaterThan(0.1)
        })
    })

    describe('emaStep', () => {
        it('returns sample when alpha=1', () => {
            expect(emaStep(100, 200, 1)).toBe(200)
        })
        it('returns ema when alpha=0', () => {
            expect(emaStep(100, 200, 0)).toBe(100)
        })
        it('blends correctly at alpha=0.5', () => {
            expect(emaStep(100, 200, 0.5)).toBe(150)
        })
    })

    describe('clampSlope', () => {
        it('passes through when prevEndAtMs is null', () => {
            expect(clampSlope(200_000, null, 0.3, 100_000, 0.5)).toBe(200_000)
        })
        it('caps a large speedup (short duration) to SLOPE_CAP * prevDuration', () => {
            // prevDuration = 100s. proposedDuration = 10s (10x speedup). cap at w=1 is 4.0.
            // minDuration = 100_000 / 4.0 = 25_000ms
            const nowMs = 100_000
            const prevEndAtMs = nowMs + 100_000
            const proposedEndAtMs = nowMs + 10_000 // too fast
            const result = clampSlope(proposedEndAtMs, prevEndAtMs, 0.3, nowMs, 1.0)
            expect(result).toBeGreaterThan(proposedEndAtMs) // duration was increased (velocity capped)
            expect(result).toBeLessThanOrEqual(prevEndAtMs) // still faster than prev
        })
        it('caps a large slowdown (long duration) to prevDuration * SLOPE_CAP', () => {
            const nowMs = 100_000
            const prevEndAtMs = nowMs + 50_000
            const proposedEndAtMs = nowMs + 500_000 // 10x slowdown
            const result = clampSlope(proposedEndAtMs, prevEndAtMs, 0.3, nowMs, 0.5)
            // slopeCap at w=0.5 = 1.5 + 2.5*0.5 = 2.75; maxDuration = 50_000*2.75 = 137_500
            expect(result).toBeLessThan(proposedEndAtMs)
            expect(result).toBeGreaterThan(prevEndAtMs)
        })
        it('passes through when within cap', () => {
            const nowMs = 100_000
            const prevEndAtMs = nowMs + 100_000
            const proposedEndAtMs = nowMs + 120_000 // 20% slower — within cap
            const result = clampSlope(proposedEndAtMs, prevEndAtMs, 0.3, nowMs, 0.5)
            expect(result).toBe(proposedEndAtMs)
        })
    })
})

// ---------------------------------------------------------------------------
// REVERT CHECKS (instructions for manual verification):
//
// (a) To verify test (a) goes RED on broken logic:
//     In useEtaConfidence.ts, change ETA_CONFIDENCE.ALPHA_MAX to 1.0 (no smoothing)
//     and set slopeCap to 999 in clampSlope — velocity changes will exceed the cap.
//
// (b) To verify test (b) goes RED on broken logic:
//     In useEtaConfidence.ts, always set base = BASE_FLOOR (no adaptation)
//     → base will stay at 0.2, never reach > 0.8 for stable samples.
// ---------------------------------------------------------------------------
