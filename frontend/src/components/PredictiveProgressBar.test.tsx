import { render, screen } from '@testing-library/react'
import { PredictiveProgressBar } from './PredictiveProgressBar'
import { describe, it, expect, vi } from 'vitest'

describe('PredictiveProgressBar', () => {
    it('renders correctly with given progress', () => {
        render(<PredictiveProgressBar progress={0.5} label="Testing..." showEta={false} status="running" />)
        expect(screen.getByText('Testing...')).toBeTruthy()
        expect(screen.getByText('50%')).toBeTruthy()
    })

    it('calculates ETA using elapsed time', () => {
        // Mock Date.now() to a stable value
        const now = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(now)

        // started 10s ago, eta is 100s, progress is 0.1
        render(
            <PredictiveProgressBar 
                progress={0.10} 
                startedAt={(now / 1000) - 10} 
                etaSeconds={100} 
                label="Proc" 
                status="running"
            />
        )
        // calculatedRemaining should be ~90 seconds (1:30)
        expect(screen.getByText(/ETA: 1:30/i)).toBeTruthy()
        
        vi.restoreAllMocks()
    })

    it('stays at zero while queued or preparing', () => {
        render(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={undefined}
                etaSeconds={120}
                label="Proc"
                status="preparing"
                showEta={false}
            />
        )

        expect(screen.getByText('0%')).toBeTruthy()
    })

    it('can render raw live progress without ETA prediction', () => {
        render(
            <PredictiveProgressBar
                progress={0.16}
                startedAt={undefined}
                etaSeconds={undefined}
                label="Live"
                status="running"
                showEta={false}
                predictive={false}
            />
        )

        expect(screen.getByText('16%')).toBeTruthy()
    })
})
