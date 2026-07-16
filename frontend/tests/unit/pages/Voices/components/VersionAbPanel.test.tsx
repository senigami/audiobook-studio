/**
 * VersionAbPanel.test.tsx — Task 008
 * Tests: test-passage input, "Run comparison" wiring, per-side cached/job
 * handling, and playerBus-driven playback (single-slot bus takeover).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the playerBus boundary (audio owner) — same shape as VoiceCatalogCard.test.tsx.
vi.mock('@/store/playerBus', () => ({
    usePlayerBus: vi.fn(() => ({ scope: null, audioUrl: null, playing: false })),
    loadAndPlay: vi.fn(),
    pause: vi.fn(),
}));

const mockApi = vi.hoisted(() => ({
    runVersionAbTest: vi.fn(),
    getProcessingQueue: vi.fn(),
}));
vi.mock('@/api', () => ({ api: mockApi }));

import { usePlayerBus, loadAndPlay, pause as pauseBusMock } from '@/store/playerBus';
import { VersionAbPanel } from '@/pages/Voices/components/VersionAbPanel';
import type { VoiceVersion } from '@/hooks/useVariantVersions';

const versionA: VoiceVersion = {
    id: 'v1',
    created_at: 1699000000,
    backfilled: true,
    engine_id: 'xtts',
    model: 'xtts-v2',
    test_text: 'Hello world',
    sample_count: 2,
    has_artifact: true,
    is_active: false,
    artifact_url: '/artifact/v1.wav',
};

const versionB: VoiceVersion = {
    id: 'v2',
    created_at: 1700000000,
    backfilled: false,
    engine_id: 'xtts',
    model: 'xtts-v2',
    test_text: 'Hello world',
    sample_count: 3,
    has_artifact: true,
    is_active: true,
    artifact_url: '/artifact/v2.wav',
};

describe('VersionAbPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (usePlayerBus as ReturnType<typeof vi.fn>).mockReturnValue({ scope: null, audioUrl: null, playing: false });
    });

    it('defaults the test passage input to versionA.test_text', () => {
        render(<VersionAbPanel voiceName="Aria Nova" versionA={versionA} versionB={versionB} />);
        expect(screen.getByDisplayValue('Hello world')).toBeInTheDocument();
    });

    it('both sides cached: enables both play buttons immediately, each calling loadAndPlay with the correct audio_url and distinct title/subtitle', async () => {
        mockApi.runVersionAbTest.mockResolvedValue({
            status: 'ok',
            results: {
                a: { mode: 'cached', audio_url: '/artifact/v1.wav' },
                b: { mode: 'cached', audio_url: '/artifact/v2.wav' },
            },
        });

        render(<VersionAbPanel voiceName="Aria Nova" versionA={versionA} versionB={versionB} />);
        fireEvent.click(screen.getByRole('button', { name: /run comparison/i }));

        await waitFor(() => {
            expect(mockApi.runVersionAbTest).toHaveBeenCalledWith('Aria Nova', 'v1', 'v2', 'Hello world');
        });

        const playButtons = await screen.findAllByRole('button', { name: /play/i });
        expect(playButtons).toHaveLength(2);
        expect(playButtons[0]).not.toBeDisabled();
        expect(playButtons[1]).not.toBeDisabled();

        fireEvent.click(playButtons[0]);
        expect(loadAndPlay).toHaveBeenCalledWith(expect.objectContaining({ audioUrl: '/artifact/v1.wav' }));

        fireEvent.click(playButtons[1]);
        expect(loadAndPlay).toHaveBeenCalledWith(expect.objectContaining({ audioUrl: '/artifact/v2.wav' }));

        const [callA, callB] = (loadAndPlay as ReturnType<typeof vi.fn>).mock.calls;
        expect(callA[0].title).not.toEqual(callB[0].title);
    });

    it('one side job / other cached: job side is disabled with a rendering indicator, cached side is immediately playable', async () => {
        mockApi.runVersionAbTest.mockResolvedValue({
            status: 'ok',
            results: {
                a: { mode: 'cached', audio_url: '/artifact/v1.wav' },
                b: { mode: 'job', job_id: 'job-123' },
            },
        });

        render(<VersionAbPanel voiceName="Aria Nova" versionA={versionA} versionB={versionB} />);
        fireEvent.click(screen.getByRole('button', { name: /run comparison/i }));

        await waitFor(() => {
            expect(mockApi.runVersionAbTest).toHaveBeenCalled();
        });

        expect(await screen.findByText(/rendering/i)).toBeInTheDocument();

        const cachedPlayButton = screen.getByRole('button', { name: /^play$/i });
        expect(cachedPlayButton).not.toBeDisabled();

        const renderingButton = screen.getByText(/rendering/i).closest('button');
        expect(renderingButton).toBeDisabled();
    });

    it('job side resolves to playable audio once the polled queue job reaches status "done"', async () => {
        vi.useFakeTimers();
        try {
            mockApi.runVersionAbTest.mockResolvedValue({
                status: 'ok',
                results: {
                    a: { mode: 'cached', audio_url: '/artifact/v1.wav' },
                    b: { mode: 'job', job_id: 'abtest-deadbeef' },
                },
            });
            mockApi.getProcessingQueue
                .mockResolvedValueOnce([{ id: 'abtest-deadbeef', status: 'running' }])
                .mockResolvedValueOnce([{ id: 'abtest-deadbeef', status: 'done' }]);

            render(<VersionAbPanel voiceName="Aria Nova" versionA={versionA} versionB={versionB} />);
            await vi.waitFor(() => {
                fireEvent.click(screen.getByRole('button', { name: /run comparison/i }));
                expect(mockApi.runVersionAbTest).toHaveBeenCalled();
            });

            // First poll tick: still running.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(2000);
            });
            expect(mockApi.getProcessingQueue).toHaveBeenCalledTimes(1);

            // Second poll tick: job is done — the button should become playable
            // at the predictable static-serve URL, not by re-checking has_artifact.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(2000);
            });
            expect(mockApi.getProcessingQueue).toHaveBeenCalledTimes(2);

            const sideButtons = screen.getAllByRole('button').filter((b) => /^(play|rendering)/i.test(b.textContent || ''));
            expect(sideButtons).toHaveLength(2);
            const sideBButton = sideButtons[1];
            expect(sideBButton).not.toBeDisabled();

            fireEvent.click(sideBButton);
            expect(loadAndPlay).toHaveBeenCalledWith(
                expect.objectContaining({ audioUrl: '/out/voice-ab-test/abtest-deadbeef/render.mp3' })
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('a poll tick already in flight when a new comparison starts cannot write the old job\'s result over the new run', async () => {
        vi.useFakeTimers();
        try {
            // Run 1: side B renders as job old-1111.
            mockApi.runVersionAbTest.mockResolvedValueOnce({
                status: 'ok',
                results: {
                    a: { mode: 'cached', audio_url: '/artifact/v1.wav' },
                    b: { mode: 'job', job_id: 'abtest-old11111' },
                },
            });
            // The first poll tick's fetch hangs until we release it — simulating
            // a tick that is mid-await when the user re-runs the comparison.
            let releaseStalePoll: (value: Array<{ id: string; status: string }>) => void = () => {};
            mockApi.getProcessingQueue.mockImplementationOnce(
                () => new Promise((resolve) => { releaseStalePoll = resolve; })
            );

            render(<VersionAbPanel voiceName="Aria Nova" versionA={versionA} versionB={versionB} />);
            await vi.waitFor(() => {
                fireEvent.click(screen.getByRole('button', { name: /run comparison/i }));
                expect(mockApi.runVersionAbTest).toHaveBeenCalledTimes(1);
            });

            // Fire the first poll tick; it is now awaiting the hung fetch.
            await act(async () => {
                await vi.advanceTimersByTimeAsync(2000);
            });
            expect(mockApi.getProcessingQueue).toHaveBeenCalledTimes(1);

            // Run 2 starts while that tick is in flight: side B is a new job.
            mockApi.runVersionAbTest.mockResolvedValueOnce({
                status: 'ok',
                results: {
                    a: { mode: 'cached', audio_url: '/artifact/v1.wav' },
                    b: { mode: 'job', job_id: 'abtest-new22222' },
                },
            });
            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /run comparison/i }));
                await Promise.resolve();
            });
            expect(mockApi.runVersionAbTest).toHaveBeenCalledTimes(2);

            // The stale tick's fetch now resolves reporting the OLD job done.
            // It must NOT surface the old job's render as playable audio, and
            // side B must still show as rendering (new job's poll is live).
            await act(async () => {
                releaseStalePoll([{ id: 'abtest-old11111', status: 'done' }]);
                await Promise.resolve();
            });
            expect(screen.getByText(/rendering/i)).toBeInTheDocument();
            const buttons = screen.getAllByRole('button').filter((b) => /^(play|rendering)/i.test(b.textContent || ''));
            const sideBButton = buttons[1];
            expect(sideBButton).toBeDisabled();
            fireEvent.click(sideBButton);
            expect(loadAndPlay).not.toHaveBeenCalledWith(
                expect.objectContaining({ audioUrl: '/out/voice-ab-test/abtest-old11111/render.mp3' })
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('clicking column A while the bus reports B currently playing calls loadAndPlay with A (bus takeover, no explicit pause-B call)', async () => {
        mockApi.runVersionAbTest.mockResolvedValue({
            status: 'ok',
            results: {
                a: { mode: 'cached', audio_url: '/artifact/v1.wav' },
                b: { mode: 'cached', audio_url: '/artifact/v2.wav' },
            },
        });
        (usePlayerBus as ReturnType<typeof vi.fn>).mockReturnValue({
            scope: 'preview',
            audioUrl: '/artifact/v2.wav',
            playing: true,
        });

        render(<VersionAbPanel voiceName="Aria Nova" versionA={versionA} versionB={versionB} />);
        fireEvent.click(screen.getByRole('button', { name: /run comparison/i }));

        // B is reported as currently playing by the bus, so its button reads
        // "Pause"; only column A's button reads "Play".
        const playButtonA = await screen.findByRole('button', { name: /^play$/i });
        fireEvent.click(playButtonA);

        expect(loadAndPlay).toHaveBeenCalledWith(expect.objectContaining({ audioUrl: '/artifact/v1.wav' }));
        expect(pauseBusMock).not.toHaveBeenCalled();
    });
});
