import React, { useState } from 'react'
import { render, screen, act } from '@testing-library/react'
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar'
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
        expect(fill().style.width).toBe('100%') // preparing fills full bar so barber-pole spans the track
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
        // evidenceWeightFraction prop was removed (doc 15); confidence is computed automatically.
        let captured: any = null
        render(
            <PredictiveProgressBar
                progress={0.5}
                status="running"
                transitionTickCount={12}
                backwardTransitionTickCount={2}
                tickMs={250}
                onDebugSnapshot={sn => captured = sn}
            />
        )
        expect(captured.transitionTickCount).toBe(12)
        expect(captured.backwardTransitionTickCount).toBe(2)
        expect(captured.tickMs).toBe(250)
        // New doc-15 confidence fields are present in the snapshot
        expect(captured.etaConfidenceW).toBeDefined()
        expect(captured.etaConfidenceBase).toBeDefined()
        expect(captured.etaConfidenceCv).toBeDefined()
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
        expect(fill().style.width).toBe('100%') // preparing fills full bar so barber-pole spans the track
        act(() => {
            rerender(
                <PredictiveProgressBar
                    progress={0}
                    status="running"
                    showEta={false}
                />
            )
        })
        expect(fill().style.width).toBe('0%') // after handoff to running at progress=0, jumps to 0
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

    it('smoothly animates finalizing status to 100 percent instead of resetting/stalling', () => {
        vi.useFakeTimers()
        const { container, rerender } = render(
            <PredictiveProgressBar
                progress={0.3}
                status="running"
                showEta={false}
                transitionTickCount={4}
                tickMs={250}
            />
        )
        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement

        // Transition to finalizing with progress 1
        rerender(
            <PredictiveProgressBar
                progress={1.0}
                status="finalizing"
                showEta={false}
                transitionTickCount={4}
                tickMs={250}
            />
        )

        // Before timing ticks, progress should be around 30% (from running state)
        expect(parseFloat(fill().style.width)).toBeLessThan(50)
        expect(parseFloat(fill().style.width)).toBeGreaterThan(20)

        // Advance timers to let it animate towards 100%
        act(() => { vi.advanceTimersByTime(500) })
        const progressMid = parseFloat(fill().style.width)
        expect(progressMid).toBeGreaterThan(30)
        expect(progressMid).toBeLessThan(100)

        // Complete the animation
        act(() => { vi.advanceTimersByTime(1000) })
        expect(parseFloat(fill().style.width)).toBe(100)

        vi.useRealTimers()
    })

    it('animates progress normally when startedAt is undefined and subsequent progress 0 updates are received', () => {
        vi.useFakeTimers()
        const initialTime = Date.now()
        const { container, rerender } = render(
            <PredictiveProgressBar
                progress={0}
                status="running"
                showEta={false}
                etaSeconds={10}
                etaBasis="remaining_from_update"
                updatedAt={initialTime / 1000}
                predictive={true}
                transitionTickCount={1}
                tickMs={250}
                allowBackwardProgress={false}
            />
        )
        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement
        expect(fill().style.width).toBe('0%')

        // Simulate a tick to let it animate. Since etaSeconds is 10, it should be > 0% after 1 second.
        act(() => { vi.advanceTimersByTime(1000) })
        expect(parseFloat(fill().style.width)).toBeGreaterThan(0)

        const widthAfterOneSec = parseFloat(fill().style.width)

        // Now simulate receiving another update from the server (e.g. log line or duplicate progress)
        // with progress=0, updatedAt=initialTime + 1000, but still no startedAt.
        // It should NOT reset the visual progress back to 0%.
        rerender(
            <PredictiveProgressBar
                progress={0}
                status="running"
                showEta={false}
                etaSeconds={10}
                etaBasis="remaining_from_update"
                updatedAt={(initialTime + 1000) / 1000}
                predictive={true}
                transitionTickCount={1}
                tickMs={250}
                allowBackwardProgress={false}
            />
        )

        // Visual progress must not reset to 0
        expect(parseFloat(fill().style.width)).toBeCloseTo(widthAfterOneSec, 1)

        // Ticking further should continue progress
        act(() => { vi.advanceTimersByTime(1000) })
        expect(parseFloat(fill().style.width)).toBeGreaterThan(widthAfterOneSec)

        vi.useRealTimers()
    })

    it('renders an exact-mode segment handoff to 0 percent immediately and reports 0 display progress', () => {
        vi.useFakeTimers()
        const onDisplayProgress = vi.fn()
        const { container, rerender } = render(
            <PredictiveProgressBar
                key="job-1:segment-a"
                progress={1}
                status="running"
                showEta={false}
                predictive={false}
                allowBackwardProgress={true}
                persistenceKey="job-1:segment-a"
                onDisplayProgress={onDisplayProgress}
            />
        )
        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement

        expect(parseFloat(fill().style.width)).toBe(100)
        expect(onDisplayProgress).toHaveBeenLastCalledWith(1)

        rerender(
            <PredictiveProgressBar
                key="job-1:segment-b"
                progress={0}
                status="running"
                showEta={false}
                predictive={false}
                allowBackwardProgress={true}
                persistenceKey="job-1:segment-b"
                onDisplayProgress={onDisplayProgress}
            />
        )

        expect(parseFloat(fill().style.width)).toBe(0)
        expect(onDisplayProgress).toHaveBeenLastCalledWith(0)

        vi.useRealTimers()
    })

    it('keeps segment-style 0 percent fixed when no ETA metadata is passed and time advances', () => {
        vi.useFakeTimers()
        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                status="running"
                showEta={false}
                predictive={false}
                transitionTickCount={1}
                tickMs={250}
            />
        )
        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement

        expect(parseFloat(fill().style.width)).toBe(0)
        act(() => { vi.advanceTimersByTime(1000) })
        expect(parseFloat(fill().style.width)).toBe(0)

        vi.useRealTimers()
    })

    it('does not trigger infinite loop and progresses normally when onDisplayProgress updates parent state and allowBackwardProgress is true', () => {
        let nowCount = 100000000
        const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
            nowCount += 10 // increment by 10ms on every call
            return nowCount
        })

        let callCount = 0
        const ParentWrapper = () => {
            const [liveProgress, setLiveProgress] = useState(0)
            return (
                <PredictiveProgressBar
                    progress={0.0}
                    status="running"
                    etaSeconds={100}
                    updatedAt={100000}
                    etaBasis="remaining_from_update"
                    allowBackwardProgress={true}
                    onDisplayProgress={(p) => { callCount += 1; setLiveProgress(p) }}
                    tickMs={250}
                />
            )
        }

        // Under this spy, rendering the wrapper should not crash with maximum update depth exceeded.
        // React throws synchronously on an update-depth loop, so a clean render here is itself
        // the regression guard; we also assert the render settled after a small, bounded number
        // of onDisplayProgress calls rather than looping unboundedly.
        render(<ParentWrapper />)
        expect(screen.getByTestId('progress-bar')).toBeInTheDocument()
        expect(callCount).toBeGreaterThan(0)
        expect(callCount).toBeLessThan(50)

        dateSpy.mockRestore()
    })

    // COR-F-5: previously progressMemory's floor for a bar was only evicted by the
    // terminal-status effect. A bar unmounted while still ACTIVE (non-terminal) left its
    // floor entry orphaned in the module-global map forever, where the 100-entry FIFO cap
    // could later evict OTHER, still-live bars' floors to make room for it.
    it('evicts its progressMemory floor on unmount so a later bar reusing the same key is not falsely floored', () => {
        vi.useFakeTimers()
        vi.setSystemTime(500_000)
        const memoryKey = 'job-unmount-evict-test'
        const startedAt = (Date.now() - 10_000) / 1000

        const { unmount, container } = render(
            <PredictiveProgressBar
                progress={0.6}
                startedAt={startedAt}
                persistenceKey={memoryKey}
                status="running"
                showEta={false}
                allowBackwardProgress={false}
            />
        )
        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement
        // Bar established a >=60% floor while active (non-terminal).
        expect(parseFloat(fill().style.width)).toBeGreaterThanOrEqual(60)

        // Unmount WHILE STILL ACTIVE — not via a terminal status transition.
        unmount()

        // A brand-new bar instance mounts with the SAME persistenceKey+startedAt (so the same
        // memoryKey) but at progress=0. If the unmounted bar's floor were still present,
        // allowBackwardProgress=false would clamp this fresh bar up to the stale ~60% floor.
        const { container: container2 } = render(
            <PredictiveProgressBar
                progress={0}
                startedAt={startedAt}
                persistenceKey={memoryKey}
                status="running"
                showEta={false}
                allowBackwardProgress={false}
            />
        )
        const fill2 = () => container2.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement
        expect(parseFloat(fill2().style.width)).toBe(0)

        vi.useRealTimers()
    })

    it('keeps the terminal-status eviction path working (no regression from the unmount cleanup addition)', () => {
        vi.useFakeTimers()
        vi.setSystemTime(500_000)
        const memoryKey = 'job-terminal-evict-still-works'
        const startedAt = (Date.now() - 10_000) / 1000

        const { rerender, unmount } = render(
            <PredictiveProgressBar
                progress={0.6}
                startedAt={startedAt}
                persistenceKey={memoryKey}
                status="running"
                showEta={false}
                allowBackwardProgress={false}
            />
        )
        // Reach a terminal status — the existing terminal-status effect evicts the floor.
        rerender(
            <PredictiveProgressBar
                progress={1.0}
                startedAt={startedAt}
                persistenceKey={memoryKey}
                status="done"
                showEta={false}
                allowBackwardProgress={false}
            />
        )
        unmount()

        const { container: container2 } = render(
            <PredictiveProgressBar
                progress={0}
                startedAt={startedAt}
                persistenceKey={memoryKey}
                status="running"
                showEta={false}
                allowBackwardProgress={false}
            />
        )
        const fill2 = () => container2.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement
        expect(parseFloat(fill2().style.width)).toBe(0)

        vi.useRealTimers()
    })

    it('does not perform a React state update from its unmount cleanup (smoke)', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { unmount } = render(
            <PredictiveProgressBar
                progress={0.3}
                status="running"
                persistenceKey="job-unmount-smoke-test"
            />
        )
        unmount()
        expect(consoleError).not.toHaveBeenCalled()
        consoleError.mockRestore()
    })
})
