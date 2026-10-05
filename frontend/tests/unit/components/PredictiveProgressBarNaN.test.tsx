import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar'
import { clamp01 } from '@/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers'

// Regression: the progress bar rendered "NaN%". clamp01 is the shared sink for
// the displayed percentage; it was not NaN-safe, so an undefined progress prop
// (RailBookBlock passed raw activeJob.progress) or a NaN lane-duration division
// propagated straight to `Math.round(NaN * 100) = NaN%`.
describe('PredictiveProgressBar - NaN safety', () => {
    it('clamp01 collapses non-finite input to 0 (R1: was NaN before the fix)', () => {
        expect(clamp01(NaN)).toBe(0)
        expect(clamp01(undefined as unknown as number)).toBe(0)
        expect(clamp01(Infinity)).toBe(0)
        // sane values still pass through
        expect(clamp01(0.5)).toBe(0.5)
        expect(clamp01(1.5)).toBe(1)
        expect(clamp01(-1)).toBe(0)
    })

    it('never renders "NaN%" when the progress prop is undefined', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={undefined as unknown as number}
                status="running"
                showPercent
            />
        )
        expect(container.textContent ?? '').not.toContain('NaN')
    })

    it('never renders "NaN%" when the progress prop is NaN during running', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        const { container } = render(
            <PredictiveProgressBar
                progress={NaN}
                status="running"
                etaSeconds={50}
                updatedAt={100}
                showPercent
            />
        )
        expect(container.textContent ?? '').not.toContain('NaN')
        vi.useRealTimers()
    })

    // The ETA countdown is a separate render path from the percentage: resolveEndAtMs
    // let a NaN etaSeconds through (typeof NaN === 'number', NaN < 0 is false) →
    // formatTime(NaN) renders "NaN:NaN".
    it('never renders "NaN" in the ETA countdown when etaSeconds is NaN', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        const { container } = render(
            <PredictiveProgressBar
                progress={0.4}
                status="running"
                etaSeconds={NaN}
                etaBasis="remaining_from_update"
                updatedAt={100}
                showPercent
            />
        )
        expect(container.textContent ?? '').not.toContain('NaN')
        vi.useRealTimers()
    })

    it('never renders "NaN" when both progress and etaSeconds are NaN', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        const { container } = render(
            <PredictiveProgressBar
                progress={NaN}
                status="running"
                etaSeconds={NaN}
                etaBasis="remaining_from_update"
                updatedAt={100}
                showPercent
            />
        )
        expect(container.textContent ?? '').not.toContain('NaN')
        vi.useRealTimers()
    })
})
