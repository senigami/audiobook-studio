import { render } from '@testing-library/react'
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar'
import { getProgressInfo } from '@/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers'
import { describe, it, expect } from 'vitest'

// Per owner feedback the leading-edge terminus icon (spinner/check) and the redundant
// uppercase status pill were removed. State is still conveyed without color alone — by
// the label, the right-side status/ETA text, and the fill — so WCAG 1.4.1 holds.
describe('PredictiveProgressBar — no terminus icon, no status pill', () => {
    it('renders no terminus icon at the leading edge of the fill', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.5}
                status="running"
                showEta={false}
                label="Rendering chapter audio"
                allowBackwardProgress={false}
            />
        )
        expect(container.querySelector('[data-testid="progress-terminus-icon"]')).toBeNull()
    })

    it('does not render a redundant status pill (no standalone RUNNING chip)', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.5}
                status="running"
                showEta={false}
                showPercent
                label="Chapter audio"
                allowBackwardProgress={false}
            />
        )
        // The label is the only left-side header text; the status is carried by the
        // right-side text/percent + fill, not a duplicated "RUNNING" pill.
        expect(/running/i.test(container.textContent ?? '')).toBe(false)
    })

    it('applies progress-bar-breathe (not is-running) on the fill when running', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.5}
                status="running"
                showEta={false}
                label="Chapter audio"
                allowBackwardProgress={false}
            />
        )
        expect(container.querySelector('.progress-bar-breathe')).toBeTruthy()
        expect(container.querySelector('.is-running')).toBeNull()
    })
})

// W-MIX-LA 004 (REOPENED): status:'running' + indeterminate:true must pulse,
// not run the 120s predictive lane.
// R1 revert-check: these tests fail on pre-fix code (which only gates on
// status==='preparing') and must pass after the fix.
describe('PredictiveProgressBar — indeterminate prop honors mid-chapter model load', () => {
    // Pure helper test: getProgressInfo should return indeterminate:true when
    // preparingIndeterminate is true regardless of presentationState.
    it('getProgressInfo returns indeterminate:true when preparingIndeterminate=true (status=running)', () => {
        const result = getProgressInfo({
            presentationState: 'running',
            preparingIndeterminate: true,
            displayProgress: 0.18, // would be ~18% if lane were running
        })
        expect(result.indeterminate).toBe(true)
        expect(result.localProgress).toBe(0)
    })

    it('getProgressInfo returns indeterminate:false and uses displayProgress when status=running without preparing flag', () => {
        const result = getProgressInfo({
            presentationState: 'running',
            preparingIndeterminate: false,
            displayProgress: 0.18,
        })
        expect(result.indeterminate).toBe(false)
        expect(result.localProgress).toBeCloseTo(0.18, 5)
    })

    // Component render test: status:'running' + indeterminate:true → pending class, no creping lane.
    // R1: without the indeterminate prop being honored, the bar renders with no progress-bar-pending
    // class (preparingIndeterminate=false → indeterminateClassName is undefined).
    it('renders progress-bar-pending class when status=running and indeterminate=true', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.18}
                status="running"
                indeterminate={true}
                etaSeconds={51}
                showEta={true}
                label="Segment"
                allowBackwardProgress={false}
            />
        )
        // Must show the preparing-pulse CSS class, NOT the breathe/running animation.
        expect(container.querySelector('.progress-bar-pending')).toBeTruthy()
        // Must NOT show ETA countdown (indeterminate bars carry no lane).
        // The ETA text should not appear; instead "Preparing…" busy label shows.
        const barText = container.textContent ?? ''
        expect(/ETA/.test(barText)).toBe(false)
    })

    it('does NOT render progress-bar-pending when status=running and indeterminate is absent', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.18}
                status="running"
                etaSeconds={51}
                showEta={true}
                label="Segment"
                allowBackwardProgress={false}
            />
        )
        expect(container.querySelector('.progress-bar-pending')).toBeNull()
    })

    // busyLabel prop: when indeterminate=true and busyLabel is set, it overrides "Preparing…".
    it('shows custom busyLabel text when indeterminate=true and busyLabel is provided', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                status="running"
                indeterminate={true}
                busyLabel="Preparing… / Loading voice model…"
                showEta={true}
                label="Segment"
                allowBackwardProgress={false}
            />
        )
        expect(container.textContent).toContain('Loading voice model')
    })
})
