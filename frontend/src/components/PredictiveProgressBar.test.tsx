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
        // calculatedRemaining should remain anchored and land around 1:30 here.
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

    it('keeps the launch ETA anchored when the initial snapshot starts mid-run', () => {
        vi.useFakeTimers()
        vi.setSystemTime(50_000)

        render(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={50}
                etaSeconds={120}
                label="Proc"
                status="running"
            />
        )

        expect(screen.getByText('50%')).toBeTruthy()
        expect(screen.getByText(/ETA: 2:00/i)).toBeTruthy()

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

        expect(Number.parseFloat(fill().style.width)).toBeLessThan(1)
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

    it('keeps grouped queue ETA consistent with the visible progress floor', () => {
        vi.useFakeTimers()
        vi.setSystemTime(60_000)

        render(
            <PredictiveProgressBar
                progress={0.75}
                startedAt={1}
                etaSeconds={63}
                label="Queue"
                status="running"
                authoritativeFloor={true}
            />
        )

        expect(screen.getByText('75%')).toBeTruthy()
        expect(screen.getByText(/ETA: 0:1[5-6]/i)).toBeTruthy()

        vi.useRealTimers()
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

    it('renders a blue finalizing presentation state override', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.42}
                label="Fin"
                status="running"
                state="finalizing"
                showEta={false}
            />
        )

        expect(screen.getByText('Finalizing...')).toBeTruthy()
        expect(screen.queryByText(/ETA:/)).toBeNull()
        const bar = container.querySelector('.progress-bar-finalizing') as HTMLElement
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
        expect(screen.queryByText('100%')).toBeNull()
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

    it('renders an error state for failed jobs without showing a percent', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.42}
                label="Failed"
                status="failed"
                showEta={false}
            />
        )

        expect(screen.getByText('Error')).toBeTruthy()
        expect(screen.queryByText('42%')).toBeNull()
        const bar = container.querySelector('div[style*="linear-gradient(90deg, rgba(239, 68, 68"]') as HTMLElement
        expect(bar).toBeTruthy()
    })

    it('renders cancelled jobs as an empty terminal state', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0.42}
                label="Cancelled"
                status="cancelled"
                showEta={false}
            />
        )

        expect(screen.getAllByText('Cancelled')).toHaveLength(3)
        expect(screen.queryByText('42%')).toBeNull()
        const bar = container.querySelector('div[style*="width: 0%"]') as HTMLElement
        expect(bar).toBeTruthy()
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

        expect(screen.getByText('0%')).toBeTruthy()
        expect(screen.getByText('Proc')).toBeTruthy()

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

        expect(screen.getByText('Working...')).toBeTruthy()
        expect(screen.getByText('Preparing')).toBeTruthy()

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

        expect(screen.getByText('0%')).toBeTruthy()

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

    it('holds the authoritative floor after a segment checkpoint instead of dropping below it', () => {
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

        expect(readPercent()).toBeGreaterThanOrEqual(66)

        act(() => {
            vi.advanceTimersByTime(2000)
        })

        expect(readPercent()).toBeGreaterThanOrEqual(66)

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
        const parseEtaSeconds = (value: string | null) => {
            const match = value?.match(/ETA:\s+(\d+):(\d+)/)
            if (!match) return null
            return (Number(match[1]) * 60) + Number(match[2])
        }

        expect(parseEtaSeconds(afterRestore)).not.toBeNull()
        expect(parseEtaSeconds(beforeDrop)).not.toBeNull()
        expect(parseEtaSeconds(beforeDrop)! - parseEtaSeconds(afterRestore)!).toBeLessThanOrEqual(3)

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

    it('retimes segment-scoped bars from live checkpoints instead of keeping the old pace', () => {
        vi.useFakeTimers()
        vi.setSystemTime(26_000)

        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.25}
                startedAt={1}
                etaSeconds={100}
                persistenceKey="segment-job"
                label="Segment Progress"
                status="running"
                showEta={false}
                authoritativeFloor={true}
                checkpointMode="segment"
            />
        )

        act(() => {
            vi.advanceTimersByTime(10_000)
        })

        rerender(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={1}
                etaSeconds={100}
                persistenceKey="segment-job"
                label="Segment Progress"
                status="running"
                showEta={false}
                authoritativeFloor={true}
                checkpointMode="segment"
            />
        )

        expect(readPercent()).toBe(50)

        act(() => {
            vi.advanceTimersByTime(5_000)
        })

        expect(readPercent()).toBeGreaterThanOrEqual(54)

        vi.useRealTimers()
    })

    it('can reach 100 percent when a live segment run is effectively at the end', () => {
        vi.useFakeTimers()
        vi.setSystemTime(99_800)

        render(
            <PredictiveProgressBar
                progress={0.98}
                startedAt={1}
                etaSeconds={100}
                persistenceKey="segment-finish"
                label="Segment Progress"
                status="running"
                showEta={false}
                authoritativeFloor={true}
                checkpointMode="segment"
            />
        )

        act(() => {
            vi.advanceTimersByTime(1_500)
        })

        expect(screen.getByText('Finalizing...')).toBeTruthy()
        expect(screen.queryByText(/\d+%/)).toBeNull()

        vi.useRealTimers()
    })
})
