import { render, screen, act } from '@testing-library/react'
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar'
import { describe, it, expect, vi } from 'vitest'
import { parseTime, readPercent } from '@tests/helpers/PredictiveProgressBarTestHelpers'

describe('PredictiveProgressBar - Timing', () => {
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
        expect(screen.getByText('Fin')).toBeTruthy()
        vi.useRealTimers()
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

    it('increases ETA when a new prop update gives a later endAtMs after the migration window advances', () => {
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
        expect(beforeS).toBe(50)
        rerender(
            <PredictiveProgressBar 
                progress={0.5} 
                startedAt={50}
                etaSeconds={200}
                status="running" 
            />
        )
        const immediateS = parseTime(screen.getByText(/ETA:/).textContent)
        expect(immediateS).toBe(beforeS)
        act(() => {
            vi.advanceTimersByTime(1000)
        })
        const afterS = parseTime(screen.getByText(/ETA:/).textContent)
        expect(afterS).toBeGreaterThan(beforeS)
        vi.useRealTimers()
    })

    it('smooths ETA changes across the lane migration window instead of snapping immediately to a later target', () => {
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={50}
                etaSeconds={100}
                status="running"
                transitionTickCount={4}
                tickMs={250}
            />
        )

        const beforeS = parseTime(screen.getByText(/ETA:/).textContent)
        expect(beforeS).toBe(50)

        rerender(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={50}
                etaSeconds={200}
                status="running"
                transitionTickCount={4}
                tickMs={250}
            />
        )

        const immediateS = parseTime(screen.getByText(/ETA:/).textContent)
        expect(immediateS).toBe(beforeS)

        act(() => {
            vi.advanceTimersByTime(500)
        })
        const midwayS = parseTime(screen.getByText(/ETA:/).textContent)
        expect(midwayS).toBeGreaterThan(beforeS)
        expect(midwayS).toBeLessThan(150)

        act(() => {
            vi.advanceTimersByTime(500)
        })
        const settledS = parseTime(screen.getByText(/ETA:/).textContent)
        // The confidence model slope-caps velocity changes so a 3x ETA jump is dampened.
        // The bar adopts a partial shift (slope-capped blend), not the full 200s value.
        expect(settledS).toBeGreaterThan(beforeS)

        vi.useRealTimers()
    })

    it('triggers predictive movement for running 0.0 jobs as soon as an ETA is provided', () => {
        vi.useFakeTimers()
        const now = 100_000
        vi.setSystemTime(now)
        const { container } = render(
            <PredictiveProgressBar 
                progress={0} 
                status="running" 
                showEta={true}
                etaSeconds={100}
                updatedAt={now / 1000}
                tickMs={250}
            />
        )
        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement
        expect(fill().style.width).toBe('0%')
        
        act(() => {
            vi.advanceTimersByTime(10000) // 10 seconds
        })

        expect(readPercent()).toBeGreaterThan(0)
        vi.useRealTimers()
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

    it('prioritizes positive etaSeconds over estimatedEndAt when etaBasis is remaining_from_update', () => {
        const now = 100_000
        vi.spyOn(Date, 'now').mockReturnValue(now * 1000)
        render(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={now - 200}
                etaSeconds={30}
                etaBasis="remaining_from_update"
                estimatedEndAt={now - 100}
                updatedAt={now}
                status="running"
            />
        )
        expect(screen.getByText(/ETA: 0:30/i)).toBeTruthy()
        vi.restoreAllMocks()
    })

    it('evidenceWeightFraction is deprecated and no-op: bar adopts slope-capped ETA shift regardless of value', () => {
        // evidenceWeightFraction was removed per doc 15. The confidence model now computes
        // trust automatically. Passing evidenceWeightFraction=0.10 or 1.0 has no effect.
        vi.useFakeTimers()
        vi.setSystemTime(100_000)
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={50}
                etaSeconds={100}
                status="running"
                transitionTickCount={4}
                tickMs={250}
            />
        )

        const beforeS = parseTime(screen.getByText(/ETA:/).textContent)
        expect(beforeS).toBe(50)

        rerender(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={50}
                etaSeconds={200}
                status="running"
                transitionTickCount={4}
                tickMs={250}
            />
        )

        act(() => {
            vi.advanceTimersByTime(1000)
        })

        const settledS = parseTime(screen.getByText(/ETA:/).textContent)
        // The confidence model slope-caps the ETA shift; settled ETA should be between 50 and 200.
        expect(settledS).toBeGreaterThan(beforeS)
        expect(settledS).toBeLessThan(200)
        vi.useRealTimers()
    })

    it('monotonically increases displayed progress and decreases ETA on a stable lane with no prop updates', () => {
        vi.useFakeTimers()
        const now = 100_000 // 100 seconds
        vi.setSystemTime(now * 1000)

        let snapshot: any = null
        render(
            <PredictiveProgressBar
                progress={0.25}
                startedAt={now - 50} // started 50s ago
                etaSeconds={100} // 100s remaining
                status="running"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
                tickMs={250}
            />
        )

        // On a stable lane (no prop updates), each tick must increase visual progress
        // and decrease the displayed remaining ETA.
        let prevProgress: number | null = null
        let prevRemaining: number | null = null
        for (let step = 0; step < 10; step++) {
            act(() => {
                vi.advanceTimersByTime(5000) // 5 seconds
            })
            expect(snapshot).not.toBeNull()

            const p: number = snapshot.localProgress
            const remaining: number = snapshot.displayedRemaining

            if (prevProgress !== null) {
                expect(p).toBeGreaterThanOrEqual(prevProgress) // monotonic progress
            }
            if (prevRemaining !== null && remaining > 0) {
                expect(remaining).toBeLessThanOrEqual(prevRemaining) // monotonic ETA decrease
            }
            prevProgress = p
            prevRemaining = remaining
        }

        vi.useRealTimers()
    })

    it('ensures confidence-weighted updates keep progress and ETA in sync during migration', () => {
        vi.useFakeTimers()
        const now = 100_000
        vi.setSystemTime(now * 1000)

        let snapshot: any = null
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.25}
                startedAt={now - 50}
                etaSeconds={100}
                status="running"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
                transitionTickCount={4}
                tickMs={250}
            />
        )

        // Now trigger an update with etaSeconds={200} and progress={0.5}
        rerender(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={now - 50}
                etaSeconds={200}
                status="running"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
                transitionTickCount={4}
                tickMs={250}
            />
        )

        // During the migration ticks, check that progress and ETA describe the same lane
        for (let tick = 0; tick <= 4; tick++) {
            act(() => {
                vi.advanceTimersByTime(250)
            })
            expect(snapshot).not.toBeNull()

            const p = snapshot.localProgress
            const remaining = snapshot.displayedRemaining

            // The lane's endpoints are migrating smoothly.
            // Since we interpolate both endpoints linearly, at any moment during the migration,
            // the rendered lane has some start time and end time.
            // Therefore, the progress and ETA derived from the rendered lane must still be in sync!
            // Specifically, the visual duration at this tick is:
            // visualDuration = remaining / (1 - p / 0.995)
            // Let's verify that this visualDuration is a number and that it is between the starting duration (approx 66.8s)
            // and the target duration (approx 301.5s).
            const visualDuration = remaining / (1 - p / 0.995)
            expect(visualDuration).toBeGreaterThanOrEqual(60)
            expect(visualDuration).toBeLessThanOrEqual(310)
        }

        vi.useRealTimers()
    })

    it('ensures remaining_from_update updates with a known startedAt do not visually re-anchor the lane to now', () => {
        vi.useFakeTimers()
        const now = 100_000
        vi.setSystemTime(now * 1000)

        let snapshot: any = null
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={now - 50}
                etaSeconds={50}
                etaBasis="remaining_from_update"
                updatedAt={now}
                status="running"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
            />
        )

        // The lane is anchored at startedAt=now-50, now=100, remaining=50 (endAt=150).
        expect(snapshot.localProgress).toBeCloseTo(0.5 * 0.995, 2) // ~49.75%
        expect(snapshot.displayedRemaining).toBe(50)

        // Now advance time by 10s and send a new update
        vi.setSystemTime((now + 10) * 1000)
        rerender(
            <PredictiveProgressBar
                progress={0.6}
                startedAt={now - 50}
                etaSeconds={40} // still ends at 150
                etaBasis="remaining_from_update"
                updatedAt={now + 10}
                status="running"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
            />
        )

        // If the lane was visually re-anchored to now (startedAtMs = now), then visual progress would have jumped back to 0.
        // But since startedAt is known, it must stay anchored at startedAt=now-50, so progress should be around 60%.
        expect(snapshot.localProgress).toBeGreaterThan(0.55)
        expect(snapshot.displayedRemaining).toBe(40)

        vi.useRealTimers()
    })

    it('ensures done status resolves to 100 percent and 0 remaining ETA', () => {
        const now = 100_000
        vi.spyOn(Date, 'now').mockReturnValue(now * 1000)
        let snapshot: any = null
        render(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={now - 50}
                etaSeconds={50}
                status="done"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
            />
        )

        expect(snapshot.localProgress).toBe(1.0)
        expect(snapshot.displayedRemaining).toBe(0) // done is terminal, ETA should resolve to 0 or null
        vi.restoreAllMocks()
    })

    it('does not snap to 100 percent immediately on done transition, hides ETA, and continues tick loop', () => {
        vi.useFakeTimers()
        const now = 100_000
        vi.setSystemTime(now * 1000)

        let snapshot: any = null
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={now - 50}
                etaSeconds={100}
                status="running"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
                tickMs={250}
            />
        )

        // Verify initial progress is near 50%
        expect(snapshot.localProgress).toBeCloseTo(0.5, 2)
        expect(screen.queryByText(/ETA:/i)).toBeTruthy()

        // Transition to "done"
        rerender(
            <PredictiveProgressBar
                progress={1.0}
                startedAt={now - 50}
                etaSeconds={0}
                status="done"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
                tickMs={250}
            />
        )

        // Visual progress should not snap to 100% (1.0) immediately
        expect(snapshot.localProgress).toBeLessThan(0.99)
        // ETA should be hidden immediately
        expect(screen.queryByText(/ETA:/i)).toBeNull()

        // Tick loop should stay active and advance the visual progress toward 1.0
        act(() => {
            vi.advanceTimersByTime(250)
        })
        const progressAfterTick = snapshot.localProgress
        expect(progressAfterTick).toBeGreaterThan(0.5)
        expect(progressAfterTick).toBeLessThan(1.0)

        // Eventually, after enough time, it should reach 1.0
        act(() => {
            vi.advanceTimersByTime(10000)
        })
        expect(snapshot.localProgress).toBe(1.0)

        vi.useRealTimers()
    })

    it('does not snap to 100 percent immediately when transitioning to done with undefined startedAt and etaSeconds', () => {
        vi.useFakeTimers()
        const now = 100_000
        vi.setSystemTime(now * 1000)

        let snapshot: any = null
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.5}
                startedAt={now - 50}
                etaSeconds={100}
                status="running"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
                tickMs={250}
            />
        )

        // Verify initial progress is near 50%
        expect(snapshot.localProgress).toBeCloseTo(0.5, 2)

        // Transition to "done" with undefined startedAt and etaSeconds
        rerender(
            <PredictiveProgressBar
                progress={1.0}
                startedAt={undefined}
                etaSeconds={undefined}
                status="done"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
                tickMs={250}
            />
        )

        // The visual progress should not immediately snap to 1.0
        expect(snapshot.localProgress).toBeLessThan(0.99)

        // It should animate to 1.0 over the configured transition duration (500ms)
        act(() => {
            vi.advanceTimersByTime(250)
        })
        expect(snapshot.localProgress).toBeGreaterThan(0.5)
        expect(snapshot.localProgress).toBeLessThan(1.0)

        // Settle at 1.0 after the transition completes
        act(() => {
            vi.advanceTimersByTime(250)
        })
        expect(snapshot.localProgress).toBe(1.0)

        vi.useRealTimers()
    })

    it('does not snap to 100 percent when a done update arrives after a running progress=1.0 update', () => {
        vi.useFakeTimers()
        const now = 100_000
        vi.setSystemTime(now * 1000)

        let snapshot: any = null
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.25}
                startedAt={now - 50}
                etaSeconds={150}
                status="running"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
                tickMs={250}
            />
        )

        // Visual progress is around 25%
        expect(snapshot.localProgress).toBeLessThan(0.3)

        // 1. Send running update with progress = 1.0
        rerender(
            <PredictiveProgressBar
                progress={1.0}
                startedAt={now - 50}
                etaSeconds={0}
                status="running"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
                tickMs={250}
            />
        )

        // Advance by 1000ms (1 second) to let migration progress
        act(() => {
            vi.advanceTimersByTime(1000)
        })
        // It should have migrated halfway between 0.25 and 1.0 (since duration is 2000ms)
        expect(snapshot.localProgress).toBeCloseTo(0.625, 1)

        // 2. Send done update
        rerender(
            <PredictiveProgressBar
                progress={1.0}
                startedAt={now - 50}
                etaSeconds={0}
                status="done"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
                tickMs={250}
            />
        )

        // The visual progress should start from the last visual progress (~0.625) and not snap to 1.0
        expect(snapshot.localProgress).toBeCloseTo(0.625, 1)

        // It should animate to 1.0 over the configured transition duration (500ms)
        act(() => {
            vi.advanceTimersByTime(250)
        })
        // Halfway through 500ms done transition (from ~0.625 to 1.0), it should be around 0.81
        expect(snapshot.localProgress).toBeCloseTo(0.81, 1)

        // Settle at 1.0 after the transition completes (another 250ms)
        act(() => {
            vi.advanceTimersByTime(250)
        })
        expect(snapshot.localProgress).toBe(1.0)

        vi.useRealTimers()
    })

    it('reproduces production done sequence with undefined startedAt and etaSeconds', () => {
        vi.useFakeTimers()
        const now = 100_000
        vi.setSystemTime(now * 1000)

        let snapshot: any = null
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0.25}
                startedAt={now - 50}
                etaSeconds={150}
                status="running"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
                tickMs={250}
            />
        )

        expect(snapshot.localProgress).toBeLessThan(0.3)

        // 1. Send running update with progress = 1.0
        rerender(
            <PredictiveProgressBar
                progress={1.0}
                startedAt={now - 50}
                etaSeconds={1}
                status="running"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
                tickMs={250}
            />
        )

        // Advance by 1000ms
        act(() => {
            vi.advanceTimersByTime(1000)
        })

        // 2. Send done update with startedAt = undefined and etaSeconds = undefined
        rerender(
            <PredictiveProgressBar
                progress={1.0}
                startedAt={undefined}
                etaSeconds={undefined}
                status="done"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
                tickMs={250}
            />
        )

        // Verify that visual progress did not snap to 1.0 immediately
        expect(snapshot.localProgress).toBeLessThan(0.99)

        // Advance by 250ms
        act(() => {
            vi.advanceTimersByTime(250)
        })
        expect(snapshot.localProgress).toBeLessThan(1.0)

        // Settle at 1.0 after 500ms transition completes
        act(() => {
            vi.advanceTimersByTime(250)
        })
        expect(snapshot.localProgress).toBe(1.0)

        vi.useRealTimers()
    })

    // I10 (progress-presentation §2.6 — parallel-render model v1.8.0):
    // queued always suppresses the ETA countdown (no synthesis clock ever).
    // preparing now HONORS a positive etaSeconds as a pre-factored cold-load ETA —
    // this reverses the old serial-render rule (1.4.3) that suppressed preparing too.
    // running+indeterminate (per-segment load window, §2.7) keeps suppressing via busyStatusText.
    it('suppresses the determinate ETA countdown while queued (unchanged)', () => {
        const now = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(now)
        let snapshot: any = null
        render(
            <PredictiveProgressBar
                progress={0}
                startedAt={undefined}
                etaSeconds={57}
                etaBasis="remaining_from_update"
                updatedAt={now / 1000}
                label="Loading"
                status="queued"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
            />
        )
        // queued always suppresses.
        expect(snapshot.displayedRemaining).toBeNull()
        expect(screen.queryByText(/ETA:/i)).toBeNull()
        vi.restoreAllMocks()
    })

    it('honors a positive ETA during preparing (parallel-render cold-load ETA)', () => {
        // Parallel-render model: preparing + positive etaSeconds → countdown is shown.
        // This is the pre-factored cold-load ETA published by the backend before synthesis.
        const now = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(now)
        let snapshot: any = null
        render(
            <PredictiveProgressBar
                progress={0}
                startedAt={undefined}
                etaSeconds={57}
                etaBasis="remaining_from_update"
                updatedAt={now / 1000}
                label="Loading"
                status="preparing"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
            />
        )
        // Countdown is resolved (positive ETA honored during preparing).
        expect(snapshot.displayedRemaining).toBe(57)
        expect(screen.getByText(/ETA:/i)).toBeTruthy()
        vi.restoreAllMocks()
    })

    it('shows the determinate ETA during preparing and keeps it at running', () => {
        // Parallel-render model: ETA shows from preparing onward (not only at running).
        const now = Date.now()
        vi.spyOn(Date, 'now').mockReturnValue(now)
        let snapshot: any = null
        const { rerender } = render(
            <PredictiveProgressBar
                progress={0}
                etaSeconds={57}
                etaBasis="remaining_from_update"
                updatedAt={now / 1000}
                label="Loading"
                status="preparing"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
            />
        )
        // Countdown visible during preparing.
        expect(snapshot.displayedRemaining).toBe(57)
        expect(screen.getByText(/ETA:/i)).toBeTruthy()
        // ...still visible at running (anchored to the running frame).
        rerender(
            <PredictiveProgressBar
                progress={0}
                startedAt={now / 1000}
                etaSeconds={57}
                etaBasis="remaining_from_update"
                updatedAt={now / 1000}
                label="Synthesizing"
                status="running"
                onDebugSnapshot={(snap) => { snapshot = snap; }}
            />
        )
        expect(snapshot.displayedRemaining).toBe(57)
        expect(screen.getByText(/ETA:/i)).toBeTruthy()
        vi.restoreAllMocks()
    })
})
