import { act, render, screen } from '@testing-library/react'
import { PredictiveProgressBar } from './PredictiveProgressBar'
import { describe, it, expect, vi } from 'vitest'

const readPercent = () => {
    const matches = screen.getAllByText(/\d+%/)
    return Number.parseInt(matches[0].textContent || '0', 10)
}

const advanceInTicks = (ms: number, tickMs = 250) => {
    for (let elapsed = 0; elapsed < ms; elapsed += tickMs) {
        act(() => {
            vi.advanceTimersByTime(Math.min(tickMs, ms - elapsed))
        })
    }
}

describe('PredictiveProgressBar', () => {
    it('renders correctly with given progress', () => {
        render(<PredictiveProgressBar progress={0.5} label="Testing..." showEta={false} status="running" />)
        expect(screen.getByText('Testing...')).toBeTruthy()
        expect(screen.getByText('50%')).toBeTruthy()
    })

    it('calculates ETA using elapsed time', () => {
        const now = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(now)
        render(
            <PredictiveProgressBar 
                progress={0.10} 
                startedAt={(now / 1000) - 10} 
                etaSeconds={100} 
                label="Proc" 
                status="running"
            />
        )
        expect(screen.getByText(/ETA: 1:30/i)).toBeTruthy()
        vi.restoreAllMocks()
    })

    it('starts resumed jobs from authoritative backend progress instead of jumping ahead on mount', () => {
        vi.useFakeTimers()
        vi.setSystemTime(91_000)
        render(
            <PredictiveProgressBar
                progress={0.25}
                startedAt={1}
                etaSeconds={100}
                label="Proc"
                status="running"
                showEta={false}
            />
        )
        expect(screen.getByText('25%')).toBeTruthy()
        act(() => {
            vi.advanceTimersByTime(1000)
        })
        expect(screen.getByText(/2[5-9]%|3[0-9]%/)).toBeTruthy()
        vi.useRealTimers()
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

    it('jumps the loader to zero when preparing hands off to running', () => {
        const { container, rerender } = render(
            <PredictiveProgressBar
                progress={0}
                startedAt={100}
                etaSeconds={120}
                label="Proc"
                status="preparing"
                showEta={false}
            />
        )
        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement
        expect(fill()).toBeTruthy()
        expect(fill().style.width).toBe('100%')
        rerender(
            <PredictiveProgressBar
                progress={0.01}
                startedAt={100}
                etaSeconds={120}
                label="Proc"
                status="running"
                showEta={false}
            />
        )
        expect(fill().style.width).toBe('1%')
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

    it('auto-flips a running bar to finalizing when the eta is exhausted', () => {
        vi.useFakeTimers()
        vi.setSystemTime(127_000)
        render(
            <PredictiveProgressBar
                progress={0.996}
                startedAt={1}
                etaSeconds={120}
                label="Fin"
                status="running"
                showEta={false}
            />
        )
        expect(screen.getByText('Finalizing...')).toBeTruthy()
        vi.useRealTimers()
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

    it('applies a backend correction smoothly', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(91_000)
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0}
                startedAt={1}
                etaSeconds={100}
                label="Proc"
                status="running"
                showEta={false}
                transitionTickCount={4}
                tickMs={250}
            />
        )
        expect(screen.getByText('0%')).toBeTruthy()
        rerender(
            <PredictiveProgressBar
                progress={0.33}
                startedAt={1}
                etaSeconds={100}
                label="Proc"
                status="running"
                showEta={false}
                transitionTickCount={4}
                tickMs={250}
            />
        )
        expect(readPercent()).toBeLessThan(33)
        advanceInTicks(1000)
        expect(screen.getByText('33%')).toBeTruthy()
        vi.useRealTimers()
    })

    it('moves backward smoothly when allowBackwardProgress is true', () => {
        vi.useFakeTimers()
        vi.setSystemTime(91_000)
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.6}
                startedAt={1}
                etaSeconds={100}
                label="Proc"
                status="running"
                showEta={false}
                allowBackwardProgress={true}
                transitionTickCount={4}
                tickMs={250}
            />
        )
        expect(screen.getByText('60%')).toBeTruthy()
        rerender(
            <PredictiveProgressBar
                progress={0.25}
                startedAt={1}
                etaSeconds={100}
                label="Proc"
                status="running"
                showEta={false}
                allowBackwardProgress={true}
                transitionTickCount={4}
                tickMs={250}
            />
        )
        // Default backward correction is 2 ticks (500ms)
        advanceInTicks(500)
        expect(readPercent()).toBe(25)
        vi.useRealTimers()
    })

    it('honors transitionTickCount and tickMs for migration duration', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        const { rerender } = render(
            <PredictiveProgressBar 
                progress={0.1} 
                status="running" 
                transitionTickCount={4} 
                tickMs={100} 
            />
        )
        rerender(
            <PredictiveProgressBar 
                progress={0.5} 
                status="running" 
                transitionTickCount={4} 
                tickMs={100} 
            />
        )
        act(() => { vi.advanceTimersByTime(200) })
        const midValue = readPercent()
        expect(midValue).toBeGreaterThan(10)
        expect(midValue).toBeLessThan(50)
        act(() => { vi.advanceTimersByTime(250) })
        expect(readPercent()).toBe(50)
        vi.useRealTimers()
    })

    it('clumps backward progress when allowBackwardProgress is false', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        const { rerender } = render(
            <PredictiveProgressBar 
                progress={0.6} 
                status="running" 
                allowBackwardProgress={false}
                transitionTickCount={2}
                tickMs={250}
            />
        )
        rerender(
            <PredictiveProgressBar 
                progress={0.2} 
                status="running" 
                allowBackwardProgress={false}
                transitionTickCount={2}
                tickMs={250}
            />
        )
        advanceInTicks(500)
        expect(readPercent()).toBeGreaterThanOrEqual(60)
        vi.useRealTimers()
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

    it('does not increase ETA unless a new prop update gives a later endAtMs', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        const { rerender } = render(
            <PredictiveProgressBar 
                progress={0.5} 
                startedAt={50}
                etaSeconds={100}
                status="running" 
            />
        )
        const initialS = parseTime(screen.getByText(/ETA:/).textContent)
        act(() => { vi.advanceTimersByTime(10000) })
        const advancedS = parseTime(screen.getByText(/ETA:/).textContent)
        expect(advancedS).toBeLessThan(initialS)
        rerender(
            <PredictiveProgressBar 
                progress={0.6} 
                startedAt={50}
                etaSeconds={100}
                status="running" 
            />
        )
        const rerenderedS = parseTime(screen.getByText(/ETA:/).textContent)
        expect(rerenderedS).toBe(advancedS)
        vi.useRealTimers()
    })

    it('increases ETA when a new prop update gives a later endAtMs', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        const { rerender } = render(
            <PredictiveProgressBar 
                progress={0.5} 
                startedAt={50}
                etaSeconds={100}
                status="running" 
            />
        )
        const beforeS = parseTime(screen.getByText(/ETA:/).textContent)
        rerender(
            <PredictiveProgressBar 
                progress={0.5} 
                startedAt={50}
                etaSeconds={200}
                status="running" 
            />
        )
        const afterS = parseTime(screen.getByText(/ETA:/).textContent)
        expect(afterS).toBeGreaterThan(beforeS)
        vi.useRealTimers()
    })

    it('is null-safe for debug snapshots before first capture', () => {
        let captured: any = null
        render(
            <PredictiveProgressBar 
                progress={0.5} 
                status="running" 
                onDebugSnapshot={sn => captured = sn}
            />
        )
        expect(captured).not.toBeNull()
        expect(captured.migrationProgress).toBeNull()
    })

    it('re-anchors to the first real running progress when startedAt changes from preparing into a live run', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000)
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0}
                startedAt={100}
                etaSeconds={57}
                persistenceKey="job-1"
                label="Proc"
                status="preparing"
                showEta={false}
            />
        )
        rerender(
            <PredictiveProgressBar
                progress={0.05}
                startedAt={120}
                etaSeconds={57}
                persistenceKey="job-1"
                label="Proc"
                status="running"
                showEta={false}
            />
        )
        expect(screen.getByText('5%')).toBeTruthy()
        vi.useRealTimers()
    })

    it('honors evidenceWeightFraction by only moving a fraction of the distance toward target', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        let captured: any = null
        const { rerender } = render(
            <PredictiveProgressBar 
                progress={0.1} 
                status="running" 
                transitionTickCount={4} 
                tickMs={1000}
                onDebugSnapshot={sn => captured = sn}
            />
        )
        // Move from 10% to 50% but with only 50% confidence
        rerender(
            <PredictiveProgressBar 
                progress={0.5} 
                status="running" 
                transitionTickCount={4} 
                tickMs={1000}
                evidenceWeightFraction={0.5}
                onDebugSnapshot={sn => captured = sn}
            />
        )
        // Target should be 10% + (50%-10%)*0.5 = 30%
        expect(captured.effectiveTargetProgress).toBeCloseTo(0.3)
        
        act(() => { vi.advanceTimersByTime(4000) })
        expect(readPercent()).toBe(30)
        vi.useRealTimers()
    })

    it('includes all transition and confidence fields in debug snapshot', () => {
        let captured: any = null
        render(
            <PredictiveProgressBar 
                progress={0.5} 
                status="running" 
                transitionTickCount={12}
                backwardTransitionTickCount={2}
                tickMs={250}
                evidenceWeightFraction={0.8}
                onDebugSnapshot={sn => captured = sn}
            />
        )
        expect(captured.transitionTickCount).toBe(12)
        expect(captured.backwardTransitionTickCount).toBe(2)
        expect(captured.tickMs).toBe(250)
        expect(captured.evidenceWeightFraction).toBe(0.8)
    })

    it('uses the generic default transition of 8 ticks', () => {
        let captured: any = null
        render(<PredictiveProgressBar progress={0.5} status="running" onDebugSnapshot={sn => captured = sn} />)
        expect(captured.transitionTickCount).toBe(8)
    })

    it('uses backwardTransitionTickCount (default 2) for backward migrations', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        let captured: any = null
        const { rerender } = render(
            <PredictiveProgressBar 
                progress={0.6} 
                status="running" 
                allowBackwardProgress={true}
                transitionTickCount={12}
                backwardTransitionTickCount={2}
                tickMs={250}
                onDebugSnapshot={sn => captured = sn}
            />
        )
        // Move backward to 20%
        rerender(
            <PredictiveProgressBar 
                progress={0.2} 
                status="running" 
                allowBackwardProgress={true}
                transitionTickCount={12}
                backwardTransitionTickCount={2}
                tickMs={250}
                onDebugSnapshot={sn => captured = sn}
            />
        )
        expect(captured.isBackwardMigration).toBe(true)
        expect(captured.activeTransitionTickCount).toBe(2)
        expect(captured.migrationDurationMs).toBe(500) // 2 * 250
        vi.useRealTimers()
    })
})

function parseTime(t: string | null) {
    const m = t?.match(/(\d+):(\d+)/)
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}
