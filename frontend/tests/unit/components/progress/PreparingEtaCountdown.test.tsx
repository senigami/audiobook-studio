/**
 * PreparingEtaCountdown.test.tsx
 *
 * TDD tests for the parallel-render ETA display model (spec §2.6 v1.8.0):
 *   - queued  + any eta   → NO countdown (unchanged)
 *   - preparing + eta > 0 → show countdown number, NOT just "Preparing…"
 *   - preparing + no eta  → indeterminate / "Preparing…", no number (unchanged)
 *   - running + indeterminate + eta > 0 → show countdown number (positive ETA wins,
 *     even during the model-load window)
 *   - running + indeterminate + NO eta → "Preparing…", no number (unchanged)
 *
 * R1 revert-check: T1, T4, QI-T1 MUST fail on pre-fix code and pass after.
 */

import { render } from '@testing-library/react';
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Fix Date.now() so resolveEndAtMs anchors deterministically.
const FIXED_NOW_MS = 1_000_000;
// ETA of 120 s means countdown ≈ 120 → formatted "2:00"
const ETA_SECONDS = 120;
// updatedAt = FIXED_NOW_MS / 1000 → remaining_from_update gives ~120s remaining
const UPDATED_AT_S = FIXED_NOW_MS / 1000;

describe('PredictiveProgressBar — preparing/running+indeterminate ETA countdown (parallel-render model)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_NOW_MS);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /**
     * T1: preparing + eta_seconds > 0 → countdown number shown, NOT just "Preparing…"
     * R1: MUST fail before fix (resolveEndAtMs returns null for preparing;
     *     busyStatusText wins over displayedRemaining).
     */
    it('T1: preparing with positive eta renders the countdown number, not just "Preparing…"', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                status="preparing"
                etaSeconds={ETA_SECONDS}
                etaBasis="remaining_from_update"
                updatedAt={UPDATED_AT_S}
                showEta={true}
                showPercent={true}
                label="Loading"
                allowBackwardProgress={false}
            />
        );
        const text = container.textContent ?? '';
        // Must show "ETA" with a formatted time token like "2:00"
        expect(/ETA/.test(text)).toBe(true);
        expect(/\d:\d\d/.test(text)).toBe(true);
    });

    /**
     * T2: preparing + NO eta → indeterminate / "Preparing…", no countdown (unchanged)
     * Should pass both before and after the fix.
     */
    it('T2: preparing with no eta renders indeterminate "Preparing…", no countdown', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                status="preparing"
                etaSeconds={undefined}
                showEta={true}
                label="Loading"
                allowBackwardProgress={false}
            />
        );
        const text = container.textContent ?? '';
        expect(/Preparing/.test(text)).toBe(true);
        expect(/ETA/.test(text)).toBe(false);
        expect(/\d:\d\d/.test(text)).toBe(false);
    });

    /**
     * T3: queued + eta → NO countdown (unchanged — queued never shows ETA)
     * Should pass both before and after the fix.
     */
    it('T3: queued with an eta renders "Queued" status, no countdown', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                status="queued"
                etaSeconds={ETA_SECONDS}
                etaBasis="remaining_from_update"
                updatedAt={UPDATED_AT_S}
                showEta={true}
                label="Job"
                allowBackwardProgress={false}
            />
        );
        const text = container.textContent ?? '';
        expect(/Queued/.test(text)).toBe(true);
        expect(/ETA/.test(text)).toBe(false);
        expect(/\d:\d\d/.test(text)).toBe(false);
    });

    /**
     * T4: running + indeterminate + eta > 0 → countdown number IS shown.
     * A real positive ETA wins over busyStatusText in ALL non-terminal states,
     * including the model-load window (spec §2.6 / I10 v1.8.0 amended).
     * R1: MUST fail on pre-fix gate (!busyStatusText || isPreparingStatus(...))
     * and pass after the fix (!busyStatusText || displayedRemaining > 0).
     */
    it('T4: running + indeterminate + positive eta shows the countdown number, not just "Preparing…"', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                status="running"
                indeterminate={true}
                etaSeconds={ETA_SECONDS}
                etaBasis="remaining_from_update"
                updatedAt={UPDATED_AT_S}
                showEta={true}
                showPercent={true}
                label="Loading model"
                allowBackwardProgress={false}
            />
        );
        const text = container.textContent ?? '';
        // Positive ETA wins: countdown must be present, busy label suppressed.
        expect(/ETA/.test(text)).toBe(true);
        expect(/\d:\d\d/.test(text)).toBe(true);
    });

    /**
     * T5: running + indeterminate + NO eta → "Preparing…", no countdown (unchanged)
     * Should pass both before and after.
     */
    it('T5: running + indeterminate + no eta renders "Preparing…", no countdown', () => {
        const { container } = render(
            <PredictiveProgressBar
                progress={0}
                status="running"
                indeterminate={true}
                etaSeconds={undefined}
                showEta={true}
                label="Loading model"
                allowBackwardProgress={false}
            />
        );
        const text = container.textContent ?? '';
        expect(/Preparing/.test(text)).toBe(true);
        expect(/ETA/.test(text)).toBe(false);
    });
});
