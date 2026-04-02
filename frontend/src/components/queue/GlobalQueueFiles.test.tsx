import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock predictive progress bar
vi.mock('../PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({
    progress,
    predictive,
    startedAt,
    etaSeconds,
    indeterminateRunning,
    status
  }: {
    progress: number;
    predictive?: boolean;
    startedAt?: number;
    etaSeconds?: number;
    indeterminateRunning?: boolean;
    status?: string;
  }) => (
    <div
      data-testid="progress-bar"
      data-progress={progress}
      data-predictive={String(!!predictive)}
      data-started-at={startedAt ?? ''}
      data-eta-seconds={etaSeconds ?? ''}
      data-indeterminate-running={String(!!indeterminateRunning)}
      data-status={status ?? ''}
    />
  )
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
        progress: 0.45,
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
            expect(screen.getByText('Test Project')).toBeInTheDocument();
            expect(screen.getByText('Started Time 1000')).toBeInTheDocument();
            expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
        });

        it('shows part numbering only for continued split jobs', () => {
            render(
                <QueueItem
                    job={{ ...mockJob, split_part: 2 } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByText('Test Project • Part 3')).toBeInTheDocument();
        });

        it('passes live job timing data through and enables local predictive animation for xtts queue jobs', () => {
            render(
                <QueueItem 
                    job={{ ...mockJob, progress: 0.15 } as any}
                    liveJob={{ id: 'job-1', engine: 'xtts', status: 'running', progress: 0.15, started_at: 1000, eta_seconds: 30 } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-progress', '0.15');
            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-predictive', 'false');
            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-started-at', '1000');
            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-eta-seconds', '30');
        });

        it('uses indeterminate non-predictive progress for voxtral jobs', () => {
            render(
                <QueueItem
                    job={{ ...mockJob, engine: 'voxtral', status: 'running', progress: 0 } as any}
                    liveJob={{ id: 'job-1', engine: 'voxtral', status: 'running', progress: 0, started_at: 1000, eta_seconds: 30 } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-predictive', 'true');
            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-indeterminate-running', 'true');
            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-status', 'running');
        });

        it('uses live segment progress for running voice build jobs', () => {
            render(
                <QueueItem
                    job={{ ...mockJob, engine: 'voice_build', status: 'running', progress: 0.2 } as any}
                    liveJob={{
                        id: 'job-1',
                        engine: 'voice_build',
                        status: 'running',
                        progress: 0.4,
                        active_segment_progress: 0.66,
                        started_at: 1000,
                        eta_seconds: 30,
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-progress', '0.66');
            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-predictive', 'true');
        });

        it('keeps voice build progress moving when overall job progress is ahead of sparse segment updates', () => {
            render(
                <QueueItem
                    job={{ ...mockJob, engine: 'voice_build', status: 'running', progress: 0.4 } as any}
                    liveJob={{
                        id: 'job-1',
                        engine: 'voice_build',
                        status: 'running',
                        progress: 0.72,
                        active_segment_progress: 0.66,
                        started_at: 1000,
                        eta_seconds: 30,
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-progress', '0.72');
            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-predictive', 'true');
        });

        it('keeps chapter jobs on overall progress even when segment progress is present', () => {
            render(
                <QueueItem
                    job={{ ...mockJob, engine: 'xtts', status: 'running', progress: 0.52 } as any}
                    liveJob={{
                        id: 'job-1',
                        engine: 'xtts',
                        status: 'running',
                        progress: 0.52,
                        active_segment_progress: 0.75,
                        started_at: 1000,
                        eta_seconds: 30,
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-progress', '0.52');
            expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-predictive', 'true');
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
