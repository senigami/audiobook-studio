import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock predictive progress bar
vi.mock('../PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({ progress }: { progress: number }) => <div data-testid="progress-bar" data-progress={progress} />
}));

vi.mock('../../hooks/useGlobalQueue', () => ({
  useGlobalQueue: vi.fn(() => ({
    queue: [],
    loading: false,
    localPaused: false,
    hoveredJobId: null,
    setHoveredJobId: vi.fn(),
    showHistory: false,
    setShowHistory: vi.fn(),
    confirmConfig: null,
    setConfirmConfig: vi.fn(),
    handlePauseToggle: vi.fn(),
    handleReorder: vi.fn(),
    handleRemove: vi.fn(),
    handleClearCompleted: vi.fn(),
    handleClearAll: vi.fn(),
  })),
}));

import { GlobalQueue } from '../GlobalQueue';
import { QueueItem } from './QueueItem';

describe('Global Queue Components', () => {
    const mockJob = {
        id: 'job-1',
        type: 'chapter_generation',
        engine: 'xtts',
        status: 'processing',
        progress: 45,
        project_name: 'Test Project',
        split_part: 0,
        started_at: 1000,
        eta_seconds: 30
    };

    describe('QueueItem', () => {
        it('renders job details correctly', () => {
            render(
                <QueueItem 
                    job={mockJob as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByText('Title for job-1')).toBeInTheDocument();
            expect(screen.getByText('Test Project • Part 1')).toBeInTheDocument();
            expect(screen.getByText('Started Time 1000')).toBeInTheDocument();
            expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
        });

        it('starts xtts queue progress at zero until live segment progress arrives', () => {
            render(
                <QueueItem 
                    job={{ ...mockJob, progress: 15 } as any}
                    liveJob={{ id: 'job-1', engine: 'xtts', status: 'running', progress: 15 } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-progress', '0');
        });

        it('shows pause icon when paused', () => {
            const { container } = render(
                <QueueItem 
                    job={mockJob as any}
                    localPaused={true}
                    formatJobTitle={vi.fn()}
                    formatTime={vi.fn()}
                    onRemove={vi.fn()}
                />
            );
            // Check for pause icon (lucide-react component usually renders as an svg)
            const svg = container.querySelector('svg');
            expect(svg).toBeInTheDocument();
        });

        it('calls onRemove when cancel button is clicked', () => {
            const onRemove = vi.fn();
            render(
                <QueueItem 
                    job={mockJob as any}
                    localPaused={false}
                    formatJobTitle={(_j) => 'Title'}
                    formatTime={vi.fn()}
                    onRemove={onRemove}
                />
            );

            fireEvent.click(screen.getByTitle('Cancel Job'));
            expect(onRemove).toHaveBeenCalledWith('job-1');
        });
    });

    describe('GlobalQueue', () => {
        it('renders queue title', () => {
            render(
                <GlobalQueue 
                    paused={false}
                    jobs={{}}
                />
            );

            expect(screen.getByText('Global Processing Queue')).toBeInTheDocument();
        });

        it('shows empty state', () => {
            render(
                <GlobalQueue 
                    paused={false}
                    jobs={{}}
                />
            );

            expect(screen.getByText('Queue is empty')).toBeInTheDocument();
        });
    });
});
