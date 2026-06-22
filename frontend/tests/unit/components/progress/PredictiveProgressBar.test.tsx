import { render } from '@testing-library/react'
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar'
import { describe, it, expect } from 'vitest'

// P3 terminus-icon tests (INV-4: state conveyed by icon, not color alone)
describe('PredictiveProgressBar — P3 terminus icon', () => {
    it('shows a terminus icon at the leading edge of the fill when fill > 8% and status is running', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.5}
                status="running"
                showEta={false}
                label="Test"
                allowBackwardProgress={false}
            />
        )
        const terminusIcon = container.querySelector('[data-testid="progress-terminus-icon"]')
        expect(terminusIcon).toBeTruthy()
    })

    it('hides the terminus icon when displayed fill <= 8%', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.02}
                status="running"
                showEta={false}
                label="Test"
                allowBackwardProgress={false}
                predictive={false}
            />
        )
        const terminusIcon = container.querySelector('[data-testid="progress-terminus-icon"]')
        expect(terminusIcon).toBeNull()
    })

    it('applies is-running class to fill div when status is running', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.5}
                status="running"
                showEta={false}
                label="Test"
                allowBackwardProgress={false}
            />
        )
        // The fill div that receives calm-pulse animation
        const runningFill = container.querySelector('.is-running')
        expect(runningFill).toBeTruthy()
    })
})
