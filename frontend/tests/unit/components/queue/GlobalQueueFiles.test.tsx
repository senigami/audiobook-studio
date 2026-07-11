import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetLiveEventAuditForTests } from '@/store/liveEventAuditStore';
import { publishStudioSocketMessage, resetStudioSocketBusForTests } from '@/store/studioSocketBus';

// Mock predictive progress bar
  vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({
    progress,
    predictive,
    startedAt,
    etaSeconds,
    etaBasis,
    status,
    allowBackwardProgress,
    evidenceWeightFraction,
    persistenceKey,
    checkpointMode,
    updatedAt,
    dataTestId
  }: {
    progress: number;
    predictive?: boolean;
    startedAt?: number;
    etaSeconds?: number;
    etaBasis?: string;
    status?: string;
    allowBackwardProgress?: boolean;
    evidenceWeightFraction?: number;
    persistenceKey?: string;
    checkpointMode?: string;
    updatedAt?: number;
    dataTestId?: string;
  }) => (
    <div
      data-testid={dataTestId || "progress-bar"}
      data-progress={progress}
      data-predictive={String(!!predictive)}
      data-started-at={startedAt ?? ''}
      data-eta-seconds={etaSeconds ?? ''}
      data-eta-basis={etaBasis ?? ''}
      data-status={status ?? ''}
      data-allow-backward={String(!!allowBackwardProgress)}
      data-evidence-weight-fraction={evidenceWeightFraction ?? ''}
      data-persistence-key={persistenceKey ?? ''}
      data-checkpoint-mode={checkpointMode ?? ''}
      data-updated-at={updatedAt ?? ''}
    />
  )
}));

