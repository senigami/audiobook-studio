/**
 * Tests for the queue-bar determinate-fill-during-preparing fix.
 *
 * Owner requirement: as soon as the global queue bar (checkpointMode='queue') receives
 * a positive ETA, even while status='preparing', it must render a DETERMINATE predictive
 * fill — NOT the indeterminate pulse. The fill advances from near-0 at ETA-arrival
 * and continues smoothly into the 'running' phase with no jump.
 *
 * Guard: segment/non-queue bars must be unaffected.
 *
 * R1 revert-check: the key determinate test (1) MUST fail before the fix is applied and
 * pass after. Verify by removing the checkpointMode queue guard and confirming test 1 fails.
 */
import { render, screen, act } from '@testing-library/react'
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar'
import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// 1. Queue bar + preparing + positive ETA → DETERMINATE (R1 revert-check target)
// ---------------------------------------------------------------------------
describe('QueueBar determinate fill during preparing', () => {
    it('(R1) queue bar with status=preparing and positive eta_seconds renders DETERMINATE — not progress-bar-pending', () => {
        // R1 revert-check: before the fix, preparingIndeterminate is always true for
        // status='preparing', so the bar carries .progress-bar-pending (indeterminate pulse)
        // even when there is a positive ETA. After the fix, checkpointMode='queue' +
        // positive ETA makes preparingIndeterminate false → bar is determinate (no pending class).
        const now = 100_000
        vi.spyOn(Date, 'now').mockReturnValue(now)

        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                status="preparing"
                checkpointMode="queue"
                etaSeconds={55}
                etaBasis="remaining_from_update"
                updatedAt={now / 1000}
                showEta={true}
                allowBackwardProgress={false}
            />
        )

        // Must NOT be indeterminate pulse
        expect(container.querySelector('.progress-bar-pending')).toBeNull()
        // Must also not be an animated sweep (that's for running+indeterminate, not queue)
        expect(container.querySelector('.progress-bar-animated')).toBeNull()

        // ETA countdown must still be shown
        expect(screen.getByText(/ETA:/i)).toBeTruthy()

        vi.restoreAllMocks()
    })

    // ---------------------------------------------------------------------------
    // 2. Continuity / no-jump across preparing→running transition
    // ---------------------------------------------------------------------------
    it('progress is monotonic (no backward jump) across the preparing→running boundary when ETA end-time is consistent', () => {
        vi.useFakeTimers()
        const startEpochMs = 100_000
        vi.setSystemTime(startEpochMs)

        let snapshot: ReturnType<NonNullable<Parameters<typeof PredictiveProgressBar>[0]['onDebugSnapshot']>> extends void ? never : any = null

        const { rerender } = render(
            <PredictiveProgressBar
                progress={0}
                status="preparing"
                checkpointMode="queue"
                etaSeconds={55}
                etaBasis="remaining_from_update"
                updatedAt={startEpochMs / 1000}
                allowBackwardProgress={false}
                tickMs={250}
                onDebugSnapshot={(snap) => { snapshot = snap }}
            />
        )

        // Let the bar advance for ~10s of fake time (simulating the cold-load window)
        act(() => { vi.advanceTimersByTime(10_000) })
        expect(snapshot).not.toBeNull()
        const progressAtPreparing: number = snapshot.localProgress

        // Queue bar must be determinate and advancing (not locked at 0%)
        expect(progressAtPreparing).toBeGreaterThan(0)

        // Now flip to running with the same absolute end-time anchor
        // updatedAt advances by 10s, etaSeconds drops by 10s → same absolute endAtMs
        vi.setSystemTime(startEpochMs + 10_000)
        rerender(
            <PredictiveProgressBar
                progress={0}
                status="running"
                checkpointMode="queue"
                etaSeconds={45}
                etaBasis="remaining_from_update"
                updatedAt={(startEpochMs + 10_000) / 1000}
                allowBackwardProgress={false}
                tickMs={250}
                onDebugSnapshot={(snap) => { snapshot = snap }}
            />
        )

        // Immediately after the status flip (before any additional ticks), progress
        // must not jump backward from where it was during preparing.
        const progressJustAfterFlip: number = snapshot.localProgress
        // Allow a small delta (lane migration smoothing) but not a backward jump
        expect(progressJustAfterFlip).toBeGreaterThanOrEqual(progressAtPreparing - 0.03)

        // Let it run another 5s — progress should keep advancing
        act(() => { vi.advanceTimersByTime(5_000) })
        const progressAfterRunning: number = snapshot.localProgress
        expect(progressAfterRunning).toBeGreaterThanOrEqual(progressJustAfterFlip)

        vi.useRealTimers()
    })

    // ---------------------------------------------------------------------------
    // 3. Queue bar + preparing + NO ETA → still indeterminate pulse (unchanged)
    // ---------------------------------------------------------------------------
    it('queue bar with status=preparing and NO eta_seconds remains indeterminate (pulse unchanged)', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                status="preparing"
                checkpointMode="queue"
                etaSeconds={undefined}
                showEta={false}
                allowBackwardProgress={false}
            />
        )

        // Without an ETA, even a queue bar should show the indeterminate pulse
        expect(container.querySelector('.progress-bar-pending')).toBeTruthy()
        expect(screen.queryByText(/ETA:/i)).toBeNull()
    })

    // ---------------------------------------------------------------------------
    // 4. Segment/chapter bar (non-queue) during preparing → still indeterminate (guardrail)
    // ---------------------------------------------------------------------------
    it('segment bar (checkpointMode=segment) with status=preparing and positive ETA still renders indeterminate pulse (guardrail)', () => {
        const now = 100_000
        vi.spyOn(Date, 'now').mockReturnValue(now)

        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                status="preparing"
                checkpointMode="segment"
                etaSeconds={55}
                etaBasis="remaining_from_update"
                updatedAt={now / 1000}
                showEta={true}
                allowBackwardProgress={false}
            />
        )

        // Segment bar must still be indeterminate pulse during preparing
        expect(container.querySelector('.progress-bar-pending')).toBeTruthy()

        vi.restoreAllMocks()
    })

    it('default (non-queue) bar with status=preparing and positive ETA still renders indeterminate pulse (guardrail)', () => {
        const now = 100_000
        vi.spyOn(Date, 'now').mockReturnValue(now)

        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                status="preparing"
                checkpointMode="default"
                etaSeconds={55}
                etaBasis="remaining_from_update"
                updatedAt={now / 1000}
                showEta={true}
                allowBackwardProgress={false}
            />
        )

        // Default bar must still be indeterminate pulse during preparing
        expect(container.querySelector('.progress-bar-pending')).toBeTruthy()

        vi.restoreAllMocks()
    })

    // ---------------------------------------------------------------------------
    // 5. Queue bar fill advances in the predictive lane during preparing
    // ---------------------------------------------------------------------------
    it('queue bar fill advances > 0 after time elapses during preparing with positive ETA', () => {
        vi.useFakeTimers()
        const startEpochMs = 100_000
        vi.setSystemTime(startEpochMs)

        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                status="preparing"
                checkpointMode="queue"
                etaSeconds={55}
                etaBasis="remaining_from_update"
                updatedAt={startEpochMs / 1000}
                allowBackwardProgress={false}
                tickMs={250}
                showEta={false}
                showPercent={true}
            />
        )

        const fill = () => container.querySelector('[data-testid="progress-bar"] > div:last-child > div') as HTMLElement

        // At T0 fill is near 0
        expect(fill()).toBeTruthy()

        // Advance 10 seconds — should have ticked forward
        act(() => { vi.advanceTimersByTime(10_000) })

        // Fill must be > 0% (bar is advancing in the determinate lane)
        const widthStr = fill().style.width
        const widthPct = parseFloat(widthStr)
        expect(widthPct).toBeGreaterThan(0)

        vi.useRealTimers()
    })
})
