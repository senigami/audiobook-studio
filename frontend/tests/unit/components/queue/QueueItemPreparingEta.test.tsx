/**
 * QueueItemPreparingEta.test.tsx
 *
 * TDD tests for QueueItem's preparing-ETA flow (parallel-render model).
 * The shouldRetainActiveParams gate previously blocked eta from reaching
 * PredictiveProgressBar when displayStatus === 'preparing'.
 *
 * R1 revert-check: QI-T1 MUST fail on pre-fix code and pass after.
 */

import { render } from '@testing-library/react';
import { QueueItem } from '@/components/queue/QueueItem';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';

// Mock PredictiveProgressBar so we can inspect the props it receives
vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
    PredictiveProgressBar: ({
        etaSeconds,
        status,
        dataTestId,
        onDisplayProgress,
        progress,
    }: any) => {
        React.useEffect(() => {
            onDisplayProgress?.(progress);
        }, [progress, onDisplayProgress]);
        return (
            <div
                data-testid={dataTestId ?? 'progress-bar'}
                data-etaseconds={etaSeconds}
                data-status={status}
            >
                {etaSeconds != null && etaSeconds > 0 ? `ETA:${etaSeconds}` : 'no-eta'}
            </div>
        );
    },
}));

const FIXED_NOW_MS = 1_000_000;
const UPDATED_AT_S = FIXED_NOW_MS / 1000;

const defaultProps = {
    job: {
        id: 'job-prep-1',
        status: 'preparing',
        chapter_title: 'Chapter 1',
        project_name: 'Project A',
        split_part: 0,
        started_at: undefined,
        updated_at: UPDATED_AT_S,
    } as any,
    localPaused: false,
    formatJobTitle: (j: any) => j.chapter_title,
    formatTime: () => '0:00',
    onRemove: vi.fn(),
};

describe('QueueItem — preparing status ETA flow (parallel-render model)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_NOW_MS);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /**
     * QI-T1: preparing + liveJob.eta_seconds > 0 → bar receives a positive etaSeconds
     * R1: MUST fail before fix (shouldRetainActiveParams is false for preparing
     *     → eta coerced to undefined before reaching the bar).
     */
    it('QI-T1: preparing job with positive liveJob eta_seconds passes eta to the progress bar', () => {
        const { container } = render(
            <QueueItem
                {...defaultProps}
                liveJob={{
                    id: 'job-prep-1',
                    status: 'preparing',
                    eta_seconds: 90,
                    eta_basis: 'remaining_from_update',
                    updated_at: UPDATED_AT_S,
                    eta_updated_at: UPDATED_AT_S,
                    started_at: undefined,
                } as any}
            />
        );
        const bar = container.querySelector('[data-testid="queue-item-progress-bar"]');
        expect(bar).toBeTruthy();
        const etaAttr = bar?.getAttribute('data-etaseconds');
        expect(Number(etaAttr)).toBeGreaterThan(0);
    });

    /**
     * QI-T2: preparing + NO eta → bar receives undefined/null eta (unchanged)
     * Should pass both before and after.
     */
    it('QI-T2: preparing job with no eta passes no eta to the bar', () => {
        const { container } = render(
            <QueueItem
                {...defaultProps}
                liveJob={{
                    id: 'job-prep-1',
                    status: 'preparing',
                    eta_seconds: null,
                    updated_at: UPDATED_AT_S,
                    started_at: undefined,
                } as any}
            />
        );
        const bar = container.querySelector('[data-testid="queue-item-progress-bar"]');
        const etaAttr = bar?.getAttribute('data-etaseconds');
        // null/empty/undefined/0 — no positive countdown
        expect(
            etaAttr === null || etaAttr === '' || etaAttr === 'undefined' || Number(etaAttr) <= 0
        ).toBe(true);
    });

    /**
     * QI-T3: queued + eta → NO eta passed to bar (unchanged)
     * Should pass both before and after.
     */
    it('QI-T3: queued job with eta does not pass eta to the bar', () => {
        const { container } = render(
            <QueueItem
                {...defaultProps}
                job={{
                    ...defaultProps.job,
                    status: 'queued',
                    eta_seconds: 60,
                    updated_at: UPDATED_AT_S,
                } as any}
            />
        );
        const bar = container.querySelector('[data-testid="queue-item-progress-bar"]');
        const etaAttr = bar?.getAttribute('data-etaseconds');
        expect(
            etaAttr === null || etaAttr === '' || etaAttr === 'undefined' || Number(etaAttr) <= 0
        ).toBe(true);
    });
});
