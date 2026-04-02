import { act, render, screen } from '@testing-library/react'
import { PredictiveProgressBar } from './PredictiveProgressBar'
import { describe, it, expect, vi } from 'vitest'

const readPercent = () => {
    const matches = screen.getAllByText(/\d+%/)
    return Number.parseInt(matches[0].textContent || '0', 10)
}

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

        expect(screen.getByText(/0%|1%/)).toBeTruthy()
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

    it('renders an indeterminate working state for non-predictive running jobs', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                label="Live"
                status="running"
                showEta={false}
                predictive={false}
                indeterminateRunning={true}
            />
        )

        expect(screen.getByText('Working...')).toBeTruthy()
        const bar = container.querySelector('.progress-bar-animated') as HTMLElement
        expect(bar).toBeTruthy()
        expect(bar.style.width).toBe('35%')
    })

    it('pins finalizing jobs at 100 percent', () => {
        render(
            <PredictiveProgressBar
                progress={0.42}
                label="Fin"
                status="finalizing"
                showEta={false}
            />
        )

        expect(screen.getByText('100%')).toBeTruthy()
    })

    it('smoothly eases toward a backend correction instead of snapping immediately', async () => {
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
            />
        )

        expect(screen.getByText(/0%|1%/)).toBeTruthy()

        rerender(
            <PredictiveProgressBar
                progress={0.33}
                startedAt={1}
                etaSeconds={100}
                label="Proc"
                status="running"
                showEta={false}
            />
        )

        expect(screen.queryByText('33%')).toBeNull()

        act(() => {
            vi.advanceTimersByTime(1000)
        })

        expect(screen.queryByText('33%')).toBeNull()
        expect(screen.getByText(/1%|2%|3%|4%|5%/)).toBeTruthy()

        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('does not move backward when a later correction is lower than the displayed progress', () => {
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
            />
        )

        act(() => {
            vi.advanceTimersByTime(1000)
        })

        expect(screen.queryByText(/5[0-9]%|4[0-9]%|3[0-9]%|2[0-9]%/)).toBeNull()
        expect(screen.getByText(/6[0-9]%|7[0-9]%/)).toBeTruthy()

        vi.useRealTimers()
    })

    it('does not restart from stale lower progress when remounted with the same persistence key', () => {
        vi.useFakeTimers()
        vi.setSystemTime(91_000)

        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.6}
                startedAt={1}
                etaSeconds={100}
                persistenceKey="job-1"
                label="Proc"
                status="running"
                showEta={false}
            />
        )

        expect(screen.getByText('60%')).toBeTruthy()

        rerender(
            <PredictiveProgressBar
                progress={0.1}
                startedAt={1}
                etaSeconds={100}
                persistenceKey="job-1"
                label="Proc"
                status="running"
                showEta={false}
            />
        )

        expect(screen.queryByText(/1[0-9]%|2[0-9]%|3[0-9]%|4[0-9]%|5[0-9]%/)).toBeNull()
        expect(screen.getByText(/6[0-9]%|7[0-9]%/)).toBeTruthy()

        vi.useRealTimers()
    })

    it('keeps the visible position steady when a higher backend correction arrives and only changes pace after that', () => {
        vi.useFakeTimers()
        vi.setSystemTime(26_000)

        const { rerender } = render(
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
            vi.advanceTimersByTime(10_000)
        })

        const beforeCorrection = readPercent()
        expect(beforeCorrection).toBeGreaterThanOrEqual(25)
        expect(beforeCorrection).toBeLessThanOrEqual(30)

        rerender(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={1}
                etaSeconds={100}
                label="Proc"
                status="running"
                showEta={false}
            />
        )

        expect(readPercent()).toBe(beforeCorrection)

        act(() => {
            vi.advanceTimersByTime(10_000)
        })

        expect(readPercent()).toBeGreaterThan(beforeCorrection)

        vi.useRealTimers()
    })

    it('keeps the visible position steady when a lower backend correction arrives and only slows future pace', () => {
        vi.useFakeTimers()
        vi.setSystemTime(51_000)

        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={1}
                etaSeconds={100}
                label="Proc"
                status="running"
                showEta={false}
            />
        )

        expect(screen.getByText('50%')).toBeTruthy()

        act(() => {
            vi.advanceTimersByTime(10_000)
        })

        const beforeCorrection = readPercent()
        expect(beforeCorrection).toBeGreaterThanOrEqual(50)
        expect(beforeCorrection).toBeLessThanOrEqual(55)

        rerender(
            <PredictiveProgressBar
                progress={0.25}
                startedAt={1}
                etaSeconds={100}
                label="Proc"
                status="running"
                showEta={false}
            />
        )

        expect(readPercent()).toBe(beforeCorrection)

        act(() => {
            vi.advanceTimersByTime(10_000)
        })

        expect(readPercent()).toBeGreaterThanOrEqual(beforeCorrection)

        vi.useRealTimers()
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

        expect(screen.getByText(/0%|1%/)).toBeTruthy()

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

        act(() => {
            vi.advanceTimersByTime(250)
        })

        expect(readPercent()).toBeGreaterThanOrEqual(5)
        expect(readPercent()).toBeLessThanOrEqual(6)

        vi.useRealTimers()
    })

    it('uses authoritative progress as a floor for segment-scoped bars', () => {
        vi.useFakeTimers()
        vi.setSystemTime(20_000)

        const { rerender } = render(
            <PredictiveProgressBar
                progress={0}
                startedAt={1}
                etaSeconds={57}
                label="Segment Progress"
                status="running"
                showEta={false}
                authoritativeFloor={true}
            />
        )

        rerender(
            <PredictiveProgressBar
                progress={0.66}
                startedAt={1}
                etaSeconds={57}
                label="Segment Progress"
                status="running"
                showEta={false}
                authoritativeFloor={true}
            />
        )

        expect(screen.getByText('66%')).toBeTruthy()

        vi.useRealTimers()
    })

    it('keeps moving forward after a segment checkpoint instead of freezing on it', () => {
        vi.useFakeTimers()
        vi.setSystemTime(20_000)

        render(
            <PredictiveProgressBar
                progress={0.66}
                startedAt={1}
                etaSeconds={57}
                label="Segment Progress"
                status="running"
                showEta={false}
                authoritativeFloor={true}
            />
        )

        expect(readPercent()).toBe(66)

        act(() => {
            vi.advanceTimersByTime(1000)
        })

        expect(readPercent()).toBeGreaterThan(66)

        vi.useRealTimers()
    })

    it('does not restart lower when remounted during the same run anchor', () => {
        vi.useFakeTimers()
        vi.setSystemTime(10_000)

        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.3}
                startedAt={1}
                etaSeconds={57}
                persistenceKey="job-1"
                label="Proc"
                status="running"
                showEta={false}
            />
        )

        act(() => {
            vi.advanceTimersByTime(4000)
        })

        const beforeRemount = readPercent()
        expect(beforeRemount).toBeGreaterThanOrEqual(30)

        rerender(
            <PredictiveProgressBar
                progress={0.3}
                startedAt={1}
                etaSeconds={57}
                persistenceKey="job-1"
                label="Proc"
                status="running"
                showEta={false}
            />
        )

        expect(readPercent()).toBeGreaterThanOrEqual(beforeRemount)

        vi.useRealTimers()
    })

    it('renders with the remembered floor during the same run even before the next tick', () => {
        vi.useFakeTimers()
        vi.setSystemTime(10_000)

        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.3}
                startedAt={1}
                etaSeconds={57}
                persistenceKey="job-1"
                label="Proc"
                status="running"
                showEta={false}
            />
        )

        act(() => {
            vi.advanceTimersByTime(4000)
        })

        const remembered = readPercent()
        expect(remembered).toBeGreaterThanOrEqual(30)

        rerender(
            <PredictiveProgressBar
                progress={0.3}
                startedAt={1}
                etaSeconds={57}
                persistenceKey="job-1"
                label="Proc"
                status="running"
                showEta={false}
            />
        )

        expect(readPercent()).toBeGreaterThanOrEqual(remembered)

        vi.useRealTimers()
    })

    it('preserves the smoothed ETA during transient missing timing props in the same active run', () => {
        vi.useFakeTimers()
        vi.setSystemTime(10_000)

        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.3}
                startedAt={1}
                etaSeconds={57}
                persistenceKey="job-eta"
                label="Proc"
                status="running"
            />
        )

        act(() => {
            vi.advanceTimersByTime(4000)
        })

        const beforeDrop = screen.getByText(/ETA:/).textContent

        rerender(
            <PredictiveProgressBar
                progress={0.3}
                startedAt={undefined}
                etaSeconds={undefined}
                persistenceKey="job-eta"
                label="Proc"
                status="running"
            />
        )

        rerender(
            <PredictiveProgressBar
                progress={0.6}
                startedAt={1}
                etaSeconds={57}
                persistenceKey="job-eta"
                label="Proc"
                status="running"
            />
        )

        const afterRestore = screen.getByText(/ETA:/).textContent
        expect(afterRestore).toBe(beforeDrop)

        vi.useRealTimers()
    })

    it('caps the first predictive queue advance so it does not lurch forward', () => {
        vi.useFakeTimers()
        vi.setSystemTime(10_000)

        render(
            <PredictiveProgressBar
                progress={0.05}
                startedAt={7}
                etaSeconds={57}
                persistenceKey="job-queue"
                label="Processing..."
                status="running"
                showEta={false}
            />
        )

        expect(readPercent()).toBe(5)

        act(() => {
            vi.advanceTimersByTime(1250)
        })

        expect(readPercent()).toBeGreaterThanOrEqual(5)
        expect(readPercent()).toBeLessThanOrEqual(6)

        vi.useRealTimers()
    })
})
