import { render, screen, act } from '@testing-library/react'
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar'
import { describe, it, expect, vi } from 'vitest'
import { readPercent, advanceInTicks } from '@tests/helpers/PredictiveProgressBarTestHelpers'

describe('PredictiveProgressBar - Transitions', () => {
    it('applies a backend correction smoothly', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(91_000)
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0}
                label="Proc"
                status="running"
                showEta={false}
                transitionTickCount={4}
                tickMs={250}
                predictive={false}
            />
        )
        expect(screen.getByText('0%')).toBeTruthy()
        rerender(
            <PredictiveProgressBar
                progress={0.33}
                label="Proc"
                status="running"
                showEta={false}
                transitionTickCount={4}
                tickMs={250}
                predictive={false}
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
                label="Proc"
                status="running"
                showEta={false}
                allowBackwardProgress={true}
                transitionTickCount={4}
                tickMs={250}
                predictive={false}
            />
        )
        expect(screen.getByText('60%')).toBeTruthy()
        rerender(
            <PredictiveProgressBar
                progress={0.25}
                label="Proc"
                status="running"
                showEta={false}
                allowBackwardProgress={true}
                transitionTickCount={4}
                tickMs={250}
                predictive={false}
            />
        )
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
        expect(captured.effectiveTargetProgress).toBeCloseTo(0.3)

        act(() => { vi.advanceTimersByTime(4000) })
        expect(readPercent()).toBe(30)
        vi.useRealTimers()
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
        expect(captured.migrationDurationMs).toBe(500)
        vi.useRealTimers()
    })

    it('does not label the job status as Rendering or Finalizing before the backend status reaches those states', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)

        // 1. When status is preparing, it shows Preparing, not Rendering or Finalizing
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.1}
                status="preparing"
                checkpointMode="queue"
                showLabel={true}
            />
        )
        expect(screen.getByText('Preparing')).toBeTruthy()
        expect(screen.queryByText('Rendering')).toBeNull()
        expect(screen.queryByText('Finalizing')).toBeNull()

        // 2. When status is running, it shows Rendering, not Finalizing, even if ETA is 0 (which triggers autoFinalizing internally)
        rerender(
            <PredictiveProgressBar
                progress={0.99}
                status="running"
                etaSeconds={0}
                updatedAt={100}
                checkpointMode="queue"
                showLabel={true}
            />
        )
        expect(screen.getByText('Rendering')).toBeTruthy()
        expect(screen.queryByText('Finalizing')).toBeNull()

        // 3. Only when status is actually finalizing, it shows Finalizing
        rerender(
            <PredictiveProgressBar
                progress={0.99}
                status="finalizing"
                checkpointMode="queue"
                showLabel={true}
            />
        )
        expect(screen.getByText('Finalizing')).toBeTruthy()
        expect(screen.queryByText('Rendering')).toBeNull()

        vi.useRealTimers()
    })
})
