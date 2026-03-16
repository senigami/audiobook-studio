import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { QueueStats } from './QueueStats';
describe('QueueStats', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Mock Date.now() to a fixed time
        vi.setSystemTime(new Date('2026-03-16T12:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns null when queue is empty', () => {
        const { container } = render(<QueueStats queue={[]} jobs={{}} />);
        expect(container.firstChild).toBeNull();
    });

    it('calculates and formats minutes correctly for queued items', () => {
        const queue = [
            { id: '1', status: 'queued', predicted_audio_length: 120 } as any,
            { id: '2', status: 'queued', predicted_audio_length: 60 } as any
        ];
        render(<QueueStats queue={queue} jobs={{}} />);
        
        // 120 + 60 = 180 seconds = 3 minutes
        expect(screen.getByText('3m remaining')).toBeDefined();
    });

    it('formats days, hours, and minutes correctly', () => {
        const queue = [
            { id: '1', status: 'queued', predicted_audio_length: 86400 + 3600 + 120 } as any // 1d 1h 2m
        ];
        render(<QueueStats queue={queue} jobs={{}} />);
        
        expect(screen.getByText('1d 1h 2m remaining')).toBeDefined();
    });

    it('updates in real-time as time passes', async () => {
        const startTimestamp = Date.now() / 1000;
        const queue = [
            { id: 'job-1', status: 'running', predicted_audio_length: 300 } as any
        ];
        const jobs = {
            'job-1': { 
                id: 'job-1', 
                status: 'running', 
                progress: 0.5, 
                started_at: startTimestamp,
                eta_seconds: 150 // 150 seconds remaining at 50%
            } as any
        };
        render(<QueueStats queue={queue} jobs={jobs} />);

        // 150s = 2.5 minutes -> 3m (due to Math.ceil)
        expect(screen.getByText('3m remaining')).toBeDefined();

        // Advance time by 31 seconds
        act(() => {
            vi.advanceTimersByTime(31000);
        });

        // 150 - 31 = 119s = 1.98 minutes -> 2m
        expect(screen.getByText('2m remaining')).toBeDefined();
        
        // Advance time by another 60 seconds
        act(() => {
            vi.advanceTimersByTime(60000);
        });

        // 119 - 60 = 59s = 0.98 minutes -> 1m
        expect(screen.getByText('1m remaining')).toBeDefined();
    });

    it('shows "Finishing..." when total seconds reach 0', () => {
        const queue = [
            { id: '1', status: 'running', predicted_audio_length: 0 } as any
        ];
        const jobs = {
            '1': { id: '1', status: 'running', progress: 0.999, eta_seconds: 0 } as any
        };
        render(<QueueStats queue={queue} jobs={jobs} />);
        
        expect(screen.getByText('Finishing...')).toBeDefined();
    });
});
