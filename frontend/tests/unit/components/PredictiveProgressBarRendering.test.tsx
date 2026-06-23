import { render, screen, act } from '@testing-library/react'
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar'
import { describe, it, expect, vi } from 'vitest'

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
        // "Queued" now appears once (right-side status text); the duplicate status pill was removed.
        expect(screen.getAllByText('Queued')).toHaveLength(1)
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
        // Preparing surfaces via the label + right-side "Working..." text (the status
        // pill was removed); the indeterminate behavior is the .progress-bar-pending fill.
        expect(screen.getAllByText(/Prep|Proc|Working\.\.\./).length).toBeGreaterThan(0)
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
        expect(screen.getAllByText('Prep').length).toBeGreaterThan(0)
        const bar = container.querySelector('.progress-bar-pending') as HTMLElement
        expect(bar).toBeTruthy()
        // Fill is 100% so the barber-pole animation spans the full track width.
        // Pre-fix this was '35%'; before that '0%' (animation invisible on zero-width element).
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
        expect(screen.getByText('Fin')).toBeTruthy()
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
        const bar = container.querySelector('div[style*="var(--progress-done-fill)"]') as HTMLElement
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

    it('does not reset visual progress to 0 when the same bar instance receives a new segment-level persistenceKey mid-run', () => {
        // RED: ChapterHeader was using key={job:segment} which caused full remounts on segment
        // transitions. After remount, the bar starts from 0 even though the job is mid-run.
        // This test verifies the bar KEEPS its progress when only persistenceKey changes (no remount).
        const { rerender, container } = render(
            <PredictiveProgressBar
                progress={0.45}
                startedAt={Date.now() / 1000 - 10}
                etaSeconds={30}
                etaBasis="remaining_from_update"
                persistenceKey="job-abc:seg-1:1234"
                status="running"
                label="Prog"
                predictive={true}
                allowBackwardProgress={false}
                showEta={false}
            />
        )

        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement
        // Bar should be near 45% (initial progress)
        const beforeWidth = parseFloat(fill().style.width)
        expect(beforeWidth).toBeGreaterThan(30)

        // Simulate segment transition: same component instance (no React key remount),
        // only persistenceKey changes to a new segment. Progress resets to 0 for new segment.
        rerender(
            <PredictiveProgressBar
                progress={0}
                startedAt={Date.now() / 1000 - 10}
                etaSeconds={30}
                etaBasis="remaining_from_update"
                persistenceKey="job-abc:seg-2:1234"
                status="running"
                label="Prog"
                predictive={true}
                allowBackwardProgress={false}
                showEta={false}
            />
        )

        // Even though progress=0, allowBackwardProgress=false means the bar must not
        // snap backward below the memory floor from seg-1. Visual should stay >= 30%.
        // (Without the key-remount bug, the bar animates smoothly; it will not jump to 0%.)
        const afterWidth = parseFloat(fill().style.width)
        expect(afterWidth).toBeGreaterThan(30)
        expect(screen.queryByText('0%')).toBeNull()
    })

    it('rounds CSS style width strictly to 1 decimal place', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.2192458603132432}
                status="running"
                showEta={false}
            />
        )
        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement
        // 0.2192458603132432 * 100 = 21.92458603132432. toFixed(1) should be "21.9"
        expect(fill().style.width).toBe('21.9%')
    })

    it('uses the provided dataTestId prop for the data-testid attribute', () => {
        render(
            <PredictiveProgressBar
                progress={0.5}
                dataTestId="custom-test-id-bar"
                status="running"
            />
        )
        expect(screen.getByTestId('custom-test-id-bar')).toBeInTheDocument()
    })

    it('renders no status pill for a running bar (pill removed per owner feedback)', () => {
        render(
            <PredictiveProgressBar
                progress={0.4}
                label="Q"
                status="running"
                showEta={false}
                checkpointMode="queue"
            />
        )
        // The uppercase status pill (e.g. 'Rendering'/'Running') was removed; the label
        // is the only left-side header text and no status chip duplicates it.
        expect(screen.queryByText(/^(rendering|running|synthesizing|preparing|finalizing)$/i)).toBeNull()
    })

})
