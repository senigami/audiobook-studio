/**
 * useMicRecorder.test.tsx — task 008 (voice-card-consolidation, P7)
 *
 * jsdom has no real MediaRecorder/getUserMedia, so this file installs the
 * fakes from `tests/helpers/mediaRecorderMocks.ts` before each test.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMicRecorder } from '@/hooks/useMicRecorder';
import { installMediaRecorderMocks } from '../../helpers/mediaRecorderMocks';

describe('useMicRecorder', () => {
    beforeEach(() => {
        installMediaRecorderMocks();
    });

    it('starts idle', () => {
        const { result } = renderHook(() => useMicRecorder());
        expect(result.current.state).toBe('idle');
        expect(result.current.blob).toBeNull();
    });

    it('transitions idle -> requesting-permission -> recording on start()', async () => {
        const { result } = renderHook(() => useMicRecorder());

        let startPromise!: Promise<void>;
        act(() => {
            startPromise = result.current.start();
        });
        // getUserMedia is in flight synchronously-scheduled but async-resolved.
        await act(async () => {
            await startPromise;
        });

        expect(result.current.state).toBe('recording');
    });

    it('transitions recording -> captured with a non-empty Blob on stop()', async () => {
        const { result } = renderHook(() => useMicRecorder());

        await act(async () => {
            await result.current.start();
        });
        expect(result.current.state).toBe('recording');

        act(() => {
            result.current.stop();
        });

        await waitFor(() => expect(result.current.state).toBe('captured'));
        expect(result.current.blob).not.toBeNull();
        expect(result.current.blob!.size).toBeGreaterThan(0);
    });

    it('sets permission-denied when getUserMedia rejects', async () => {
        installMediaRecorderMocks({ denyPermission: true });
        const { result } = renderHook(() => useMicRecorder());

        await act(async () => {
            await result.current.start();
        });

        expect(result.current.state).toBe('permission-denied');
        expect(result.current.blob).toBeNull();
    });

    it('reset() discards the captured blob and returns to idle', async () => {
        const { result } = renderHook(() => useMicRecorder());

        await act(async () => {
            await result.current.start();
        });
        act(() => {
            result.current.stop();
        });
        await waitFor(() => expect(result.current.state).toBe('captured'));

        act(() => {
            result.current.reset();
        });

        expect(result.current.state).toBe('idle');
        expect(result.current.blob).toBeNull();
    });

    it('reports a real, non-fabricated level reading from the analyser while recording', async () => {
        vi.useFakeTimers();
        try {
            const { result } = renderHook(() => useMicRecorder());
            await act(async () => {
                await result.current.start();
            });

            act(() => {
                vi.advanceTimersByTime(300);
            });

            // With currentLevel default of 0.5 (well above silence), the dB
            // reading should be above the -60 floor.
            expect(result.current.levelDb).toBeGreaterThan(-60);
        } finally {
            vi.useRealTimers();
        }
    });
});
