/**
 * RecordControls.test.tsx — task 008 (voice-card-consolidation, P7)
 *
 * Covers the INV-REC-4 accessibility contract this task owns: state-changing
 * accessible name, the "why we need this" explanation rendered before any
 * getUserMedia call, the permission-denied path, and the throttled + silence
 * -aware aria-live channel (asserted via the same fake-level mock the
 * useMicRecorder tests use, not a re-implementation of the analyser math).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordControls } from '@/pages/VoiceLab/components/record/RecordControls';
import { installMediaRecorderMocks, setMockLevel, makeToneBuffer } from '../../../../../helpers/mediaRecorderMocks';

function getLiveRegionText(container: HTMLElement) {
    return container.querySelector('[aria-live="polite"]')?.textContent ?? '';
}

describe('RecordControls', () => {
    beforeEach(() => {
        installMediaRecorderMocks();
    });

    it('renders the "why we need this" explanation before any getUserMedia call fires', () => {
        const getUserMediaSpy = vi.fn();
        // Reinstall with a spy-wrapped getUserMedia so we can assert it hasn't
        // been called yet at render time.
        installMediaRecorderMocks();
        const original = (navigator.mediaDevices as any).getUserMedia;
        (navigator.mediaDevices as any).getUserMedia = (...args: unknown[]) => {
            getUserMediaSpy(...args);
            return original(...args);
        };

        render(<RecordControls />);

        expect(screen.getByText(/needs microphone access/i)).toBeInTheDocument();
        expect(getUserMediaSpy).not.toHaveBeenCalled();
    });

    it('changes the record/stop button\'s ACCESSIBLE NAME with state, not just its visual label', async () => {
        const user = userEvent.setup();
        render(<RecordControls />);

        const startButton = screen.getByRole('button', { name: 'Start recording' });
        await user.click(startButton);

        expect(screen.getByRole('button', { name: 'Stop recording' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Start recording' })).not.toBeInTheDocument();
    });

    it('announces an explicit "Recording started" and "Recording stopped, N seconds captured"', async () => {
        const user = userEvent.setup();
        const { container } = render(<RecordControls />);

        await user.click(screen.getByRole('button', { name: 'Start recording' }));
        expect(getLiveRegionText(container)).toBe('Recording started');

        await user.click(screen.getByRole('button', { name: 'Stop recording' }));
        expect(getLiveRegionText(container)).toMatch(/^Recording stopped, \d+ seconds? captured$/);
    });

    it('returns focus to the record button on the record→stopped transition', async () => {
        const user = userEvent.setup();
        render(<RecordControls />);

        const startButton = screen.getByRole('button', { name: 'Start recording' });
        await user.click(startButton);
        const stopButton = screen.getByRole('button', { name: 'Stop recording' });
        stopButton.blur();

        await user.click(stopButton);

        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start recording' }));
    });

    it('shows a distinct, announced permission-denied state', async () => {
        installMediaRecorderMocks({ denyPermission: true });
        const user = userEvent.setup();
        const { container } = render(<RecordControls />);

        await user.click(screen.getByRole('button', { name: 'Start recording' }));

        expect(screen.getByRole('alert')).toHaveTextContent(/denied/i);
        expect(getLiveRegionText(container)).toMatch(/denied/i);
    });

    it('throttles periodic aria-live updates to no more than one per ~2-3s during continuous recording', async () => {
        vi.useFakeTimers();
        try {
            setMockLevel(0.5); // well above the silence threshold
            const { container } = render(<RecordControls />);

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(getLiveRegionText(container)).toBe('Recording started');

            // Advance enough real analyser ticks (meter interval is 100ms in
            // the hook) to fill the silence-detection rolling window, but
            // stay under the throttle window so no periodic update should
            // have landed yet beyond the initial "Recording started".
            act(() => {
                vi.advanceTimersByTime(1600);
            });
            expect(getLiveRegionText(container)).toBe('Recording started');

            // Cross the throttle window (2.5s) — exactly one new periodic
            // announcement should land, not a flood of updates.
            act(() => {
                vi.advanceTimersByTime(1500);
            });
            const afterFirstThrottle = getLiveRegionText(container);
            expect(afterFirstThrottle).toMatch(/Input level looks good/);

            // A further short advance (less than the throttle window) must
            // not push another update.
            act(() => {
                vi.advanceTimersByTime(500);
            });
            expect(getLiveRegionText(container)).toBe(afterFirstThrottle);
        } finally {
            vi.useRealTimers();
        }
    });

    it('fires a real "silence detected" announcement when the input is genuinely quiet', async () => {
        vi.useFakeTimers();
        try {
            setMockLevel(0); // silent input stream
            const { container } = render(<RecordControls />);

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
                await vi.advanceTimersByTimeAsync(0);
            });

            act(() => {
                vi.advanceTimersByTime(3000);
            });

            expect(getLiveRegionText(container)).toMatch(/Silence detected/i);
        } finally {
            vi.useRealTimers();
        }
    });

    // Task 009 (P8): captured-state UI — quality verdict gating, and the two
    // focus-management transitions this task owns (stopped→playback,
    // playback→keep/retake).
    describe('captured-state Keep/Retake (task 009)', () => {
        async function recordAndStop(user: ReturnType<typeof userEvent.setup>) {
            await user.click(screen.getByRole('button', { name: 'Start recording' }));
            await user.click(screen.getByRole('button', { name: 'Stop recording' }));
            await screen.findByText(/quality check passed/i);
        }

        it('disables Keep until the quality verdict resolves to ok, then calls onKeep with the blob', async () => {
            const user = userEvent.setup();
            const onKeep = vi.fn();
            render(<RecordControls onKeep={onKeep} />);

            await recordAndStop(user);

            const keepBtn = screen.getByRole('button', { name: 'Keep' });
            expect(keepBtn).not.toBeDisabled();

            await user.click(keepBtn);
            expect(onKeep).toHaveBeenCalledTimes(1);
            expect(onKeep.mock.calls[0][0]).toBeInstanceOf(Blob);
        });

        it('calls onRetake when Retake is clicked', async () => {
            const user = userEvent.setup();
            const onRetake = vi.fn();
            render(<RecordControls onRetake={onRetake} />);

            await recordAndStop(user);
            await user.click(screen.getByRole('button', { name: 'Retake' }));

            expect(onRetake).toHaveBeenCalledTimes(1);
            // Retake resets the recorder back to idle for the next capture.
            expect(screen.getByRole('button', { name: 'Start recording' })).toBeInTheDocument();
        });

        it('moves focus to the "Play back" control on the stopped→playback transition', async () => {
            const user = userEvent.setup();
            render(<RecordControls />);

            await recordAndStop(user);
            const playbackBtn = screen.getByRole('button', { name: 'Play back' });
            playbackBtn.blur();

            await user.click(playbackBtn);
            expect(document.activeElement).toBe(playbackBtn);
        });

        it('moves focus to the Keep button on the playback→keep/retake transition', async () => {
            const user = userEvent.setup();
            const { container } = render(<RecordControls />);

            await recordAndStop(user);
            await user.click(screen.getByRole('button', { name: 'Play back' }));

            const audioEl = container.querySelector('audio')!;
            act(() => {
                fireEvent.ended(audioEl);
            });

            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep' }));
        });

        // Owner-requested (2026-07-16): clipping must warn, not block --
        // Keep stays enabled and clickable even when the take clips.
        it('warns on a clipping take but keeps Keep enabled and clickable', async () => {
            const user = userEvent.setup();
            const onKeep = vi.fn();

            // Full-amplitude tone -> checkSampleQuality flags it as clipping.
            installMediaRecorderMocks({ decodedBuffer: makeToneBuffer(1.0) });

            render(<RecordControls onKeep={onKeep} />);

            await user.click(screen.getByRole('button', { name: 'Start recording' }));
            await user.click(screen.getByRole('button', { name: 'Stop recording' }));
            await screen.findByText(/clipping/i);

            const keepBtn = screen.getByRole('button', { name: 'Keep' });
            expect(keepBtn).not.toBeDisabled();

            await user.click(keepBtn);
            expect(onKeep).toHaveBeenCalledTimes(1);
        });
    });
});
