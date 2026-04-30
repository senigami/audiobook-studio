import { render, screen } from '@testing-library/react'
import { PredictiveProgressBar } from './PredictiveProgressBar'
import { describe, it, expect } from 'vitest'

describe('PredictiveProgressBar - Rendering', () => {
    it('renders correctly with given progress', () => {
        render(<PredictiveProgressBar progress={0.5} label="Testing..." showEta={false} status="running" />)
        expect(screen.getByText('Testing...')).toBeTruthy()
        expect(screen.getByText('50%')).toBeTruthy()
    })

    it('stays at zero while queued', () => {
        render(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={undefined}
                etaSeconds={120}
                label="Proc"
                status="queued"
                showEta={false}
            />
        )
        expect(screen.getAllByText('Queued')).toHaveLength(2)
    })

    it('shows preparing as an indeterminate state even when live timing data exists', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.42}
                startedAt={100}
                etaSeconds={120}
                label="Proc"
                status="preparing"
                showEta={false}
            />
        )
        expect(screen.getByText('Working...')).toBeTruthy()
        expect(screen.getByText('Preparing')).toBeTruthy()
        expect(container.querySelector('.progress-bar-pending')).toBeTruthy()
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

    it('renders a barber-pole preparing state when preparing is active', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                label="Prep"
                status="preparing"
                showEta={false}
            />
        )
        expect(screen.getByText('Working...')).toBeTruthy()
        const bar = container.querySelector('.progress-bar-pending') as HTMLElement
        expect(bar).toBeTruthy()
        expect(bar.style.width).toBe('100%')
    })

    it('auto-flips a running bar to finalizing at 100 percent until done arrives', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={1}
                startedAt={100}
                etaSeconds={120}
                label="Fin"
                status="running"
                showEta={false}
            />
        )
        expect(screen.getByText('Finalizing...')).toBeTruthy()
        const bar = container.querySelector('.progress-bar-finalizing') as HTMLElement
        expect(bar).toBeTruthy()
        expect(bar.style.width).toBe('100%')
    })

    it('renders a distinct complete state for done jobs', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.42}
                label="Done"
                status="done"
                showEta={false}
            />
        )
        expect(screen.getByText('Complete')).toBeTruthy()
        const bar = container.querySelector('div[style*="linear-gradient(90deg, rgba(16, 185, 129"]') as HTMLElement
        expect(bar).toBeTruthy()
    })

    it('renders barOnly mode correctly', () => {
        const { container } = render(
            <PredictiveProgressBar 
                progress={0.42} 
                status="running" 
                barOnly={true} 
            />
        )
        expect(screen.queryByText('42%')).toBeNull()
        expect(container.querySelector('[data-testid="progress-bar-tiny"]')).toBeTruthy()
    })

    it('activates the progress bar for running jobs even at exactly 0.0 progress', () => {
        const { container } = render(
            <PredictiveProgressBar 
                progress={0} 
                status="running" 
                showEta={false}
            />
        )
        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement
        expect(fill().style.width).toBe('0%')
        expect(screen.queryByText('Working...')).toBeNull()
        expect(container.querySelector('.progress-bar-pending')).toBeNull()
    })

    it('remains at determinate 0% for running jobs without an ETA', () => {
        const { container } = render(
            <PredictiveProgressBar 
                progress={0} 
                status="running" 
                showEta={false}
                etaSeconds={undefined}
            />
        )
        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement
        expect(fill().style.width).toBe('0%')
        expect(container.querySelector('.progress-bar-pending')).toBeNull()
    })
})
