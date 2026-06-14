/**
 * VoiceIconControls.test.tsx — R5-T7
 *
 * Tests:
 * - Copy button writes to clipboard (mock clipboard boundary)
 * - Copy button shows "Copied!" state after click
 * - "Copied!" resets after timeout (fake timers, R4: no sleeps)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { VoiceMetadata } from '@/types';

// Mock the api boundary
vi.mock('@/api', () => ({
    api: {
        uploadVoiceIcon: vi.fn().mockResolvedValue({ status: 'ok', image: '/img.jpg' }),
    },
}));

import { VoiceIconControls } from '@/pages/VoiceLab/components/VoiceIconControls';

const mockMeta: VoiceMetadata = {
    id: 'voice-abc',
    name: 'Aria Nova',
    description: 'Warm narrator.',
    attributes: { class: 'human', gender: 'feminine', age: 'adult' },
    is_untagged: false,
};

describe('VoiceIconControls', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Mock clipboard
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
            writable: true,
            configurable: true,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders the copy icon prompt button', () => {
        render(<VoiceIconControls voiceId="voice-abc" metadata={mockMeta} onIconUploaded={vi.fn()} />);
        expect(screen.getByRole('button', { name: /copy icon prompt/i })).toBeInTheDocument();
    });

    it('renders the upload icon button', () => {
        render(<VoiceIconControls voiceId="voice-abc" metadata={mockMeta} onIconUploaded={vi.fn()} />);
        expect(screen.getByRole('button', { name: /upload voice icon/i })).toBeInTheDocument();
    });

    it('copies a non-empty string to clipboard on click', async () => {
        const writeFn = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: writeFn },
            writable: true,
            configurable: true,
        });
        render(<VoiceIconControls voiceId="voice-abc" metadata={mockMeta} onIconUploaded={vi.fn()} />);

        const copyBtn = screen.getByRole('button', { name: /copy icon prompt/i });
        await act(async () => {
            fireEvent.click(copyBtn);
            await Promise.resolve();
        });

        expect(writeFn).toHaveBeenCalledOnce();
        const written = writeFn.mock.calls[0][0] as string;
        expect(typeof written).toBe('string');
        expect(written.length).toBeGreaterThan(0);
        expect(written).toContain('Circular avatar portrait icon');
    });

    it('shows "Copied!" state after clicking copy and resets after timeout', async () => {
        const writeFn = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: writeFn },
            writable: true,
            configurable: true,
        });

        vi.useFakeTimers();
        render(<VoiceIconControls voiceId="voice-abc" metadata={mockMeta} onIconUploaded={vi.fn()} />);

        const copyBtn = screen.getByRole('button', { name: /copy icon prompt/i });

        // Use fireEvent (synchronous) instead of userEvent to avoid timer conflicts
        await act(async () => {
            fireEvent.click(copyBtn);
            // Flush the clipboard promise microtask
            await Promise.resolve();
        });

        // "Copied!" should appear
        expect(screen.getByText(/Copied!/i)).toBeInTheDocument();

        // Advance fake timers past the 2000ms reset
        act(() => {
            vi.advanceTimersByTime(2100);
        });

        expect(screen.queryByText(/Copied!/i)).not.toBeInTheDocument();
    });
});
