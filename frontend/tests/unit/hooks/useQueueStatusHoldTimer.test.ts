import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQueueStatusHoldTimer } from '@/hooks/useQueueStatusHoldTimer';

describe('useQueueStatusHoldTimer', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('immediately reflects rawQueueStatus when it is active', () => {
        const { result } = renderHook(() =>
            useQueueStatusHoldTimer({
                rawQueueStatus: 'Running',
                hasChapterAudio: false,
                audioStatus: undefined,
                recentlyFinishedDoneJob: false,
            })
        );
        expect(result.current.heldQueueStatus).toBe('Running');
    });

    it('holds last active status briefly after rawQueueStatus goes null', () => {
        const { result, rerender } = renderHook(
            ({ raw }: { raw: string | null }) =>
                useQueueStatusHoldTimer({
                    rawQueueStatus: raw,
                    hasChapterAudio: false,
                    audioStatus: undefined,
                    recentlyFinishedDoneJob: false,
                }),
            { initialProps: { raw: 'Running' as string | null } }
        );
        // Active → null transition
        act(() => { rerender({ raw: null }); });
        // Within the hold window (400ms), status should still be held
        expect(result.current.heldQueueStatus).toBe('Running');

        // After the hold window elapses, it releases
        act(() => { vi.advanceTimersByTime(500); });
        expect(result.current.heldQueueStatus).toBeNull();
    });

    it('immediately releases hold when chapter audio becomes available', () => {
        const { result, rerender } = renderHook(
            ({ raw, hasAudio }: { raw: string | null; hasAudio: boolean }) =>
                useQueueStatusHoldTimer({
                    rawQueueStatus: raw,
                    hasChapterAudio: hasAudio,
                    audioStatus: undefined,
                    recentlyFinishedDoneJob: false,
                }),
            { initialProps: { raw: 'Running' as string | null, hasAudio: false } }
        );
        // Transition: active → null with audio available
        act(() => { rerender({ raw: null, hasAudio: true }); });
        // hasChapterAudio=true means bridge should NOT fire
        expect(result.current.heldQueueStatus).toBeNull();
    });

    it('bridges to Finalizing when recentlyFinishedDoneJob is true during hold', () => {
        const { result, rerender } = renderHook(
            ({ raw, recentDone }: { raw: string | null; recentDone: boolean }) =>
                useQueueStatusHoldTimer({
                    rawQueueStatus: raw,
                    hasChapterAudio: false,
                    audioStatus: undefined,
                    recentlyFinishedDoneJob: recentDone,
                }),
            { initialProps: { raw: 'Running' as string | null, recentDone: false } }
        );
        // Set recentDone true and drop raw status simultaneously
        act(() => { rerender({ raw: null, recentDone: true }); });
        // Hold window active: should bridge to Finalizing
        expect(result.current.heldQueueStatus).toBe('Finalizing');

        act(() => { vi.advanceTimersByTime(500); });
        expect(result.current.heldQueueStatus).toBeNull();
    });
});
