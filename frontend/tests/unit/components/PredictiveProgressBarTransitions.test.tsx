import { render, screen, act } from '@testing-library/react'
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar'
import { describe, it, expect, vi } from 'vitest'
import { readPercent, advanceInTicks } from '@tests/helpers/PredictiveProgressBarTestHelpers'

describe('PredictiveProgressBar - Transitions', () => {
    it('animates exact-mode target updates without ETA prediction', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(91_000)
        const onDisplayProgress = vi.fn()
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0}
                label="Proc"
                status="running"
                showEta={false}
                transitionTickCount={4}
                tickMs={250}
                predictive={false}
                onDisplayProgress={onDisplayProgress}
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
                onDisplayProgress={onDisplayProgress}
            />
        )
        expect(readPercent()).toBe(0)
        advanceInTicks(500)
        const midValue = readPercent()
        expect(midValue).toBeGreaterThan(0)
        expect(midValue).toBeLessThan(33)
        expect(onDisplayProgress.mock.calls.some(([value]) => value > 0 && value < 0.33)).toBe(true)
        advanceInTicks(500)
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

    it('evidenceWeightFraction is deprecated no-op: bar migrates to full incoming progress', () => {
        // evidenceWeightFraction was removed per doc 15; trust is automatic.
        // The bar should still migrate toward the full target progress (not half).
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
                onDebugSnapshot={sn => captured = sn}
            />
        )
        // effectiveTargetProgress is now the full incoming progress (0.5), not 0.3
        expect(captured.effectiveTargetProgress).toBeCloseTo(0.5)

        act(() => { vi.advanceTimersByTime(4000) })
        expect(readPercent()).toBe(50)
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

    it('moves backward on ETA-backed lanes when allowBackwardProgress is true', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        let captured: any = null
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.6}
                startedAt={50}
                etaSeconds={200}
                status="running"
                allowBackwardProgress={true}
                transitionTickCount={8}
                backwardTransitionTickCount={2}
                tickMs={250}
                onDebugSnapshot={sn => captured = sn}
            />
        )

        expect(readPercent()).toBe(60)

        rerender(
            <PredictiveProgressBar
                progress={0.25}
                startedAt={50}
                etaSeconds={200}
                status="running"
                allowBackwardProgress={true}
                transitionTickCount={8}
                backwardTransitionTickCount={2}
                tickMs={250}
                onDebugSnapshot={sn => captured = sn}
            />
        )

        expect(captured.isBackwardMigration).toBe(true)
        expect(captured.activeTransitionTickCount).toBe(2)
        act(() => { vi.advanceTimersByTime(500) })
        expect(readPercent()).toBeLessThan(40)
        expect(readPercent()).toBe(25)
        vi.useRealTimers()
    })

    it('does not move backward on ETA-backed lanes when allowBackwardProgress is false', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        let captured: any = null
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.6}
                startedAt={50}
                etaSeconds={200}
                status="running"
                allowBackwardProgress={false}
                transitionTickCount={8}
                backwardTransitionTickCount={2}
                tickMs={250}
                onDebugSnapshot={sn => captured = sn}
            />
        )

        expect(readPercent()).toBe(60)

        rerender(
            <PredictiveProgressBar
                progress={0.25}
                startedAt={50}
                etaSeconds={200}
                status="running"
                allowBackwardProgress={false}
                transitionTickCount={8}
                backwardTransitionTickCount={2}
                tickMs={250}
                onDebugSnapshot={sn => captured = sn}
            />
        )

        // Advance timers by 500ms
        act(() => { vi.advanceTimersByTime(500) })
        
        // Without the fix, the lane migration causes progress to drop below 60%.
        expect(readPercent()).toBeGreaterThanOrEqual(60)
        vi.useRealTimers()
    })

    it('does not surface Finalizing before the backend status reaches finalizing', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)

        // The status pill was removed; phase is carried by the right-side busy text
        // (getBusyStatusText keys off presentationState, not the internal visualState),
        // so the premature-label invariant now lives on that surface.

        // 1. Preparing → "Working..." on the right; never "Finalizing...".
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.1}
                status="preparing"
                checkpointMode="queue"
                showLabel={true}
            />
        )
        expect(screen.getByText('Working...')).toBeTruthy()
        expect(screen.queryByText(/Finalizing/)).toBeNull()

        // 2. Running with ETA 0 triggers autoFinalizing INTERNALLY, but presentationState
        //    is still 'running' — so "Finalizing..." must NOT leak.
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
        expect(screen.queryByText(/Finalizing/)).toBeNull()

        // 3. Only when the backend status is actually finalizing does "Finalizing..." show.
        rerender(
            <PredictiveProgressBar
                progress={0.99}
                status="finalizing"
                checkpointMode="queue"
                showLabel={true}
            />
        )
        expect(screen.getByText('Finalizing...')).toBeTruthy()

        vi.useRealTimers()
    })
})
