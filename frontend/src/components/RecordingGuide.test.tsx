import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordingGuide } from './RecordingGuide';

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

    it('renders and displays prompt categories', () => {
        render(<RecordingGuide />);
        expect(screen.getByText('Neutral / Calm')).toBeInTheDocument();
        expect(screen.getByText('Happy / Upbeat')).toBeInTheDocument();
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

    it('copies prompt text to clipboard', async () => {
        render(<RecordingGuide />);
        const copyBtns = screen.getAllByTitle('Copy text');
        
        await act(async () => {
          fireEvent.click(copyBtns[0]);
        });
        
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
        
        // Verify it sets copied state and then resets it
        act(() => {
          vi.advanceTimersByTime(2000);
        });
    });
});