vi.mock('@/hooks/useGlobalQueue', () => ({
  useGlobalQueue: vi.fn((initialQueue) => ({
    queue: initialQueue || [],
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

import { GlobalQueue } from '@/components/queue/GlobalQueue';
import { QueueItem } from '@/components/queue/QueueItem';

describe('Global Queue Components', () => {
    beforeEach(() => {
        resetLiveEventAuditForTests();
        // Tests in this suite interact with the debug copy button, which requires dev mode.
        localStorage.setItem('studio-dev-mode', 'true');
    });

    afterEach(() => {
        localStorage.removeItem('studio-dev-mode');
    });

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
            expect(screen.getByTestId('queue-item-progress-bar')).toBeInTheDocument();
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

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-progress', '0.15');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-predictive', 'true');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-started-at', '1000');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-eta-seconds', '30');
        });

        it('uses indeterminate working state for indeterminate jobs while keeping predictive mode enabled', () => {
            render(
                <QueueItem
                    job={{ ...mockJob, engine: 'cloud_engine', status: 'running', progress: 0 } as any}
                    liveJob={{ id: 'job-1', engine: 'cloud_engine', status: 'running', progress: 0, started_at: 1000, eta_seconds: 30 } as any}
                    engines={[{ engine_id: 'cloud_engine', cloud: true } as any]}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-predictive', 'true');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-status', 'preparing');
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

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-progress', '0.66');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-predictive', 'true');
        });

        it('keeps voice build progress tied to the active segment instead of the overall job lane', () => {
            render(
                <QueueItem
                    job={{ ...mockJob, engine: 'voice_build', status: 'running', progress: 0.72 } as any}
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

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-progress', '0.66');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-predictive', 'true');
        });

        it('proves the main queue is not driven by chapter/segment live overlays (uses overall progress for chapter jobs)', () => {
            render(
                <QueueItem
                    job={{ ...mockJob, engine: 'xtts', status: 'running', progress: 0.52 } as any}
                    liveJob={{
                        id: 'job-1',
                        engine: 'xtts',
                        status: 'running',
                        progress: 0.52,
                        active_segment_progress: 0.75,
                        active_segment_id: 'seg-2',
                        started_at: 1000,
                        eta_seconds: 30,
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
            />
            );

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-progress', '0.52');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-predictive', 'true');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-persistence-key', 'job-1');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-checkpoint-mode', 'default');
        });

        it('uses chapter progress for segment-capable chapter jobs in the main queue', () => {
            render(
                <QueueItem
                    job={{ ...mockJob, engine: 'xtts', status: 'running', progress: 0.52, has_segment_support: true } as any}
                    liveJob={{
                        id: 'job-1',
                        engine: 'xtts',
                        status: 'running',
                        progress: 0.52,
                        has_segment_support: true,
                        active_segment_progress: 0.75,
                        active_segment_id: 'seg-2',
                        started_at: 1000,
                        eta_seconds: 30,
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-progress', '0.52');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-persistence-key', 'job-1');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-checkpoint-mode', 'default');
        });

        it('does not render ETA 0 or negative ETA for active jobs', () => {
            render(
                <QueueItem
                    job={{ ...mockJob, status: 'running', eta_seconds: 0 } as any}
                    liveJob={{ id: 'job-1', status: 'running', eta_seconds: 0 } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-eta-seconds', '');
        });

        it('does not render ETA 0 when an active job has positive eta_seconds but a stale estimated_end_at from the past', () => {
            const nowSeconds = Date.now() / 1000;
            render(
                <QueueItem
                    job={{
                        ...mockJob,
                        status: 'running',
                        progress: 0.74,
                        eta_seconds: 12,
                        estimated_end_at: nowSeconds - 100,
                        updated_at: nowSeconds,
                        started_at: nowSeconds - 200,
                    } as any}
                    liveJob={{
                        id: 'job-1',
                        status: 'running',
                        progress: 0.74,
                        eta_seconds: 12,
                        estimated_end_at: nowSeconds - 100,
                        updated_at: nowSeconds,
                        started_at: nowSeconds - 200,
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            const progressBar = screen.getByTestId('queue-item-progress-bar');
            expect(progressBar).toHaveAttribute('data-eta-seconds', '12');
        });

        it('uses active segment progress for segment-classified jobs', () => {
            render(
                <QueueItem
                    job={{ ...mockJob, classification: 'segment', status: 'running', progress: 0.52 } as any}
                    liveJob={{
                        id: 'job-1',
                        classification: 'segment',
                        status: 'running',
                        progress: 0.52,
                        active_segment_progress: 0.75,
                        active_segment_id: 'seg-2',
                        started_at: 1000,
                        eta_seconds: 30,
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-progress', '0.75');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-persistence-key', 'job-1:seg-2');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-checkpoint-mode', 'segment');
        });

        it('preserves grouped progress evidence for mixed chapter jobs while keeping the preparing label', () => {
            // Parallel-render model (§2.6 v1.8.0): a preparing job that carries a positive
            // eta_seconds passes the ETA and started_at through to the bar so the global
            // queue can show the determinate countdown.  The status label remains "preparing"
            // and the bar is still in preparing/indeterminate fill mode.
            render(
                <QueueItem
                    job={{ ...mockJob, engine: 'mixed', status: 'preparing', progress: 0 } as any}
                    liveJob={{
                        id: 'job-1',
                        engine: 'mixed',
                        status: 'preparing',
                        progress: 0.3,
                        active_segment_progress: 0.75,
                        active_segment_id: 'seg-2',
                        render_group_count: 3,
                        completed_render_groups: 1,
                        active_render_group_index: 2,
                        total_render_weight: 1000,
                        completed_render_weight: 500,
                        active_render_group_weight: 400,
                        started_at: 1000,
                        eta_seconds: 30,
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-status', 'preparing');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-progress', '0.3');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-allow-backward', 'false');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-persistence-key', 'job-1');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-checkpoint-mode', 'queue');
            // Parallel-render: preparing + positive eta → eta and started_at flow through
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-started-at', '1000');
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-eta-seconds', '30');
        });

        it('shows pause icon when paused, and swaps back to play icon when not paused', () => {
            const { container, rerender } = render(
                <QueueItem
                    job={mockJob as any}
                    localPaused={true}
                    formatJobTitle={vi.fn()}
                    formatTime={vi.fn()}
                    onRemove={vi.fn()}
                />
            );
            // lucide-react tags each icon with a `lucide-<name>` class, so this
            // distinguishes the paused (Pause) icon from the running (Play) icon.
            expect(container.querySelector('svg.lucide-pause')).toBeInTheDocument();
            expect(container.querySelector('svg.lucide-play')).not.toBeInTheDocument();

            rerender(
                <QueueItem
                    job={mockJob as any}
                    localPaused={false}
                    formatJobTitle={vi.fn()}
                    formatTime={vi.fn()}
                    onRemove={vi.fn()}
                />
            );
            expect(container.querySelector('svg.lucide-play')).toBeInTheDocument();
            expect(container.querySelector('svg.lucide-pause')).not.toBeInTheDocument();
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

        it('stabilizes grouped-job policy from the first frame by reading render group count from the authoritative queue job', () => {
             render(
                <QueueItem 
                    job={{ 
                        ...mockJob, 
                        status: 'running', 
                        progress: 0,
                        render_group_count: 5,
                    } as any}
                    liveJob={undefined}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            // Even if liveJob is missing, it should detect grouped progress and disable backward movement
            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-allow-backward', 'false');
        });

        it('prefers positive liveJob.eta_seconds over job.eta_seconds = 0 when running', () => {
            render(
                <QueueItem
                    job={{
                        ...mockJob,
                        status: 'running',
                        eta_seconds: 0,
                    } as any}
                    liveJob={{
                        id: 'job-1',
                        status: 'running',
                        eta_seconds: 14,
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-eta-seconds', '14');
        });

        it('uses job.eta_seconds when only job.eta_seconds is positive', () => {
            render(
                <QueueItem
                    job={{
                        ...mockJob,
                        status: 'running',
                        eta_seconds: 42,
                    } as any}
                    liveJob={{
                        id: 'job-1',
                        status: 'running',
                        eta_seconds: 0,
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-eta-seconds', '42');
        });

        it('associates the ETA basis with the selected ETA source', () => {
            render(
                <QueueItem
                    job={{
                        ...mockJob,
                        status: 'running',
                        eta_seconds: 0,
                        eta_basis: 'total_from_start',
                    } as any}
                    liveJob={{
                        id: 'job-1',
                        status: 'running',
                        eta_seconds: 14,
                        eta_basis: 'remaining_from_update',
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            const progressBar = screen.getByTestId('queue-item-progress-bar');
            expect(progressBar).toHaveAttribute('data-eta-seconds', '14');
            expect(progressBar).toHaveAttribute('data-eta-basis', 'remaining_from_update');
        });

        it('copies JSON containing job details and matching queue.items audit frames on debug button click, excluding tts.logs', async () => {
            const writeTextSpy = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, {
                clipboard: { writeText: writeTextSpy },
            });

            // R3: frames go through the real socket bus (which assigns frameId and
            // records the audit envelope), not hand-rolled envelopes into the store.
            resetStudioSocketBusForTests(); // deterministic frameIds from 1
            act(() => {
                publishStudioSocketMessage({
                    type: 'studio_event',
                    version: 1,
                    topic: 'queue.items',
                    eventKind: 'queue_item_status',
                    ids: { jobId: 'job-1' },
                    payload: {
                        status: 'running',
                        progress: 0.15,
                        etaSeconds: 30,
                        etaBasis: 'remaining_from_update',
                    },
                });
                publishStudioSocketMessage({
                    type: 'studio_event',
                    version: 1,
                    topic: 'tts.logs',
                    eventKind: 'tts_log',
                    ids: { jobId: 'job-1' },
                    payload: {
                        line: '[PROGRESS] 15%',
                    },
                });
            });

            render(
                <QueueItem
                    job={{
                        ...mockJob,
                        status: 'running',
                        eta_seconds: 0,
                        eta_basis: 'total_from_start',
                    } as any}
                    liveJob={{
                        id: 'job-1',
                        status: 'running',
                        eta_seconds: 14,
                        eta_basis: 'remaining_from_update',
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            const debugBtn = screen.getByTitle('Copy Debug Info');
            expect(debugBtn).toBeInTheDocument();

            fireEvent.click(debugBtn);

            // R4: event-driven wait for the async clipboard write, no fixed sleep
            await waitFor(() => expect(writeTextSpy).toHaveBeenCalled());

            const copiedText = writeTextSpy.mock.calls[0][0];
            const parsed = JSON.parse(copiedText);

            expect(parsed.job.id).toBe('job-1');
            expect(parsed.jobEtaSeconds).toBe(0);
            expect(parsed.liveJobEtaSeconds).toBe(14);
            expect(parsed.selectedEtaBasis).toBe('remaining_from_update');
            expect(parsed.etaSecondsPassedToProgressBar).toBe(14);
            expect(parsed.persistenceKey).toBe('job-1');
            expect(parsed.checkpointMode).toBe('default');
            expect(parsed.transitionTickCount).toBe(8);
            expect(parsed.recentAuditFrames).toHaveLength(1);
            // First frame published after the bus reset → frameId 1 (tts.logs frame is 2, excluded)
            expect(parsed.recentAuditFrames[0].frameId).toBe(1);
            expect(parsed.recentAuditFrames[0].payload.status).toBe('running');
        });

        it('prefers liveJob.updated_at over job.updated_at when liveJob provides the positive ETA', () => {
            render(
                <QueueItem
                    job={{
                        ...mockJob,
                        status: 'running',
                        eta_seconds: 14,
                        updated_at: 1000,
                        eta_basis: 'remaining_from_update',
                    } as any}
                    liveJob={{
                        id: 'job-1',
                        status: 'running',
                        eta_seconds: 14,
                        updated_at: 2000,
                        eta_basis: 'remaining_from_update',
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-updated-at', '2000');
        });

        it('falls back to job.updated_at when live overlay does not provide a fresher ETA/timestamp pair', () => {
            render(
                <QueueItem
                    job={{
                        ...mockJob,
                        status: 'running',
                        eta_seconds: 14,
                        updated_at: 1000,
                        eta_basis: 'remaining_from_update',
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-updated-at', '1000');
        });

        it('keeps the ETA timestamp anchor stable when a subsequent update lacks a positive live ETA', () => {
            const { rerender } = render(
                <QueueItem
                    job={{
                        ...mockJob,
                        status: 'running',
                        eta_seconds: 14,
                        updated_at: 1000,
                        eta_basis: 'remaining_from_update',
                    } as any}
                    liveJob={{
                        id: 'job-1',
                        status: 'running',
                        eta_seconds: 14,
                        updated_at: 2000,
                        eta_basis: 'remaining_from_update',
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-updated-at', '2000');

            rerender(
                <QueueItem
                    job={{
                        ...mockJob,
                        status: 'running',
                        eta_seconds: 14,
                        updated_at: 1000,
                        eta_basis: 'remaining_from_update',
                    } as any}
                    liveJob={{
                        id: 'job-1',
                        status: 'running',
                        progress: 0.68,
                        updated_at: 2005,
                        eta_basis: 'remaining_from_update',
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-updated-at', '2000');
        });

        it('keeps the debug button visible after a job reaches done', () => {
            render(
                <QueueItem
                    job={{
                        ...mockJob,
                        status: 'done',
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            expect(screen.getByTitle('Copy Debug Info')).toBeInTheDocument();
        });

        it('includes the ETA source/basis fields and last active values in the debug payload after completion', async () => {
            const writeTextSpy = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, {
                clipboard: { writeText: writeTextSpy },
            });

            const { rerender } = render(
                <QueueItem
                    job={{
                        ...mockJob,
                        status: 'running',
                        eta_seconds: 14,
                        updated_at: 1000,
                        eta_basis: 'remaining_from_update',
                    } as any}
                    liveJob={{
                        id: 'job-1',
                        status: 'running',
                        eta_seconds: 14,
                        updated_at: 2000,
                        eta_basis: 'remaining_from_update',
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            rerender(
                <QueueItem
                    job={{
                        ...mockJob,
                        status: 'done',
                        eta_seconds: 0,
                        updated_at: 2100,
                    } as any}
                    liveJob={{
                        id: 'job-1',
                        status: 'done',
                        progress: 1.0,
                        updated_at: 2100,
                    } as any}
                    localPaused={false}
                    formatJobTitle={(j) => `Title for ${j.id}`}
                    formatTime={(t) => `Time ${t}`}
                    onRemove={vi.fn()}
                />
            );

            const debugBtn = screen.getByTitle('Copy Debug Info');
            fireEvent.click(debugBtn);

            // R4: event-driven wait for the async clipboard write, no fixed sleep
            await waitFor(() => expect(writeTextSpy).toHaveBeenCalled());

            const copiedText = writeTextSpy.mock.calls[0][0];
            const parsed = JSON.parse(copiedText);

            expect(parsed.stableEta).toBe(14);
            expect(parsed.stableUpdatedAt).toBe(2000);
            expect(parsed.stableEtaBasis).toBe('remaining_from_update');
            expect(parsed.etaSourcePath).toBe('live_overlay');
            expect(parsed.etaSourceReason).toBe('positive_live_job_eta');
        });
    });

    describe('GlobalQueue Completion Retention', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('retains completed jobs in the active list long enough to copy debug data, then unmounts them', async () => {
            const writeTextSpy = vi.fn().mockResolvedValue(undefined);
            Object.assign(navigator, {
                clipboard: { writeText: writeTextSpy },
            });

            const initialQueue = [
                {
                    id: 'job-1',
                    status: 'running',
                    progress: 0.5,
                    project_name: 'Test Project',
                    started_at: 1000,
                    eta_seconds: 30,
                    type: 'chapter_generation',
                    engine: 'xtts',
                }
            ];

            const { rerender } = render(
                <GlobalQueue
                    paused={false}
                    queue={initialQueue as any}
                />
            );

            // Debug button is present for the active job
            expect(screen.getByTestId('debug-copy-btn-job-1')).toBeInTheDocument();

            // Simulate transition to done in the queue array
            const updatedQueue = [
                {
                    id: 'job-1',
                    status: 'done',
                    progress: 1.0,
                    project_name: 'Test Project',
                    started_at: 1000,
                    eta_seconds: 0,
                    type: 'chapter_generation',
                    engine: 'xtts',
                }
            ];

            rerender(
                <GlobalQueue
                    paused={false}
                    queue={updatedQueue as any}
                />
            );

            // Job is done but retained for 30s. The debug button is STILL present!
            const debugBtn = screen.getByTestId('debug-copy-btn-job-1');
            expect(debugBtn).toBeInTheDocument();

            // Click the debug copy button on the retained row
            fireEvent.click(debugBtn);
            await Promise.resolve();
            await Promise.resolve();

            expect(writeTextSpy).toHaveBeenCalled();
            const copiedText = writeTextSpy.mock.calls[0][0];
            const parsed = JSON.parse(copiedText);
            expect(parsed.job.id).toBe('job-1');
            expect(parsed.job.status).toBe('done');

            // Advance time by 31 seconds
            act(() => {
                vi.advanceTimersByTime(31000);
            });

            // Job is now cleaned up from active list and moved to history, so QueueItem is unmounted
            expect(screen.queryByTestId('debug-copy-btn-job-1')).not.toBeInTheDocument();
        });

        it('clears completion retention timer and entry if a job is retried/goes active again', () => {
            const initialQueue = [
                {
                    id: 'job-1',
                    status: 'running',
                    progress: 0.5,
                    project_name: 'Test Project',
                    started_at: 1000,
                    eta_seconds: 30,
                    type: 'chapter_generation',
                    engine: 'xtts',
                }
            ];

            const { rerender } = render(
                <GlobalQueue
                    paused={false}
                    queue={initialQueue as any}
                />
            );

            // Transition to done
            const updatedQueue = [
                {
                    id: 'job-1',
                    status: 'done',
                    progress: 1.0,
                    project_name: 'Test Project',
                    started_at: 1000,
                    eta_seconds: 0,
                    type: 'chapter_generation',
                    engine: 'xtts',
                }
            ];

            rerender(
                <GlobalQueue
                    paused={false}
                    queue={updatedQueue as any}
                />
            );

            // Retrying the job, transitions to running again at t = 5000
            act(() => {
                vi.advanceTimersByTime(5000);
            });

            const runningAgainQueue = [
                {
                    id: 'job-1',
                    status: 'running',
                    progress: 0.1,
                    project_name: 'Test Project',
                    started_at: 1100,
                    eta_seconds: 40,
                    type: 'chapter_generation',
                    engine: 'xtts',
                }
            ];

            rerender(
                <GlobalQueue
                    paused={false}
                    queue={runningAgainQueue as any}
                />
            );

            // Transition to done again (starts retention timer 2) at t = 10000
            act(() => {
                vi.advanceTimersByTime(5000);
            });

            const updatedQueue2 = [
                {
                    id: 'job-1',
                    status: 'done',
                    progress: 1.0,
                    project_name: 'Test Project',
                    started_at: 1100,
                    eta_seconds: 0,
                    type: 'chapter_generation',
                    engine: 'xtts',
                }
            ];

            rerender(
                <GlobalQueue
                    paused={false}
                    queue={updatedQueue2 as any}
                />
            );

            // Advance time by 25 seconds (virtual time is now 35000)
            // If timer 1 (scheduled for t = 30000) was NOT cleared, it would have fired at t = 30000 and unmounted the job.
            // If timer 1 WAS cleared, the job should still be present because timer 2 doesn't fire until t = 40000.
            act(() => {
                vi.advanceTimersByTime(25000);
            });

            // Job must still be in the active list
            expect(screen.getByTestId('debug-copy-btn-job-1')).toBeInTheDocument();

            // Advance time by another 10 seconds (virtual time is now 45000)
            // Now retention timer 2 should fire, and the job should be unmounted.
            act(() => {
                vi.advanceTimersByTime(10000);
            });

            expect(screen.queryByTestId('debug-copy-btn-job-1')).not.toBeInTheDocument();
        });

        it('clears completion retention timer and entry if a job is removed/cancelled from the queue', () => {
            const initialQueue = [
                {
                    id: 'job-1',
                    status: 'running',
                    progress: 0.5,
                    project_name: 'Test Project',
                    started_at: 1000,
                    eta_seconds: 30,
                    type: 'chapter_generation',
                    engine: 'xtts',
                }
            ];

            const { rerender } = render(
                <GlobalQueue
                    paused={false}
                    queue={initialQueue as any}
                />
            );

            // Transition to done
            const updatedQueue = [
                {
                    id: 'job-1',
                    status: 'done',
                    progress: 1.0,
                    project_name: 'Test Project',
                    started_at: 1000,
                    eta_seconds: 0,
                    type: 'chapter_generation',
                    engine: 'xtts',
                }
            ];

            rerender(
                <GlobalQueue
                    paused={false}
                    queue={updatedQueue as any}
                />
            );

            // Job is done and retained. Remove the job from the queue completely at t = 5000
            act(() => {
                vi.advanceTimersByTime(5000);
            });

            rerender(
                <GlobalQueue
                    paused={false}
                    queue={[]}
                />
            );

            // Add the job back as running at t = 10000
            act(() => {
                vi.advanceTimersByTime(5000);
            });

            const runningAgainQueue = [
                {
                    id: 'job-1',
                    status: 'running',
                    progress: 0.1,
                    project_name: 'Test Project',
                    started_at: 1100,
                    eta_seconds: 40,
                    type: 'chapter_generation',
                    engine: 'xtts',
                }
            ];

            rerender(
                <GlobalQueue
                    paused={false}
                    queue={runningAgainQueue as any}
                />
            );

            // Transition to done again (starts retention timer 2) at t = 15000
            act(() => {
                vi.advanceTimersByTime(5000);
            });

            const updatedQueue2 = [
                {
                    id: 'job-1',
                    status: 'done',
                    progress: 1.0,
                    project_name: 'Test Project',
                    started_at: 1100,
                    eta_seconds: 0,
                    type: 'chapter_generation',
                    engine: 'xtts',
                }
            ];

            rerender(
                <GlobalQueue
                    paused={false}
                    queue={updatedQueue2 as any}
                />
            );

            // Advance time by 20 seconds (virtual time is now 35000)
            // If timer 1 (scheduled for t = 30000) was NOT cleared, it would have fired at t = 30000 and unmounted the job.
            // If timer 1 WAS cleared, the job should still be present because timer 2 doesn't fire until t = 45000.
            act(() => {
                vi.advanceTimersByTime(20000);
            });

            // Job must still be in the active list
            expect(screen.getByTestId('debug-copy-btn-job-1')).toBeInTheDocument();

            // Advance time by another 15 seconds (virtual time is now 50000)
            // Now retention timer 2 should fire, and the job should be unmounted.
            act(() => {
                vi.advanceTimersByTime(15000);
            });

            expect(screen.queryByTestId('debug-copy-btn-job-1')).not.toBeInTheDocument();
        });
    });
});
