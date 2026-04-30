import { render, screen, act } from '@testing-library/react'
import { PredictiveProgressBar } from './PredictiveProgressBar'
import { describe, it, expect, vi } from 'vitest'

describe('PredictiveProgressBar - Lifecycle', () => {
    it('jumps the loader to zero when preparing hands off to running', () => {
        vi.useFakeTimers()
        const { container, rerender } = render(
            <PredictiveProgressBar
                progress={0}
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
                label="Proc"
                status="running"
                showEta={false}
                transitionTickCount={1}
                predictive={false}
            />
        )
        act(() => { vi.advanceTimersByTime(1000) })
        expect(screen.getByText('1%')).toBeTruthy()
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
                transitionTickCount={1}
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
                transitionTickCount={1}
                predictive={false}
            />
        )
        act(() => { vi.advanceTimersByTime(300) })
        expect(screen.getByText('5%')).toBeTruthy()
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

    it('performs an instant mode swap (no backward animation) on preparing -> running transition', () => {
        vi.useFakeTimers()
        const { container, rerender } = render(
            <PredictiveProgressBar 
                progress={0.5} 
                status="preparing" 
                showEta={false}
            />
        )
        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement
        expect(fill().style.width).toBe('100%')
        act(() => {
            rerender(
                <PredictiveProgressBar 
                    progress={0} 
                    status="running" 
                    showEta={false}
                />
            )
        })
        expect(fill().style.width).toBe('0%')
        vi.useRealTimers()
    })

    it('verifies real queue trace sequence: running 0/no ETA -> metadata -> grouped progress', () => {
        vi.useFakeTimers()
        const { container, rerender } = render(
            <PredictiveProgressBar 
                progress={0} 
                status="running" 
                showEta={true}
            />
        )
        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement
        expect(fill().style.width).toBe('0%')
        const nowMs = Date.now()
        rerender(
            <PredictiveProgressBar 
                progress={0} 
                status="running" 
                showEta={true}
                etaSeconds={60}
                updatedAt={nowMs / 1000}
                etaBasis="remaining_from_update"
            />
        )
        expect(fill().style.width).toBe('0%')
        act(() => { vi.advanceTimersByTime(1000) })
        expect(parseFloat(fill().style.width)).toBeGreaterThan(0)
        vi.useRealTimers()
    })
})
