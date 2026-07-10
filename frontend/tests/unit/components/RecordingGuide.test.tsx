import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordingGuide } from '@/components/RecordingGuide';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('RecordingGuide', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Mock clipboard
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
        });
        vi.useFakeTimers();
    });

    it('expands a category on click', () => {
        render(<RecordingGuide />);
        // Neutral / Calm is expanded by default (line 57)
        expect(screen.getByText(/Audio check\. I’m speaking clearly/i)).toBeInTheDocument();
        
        // Close it
        fireEvent.click(screen.getByText('Neutral / Calm'));
        expect(screen.queryByText(/Audio check/i)).not.toBeInTheDocument();

        // Open another
        fireEvent.click(screen.getByText('Happy / Upbeat'));
        expect(screen.getByText(/Okay, yes! This is going to be fun/i)).toBeInTheDocument();
    });

    it('copies the first prompt text to clipboard', async () => {
        render(<RecordingGuide />);
        // Neutral / Calm is expanded by default; first prompt is the "Audio check" line
        const copyBtns = screen.getAllByTitle('Copy text');

        await act(async () => {
          fireEvent.click(copyBtns[0]);
        });

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          expect.stringContaining('Audio check')
        );
    });
});
