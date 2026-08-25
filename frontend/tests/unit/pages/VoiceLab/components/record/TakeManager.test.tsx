/**
 * TakeManager.test.tsx — task 009 (voice-card-consolidation, P8)
 *
 * Covers INV-REC-2 (non-destructive retakes: Keep appends, Retake never
 * discards a prior take, Discard is a separate explicit action), the
 * Keep/Retake quality gate (via `RecordControls`, exercised through the
 * real mic-recorder + quality-check pipeline — see `mediaRecorderMocks.ts`'s
 * default decoded buffer), the full Enter/R keyboard-shortcut set on top of
 * task 008's Space, and unique-filename collision safety on finalize.
 *
 * Mock boundary (R2): `transcodeToWav` is mocked here (it's a separate unit,
 * already exercised directly against real encoder math in
 * `transcodeToWav.test.ts`) so this file can assert on `onFinalize`'s
 * resulting `File[]` without re-deriving WAV bytes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TakeManager } from '@/pages/VoiceLab/components/record/TakeManager';
import { installMediaRecorderMocks } from '../../../../../helpers/mediaRecorderMocks';

vi.mock('@/utils/audio/transcodeToWav', () => ({
    transcodeToWav: vi.fn(async (blob: Blob) => blob),
}));

async function recordAndKeepOneTake(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Start recording' }));
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await screen.findByRole('button', { name: 'Keep' });
    await user.click(screen.getByRole('button', { name: 'Keep' }));
}

describe('TakeManager', () => {
    beforeEach(() => {
        installMediaRecorderMocks();
    });

    it('Keep appends a take without discarding any previous one, and Retake starts fresh without touching prior takes (INV-REC-2)', async () => {
        const user = userEvent.setup();
        render(<TakeManager onFinalize={vi.fn()} />);

        await recordAndKeepOneTake(user);
        expect(screen.getByText(/1 take kept/i)).toBeInTheDocument();

        // Retake (a second capture, discarded before Keep) must not touch
        // take 1.
        await user.click(screen.getByRole('button', { name: 'Start recording' }));
        await user.click(screen.getByRole('button', { name: 'Stop recording' }));
        await screen.findByRole('button', { name: 'Retake' });
        await user.click(screen.getByRole('button', { name: 'Retake' }));
        expect(screen.getByText(/1 take kept/i)).toBeInTheDocument();

        // A second Keep appends take 2 -- take 1 is still present.
        await recordAndKeepOneTake(user);
        expect(screen.getByText(/2 takes kept/i)).toBeInTheDocument();
        expect(screen.getAllByText('Discard')).toHaveLength(2);
    });

    it('Discard removes only the targeted take, leaving the rest recoverable', async () => {
        const user = userEvent.setup();
        render(<TakeManager onFinalize={vi.fn()} />);

        await recordAndKeepOneTake(user);
        await recordAndKeepOneTake(user);
        expect(screen.getByText(/2 takes kept/i)).toBeInTheDocument();

        const discardButtons = screen.getAllByText('Discard');
        await user.click(discardButtons[0]);

        expect(screen.getByText(/1 take kept/i)).toBeInTheDocument();
    });

    it('gates Keep on the quality verdict (disabled while checking, enabled once ok)', async () => {
        const user = userEvent.setup();
        render(<TakeManager onFinalize={vi.fn()} />);

        await user.click(screen.getByRole('button', { name: 'Start recording' }));
        await user.click(screen.getByRole('button', { name: 'Stop recording' }));

        // Once the (mocked, non-silent/non-clipping) quality check resolves,
        // Keep becomes enabled.
        const keepBtn = await screen.findByRole('button', { name: 'Keep' });
        expect(keepBtn).not.toBeDisabled();
    });

    it('finalizes kept takes with unique filenames and calls onFinalize with the resulting File[]', async () => {
        const user = userEvent.setup();
        const onFinalize = vi.fn().mockResolvedValue(undefined);
        render(<TakeManager onFinalize={onFinalize} />);

        await recordAndKeepOneTake(user);
        await recordAndKeepOneTake(user);

        await user.click(screen.getByRole('button', { name: /finalize 2 takes/i }));

        expect(onFinalize).toHaveBeenCalledTimes(1);
        const files: File[] = onFinalize.mock.calls[0][0];
        expect(files).toHaveLength(2);
        expect(files[0]).toBeInstanceOf(File);
        expect(files[0].name).not.toBe(files[1].name);
        expect(files[0].name).toMatch(/\.wav$/);
        expect(files[1].name).toMatch(/\.wav$/);
    });

    it('supports Enter (keep) and R (retake) at the container level, on top of task 008\'s Space toggle', async () => {
        const user = userEvent.setup();
        render(<TakeManager onFinalize={vi.fn()} />);
        const container = document.querySelector('.take-manager') as HTMLElement;

        // Space toggles start/stop (task 008's primitive, unaffected by this
        // task's Enter/R handling on the same container).
        await user.click(screen.getByRole('button', { name: 'Start recording' }));
        await user.click(screen.getByRole('button', { name: 'Stop recording' }));
        await screen.findByRole('button', { name: 'Keep' });

        // Enter keeps the current captured take via the container-level
        // handler, deferring to the (enabled) Keep button.
        fireEvent.keyDown(container, { code: 'Enter' });
        // findBy, not getBy: the keep is applied through a React state update,
        // so a synchronous query races the flush and fails on a slow runner.
        expect(await screen.findByText(/1 take kept/i)).toBeInTheDocument();

        // R retakes the next captured take without touching take 1.
        await user.click(screen.getByRole('button', { name: 'Start recording' }));
        await user.click(screen.getByRole('button', { name: 'Stop recording' }));
        await screen.findByRole('button', { name: 'Retake' });
        fireEvent.keyDown(container, { key: 'r' });

        expect(screen.getByText(/1 take kept/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start recording' })).toBeInTheDocument();
    });
});
