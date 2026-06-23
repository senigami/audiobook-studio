import { render } from '@testing-library/react'
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar'
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
