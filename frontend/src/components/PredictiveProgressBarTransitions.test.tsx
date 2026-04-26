import { render, screen, act } from '@testing-library/react'
import { PredictiveProgressBar } from './PredictiveProgressBar'
import { describe, it, expect, vi } from 'vitest'
import { readPercent, advanceInTicks } from './PredictiveProgressBarTestHelpers'

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
})
