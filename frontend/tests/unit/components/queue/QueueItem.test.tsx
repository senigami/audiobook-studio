import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueueItem } from '@/components/queue/QueueItem';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock PredictiveProgressBar so we can inspect its props
vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({
    progress,
    label,
    dataTestId,
    updatedAt,
    etaSeconds,
    evidenceWeightFraction
  }: any) => (
    <div
      data-testid={dataTestId || "progress-bar"}
      data-progress={progress}
      data-updatedat={updatedAt}
      data-etaseconds={etaSeconds}
      data-confidence={evidenceWeightFraction}
    >
      {label}
    </div>
  )
}));

describe('QueueItem Stable ETA TDD', () => {
  const defaultProps = {
    job: {
      id: 'job-1',
      status: 'running',
      chapter_title: 'Chapter 1',
      project_name: 'Project A',
      split_part: 0,
      started_at: 1000,
      updated_at: 1000,
    } as any,
    localPaused: false,
    formatJobTitle: (j: any) => j.chapter_title,
    formatTime: () => '10:00',
    onRemove: vi.fn(),
  };

  it('preserves ETA anchor when a boundary frame has null eta_seconds', () => {
    // 1. Initial render with positive eta_seconds
    const { rerender } = render(
      <QueueItem
        {...defaultProps}
        liveJob={{
          id: 'job-1',
          status: 'running',
          eta_seconds: 30,
          updated_at: 1000,
          started_at: 1000,
        } as any}
      />
    );

    let progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-etaseconds')).toBe('30');
    expect(progressBar.getAttribute('data-updatedat')).toBe('1000');

    // 2. Re-render with eta_seconds null, but newer updated_at
    rerender(
      <QueueItem
        {...defaultProps}
        liveJob={{
          id: 'job-1',
          status: 'running',
          eta_seconds: null,
          updated_at: 1100, // T2 > T1
          started_at: 1000,
        } as any}
      />
    );

    progressBar = screen.getByTestId('queue-item-progress-bar');
    // etaSeconds should stay 30 (since it was held as stable ETA)
    expect(progressBar.getAttribute('data-etaseconds')).toBe('30');
    // The ETA anchor must stay with the last positive ETA update. Advancing it
    // with the same ETA would extend/freeze the visible countdown.
    expect(progressBar.getAttribute('data-updatedat')).toBe('1000');
  });

  it('advances ETA anchor when a newer positive live ETA arrives', () => {
    const { rerender } = render(
      <QueueItem
        {...defaultProps}
        liveJob={{
          id: 'job-1',
          status: 'running',
          eta_seconds: 30,
          updated_at: 1000,
          started_at: 1000,
        } as any}
      />
    );

    rerender(
      <QueueItem
        {...defaultProps}
        liveJob={{
          id: 'job-1',
          status: 'running',
          eta_seconds: 22,
          updated_at: 1100,
          started_at: 1000,
        } as any}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-etaseconds')).toBe('22');
    expect(progressBar.getAttribute('data-updatedat')).toBe('1100');
  });

  it('ignores placeholder zero active segment progress when voice build has no active segment id', () => {
    render(
      <QueueItem
        {...defaultProps}
        job={{
          ...defaultProps.job,
          engine: 'voice_build',
          progress: 0.7,
          eta_seconds: 15,
          eta_updated_at: 3000,
          updated_at: 3000,
        } as any}
        liveJob={{
          id: 'job-1',
          status: 'running',
          engine: 'voice_build',
          progress: 0.7,
          active_segment_progress: 0,
          active_segment_id: null,
          eta_seconds: null,
          started_at: 1000,
          updated_at: 3000,
        } as any}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-progress')).toBe('0.7');
    expect(progressBar.getAttribute('data-etaseconds')).toBe('15');
  });

  it('QueueItem countdown uses chapter/job eta_seconds only, not active_segment_eta_seconds', () => {
    render(
      <QueueItem
        {...defaultProps}
        liveJob={{
          id: 'job-1',
          status: 'running',
          eta_seconds: null,
          active_segment_eta_seconds: 25, // segment ETA should NOT leak into QueueItem
          updated_at: 1000,
          started_at: 1000,
        } as any}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    // etaSeconds should be null/empty, definitely NOT 25
    expect(progressBar.getAttribute('data-etaseconds')).not.toBe('25');
  });

  it('uses eta_updated_at, not generic updated_at, for remaining_from_update countdown', () => {
    render(
      <QueueItem
        {...defaultProps}
        liveJob={{
          id: 'job-1',
          status: 'running',
          eta_seconds: 30,
          eta_updated_at: 1000,
          updated_at: 1010,
          started_at: 1000,
        } as any}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-updatedat')).toBe('1000');
  });

  it('ignores stale eta_updated_at when eta_seconds is null', () => {
    render(
      <QueueItem
        {...defaultProps}
        liveJob={{
          id: 'job-1',
          status: 'running',
          eta_seconds: null,
          eta_updated_at: 1000,
          updated_at: 1010,
          started_at: 1000,
        } as any}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-etaseconds')).not.toBe('25');
    expect(progressBar.getAttribute('data-updatedat')).toBe('1010');
  });

  it('prefers job ETA when job eta_updated_at is fresher than liveJob eta_updated_at', () => {
    render(
      <QueueItem
        {...defaultProps}
        job={{
          ...defaultProps.job,
          eta_seconds: 40,
          eta_updated_at: 2000,
          updated_at: 2000,
        }}
        liveJob={{
          id: 'job-1',
          status: 'running',
          eta_seconds: 30,
          eta_updated_at: 1000,
          updated_at: 1000,
          started_at: 1000,
        } as any}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-etaseconds')).toBe('40');
    expect(progressBar.getAttribute('data-updatedat')).toBe('2000');
  });

  it('prefers liveJob ETA when liveJob eta_updated_at is fresher than job eta_updated_at', () => {
    render(
      <QueueItem
        {...defaultProps}
        job={{
          ...defaultProps.job,
          eta_seconds: 40,
          eta_updated_at: 1000,
          updated_at: 1000,
        }}
        liveJob={{
          id: 'job-1',
          status: 'running',
          eta_seconds: 30,
          eta_updated_at: 2000,
          updated_at: 2000,
          started_at: 1000,
        } as any}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-etaseconds')).toBe('30');
    expect(progressBar.getAttribute('data-updatedat')).toBe('2000');
  });

  it('falls back to updated_at when eta_updated_at is absent and prefers the fresher source', () => {
    render(
      <QueueItem
        {...defaultProps}
        job={{
          ...defaultProps.job,
          eta_seconds: 40,
          updated_at: 2000,
        }}
        liveJob={{
          id: 'job-1',
          status: 'running',
          eta_seconds: 30,
          updated_at: 1000,
          started_at: 1000,
        } as any}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-etaseconds')).toBe('40');
    expect(progressBar.getAttribute('data-updatedat')).toBe('2000');
  });

  it('QueueItem: propagates confidence correctly', () => {
    render(
      <QueueItem
        {...defaultProps}
        job={{
          ...defaultProps.job,
          confidence: 0.35,
        }}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-confidence')).toBe('0.35');
  });

  it('QueueItem: preserves START_SEGMENT progress 0 with confidence 1.0', () => {
    render(
      <QueueItem
        {...defaultProps}
        job={{
          ...defaultProps.job,
          reason_code: 'segment_start',
          progress: 0,
          confidence: 1.0,
        }}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-confidence')).toBe('1');
  });

  it('QueueItem: uses job confidence when etaSource resolves to job', () => {
    render(
      <QueueItem
        {...defaultProps}
        job={{
          ...defaultProps.job,
          eta_seconds: 40,
          eta_updated_at: 2000,
          updated_at: 2000,
          confidence: 0.22,
        }}
        liveJob={{
          id: 'job-1',
          status: 'running',
          eta_seconds: 30,
          eta_updated_at: 1000,
          updated_at: 1000,
          started_at: 1000,
          confidence: 0.99,
        } as any}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-confidence')).toBe('0.22');
  });

  it('QueueItem: uses liveJob confidence when etaSource resolves to liveJob', () => {
    render(
      <QueueItem
        {...defaultProps}
        job={{
          ...defaultProps.job,
          eta_seconds: 40,
          eta_updated_at: 1000,
          updated_at: 1000,
          confidence: 0.22,
        }}
        liveJob={{
          id: 'job-1',
          status: 'running',
          eta_seconds: 30,
          eta_updated_at: 2000,
          updated_at: 2000,
          started_at: 1000,
          confidence: 0.99,
        } as any}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-confidence')).toBe('0.99');
  });

  it('QueueItem debug copy includes selected confidence and the real evidenceWeightFraction', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <QueueItem
        {...defaultProps}
        job={{
          ...defaultProps.job,
          eta_seconds: 40,
          eta_updated_at: 2000,
          updated_at: 2000,
          confidence: 0.22,
        }}
        liveJob={{
          id: 'job-1',
          status: 'running',
          eta_seconds: 30,
          eta_updated_at: 1000,
          updated_at: 1000,
          started_at: 1000,
          confidence: 0.99,
        } as any}
      />
    );

    fireEvent.click(screen.getByTestId('debug-copy-btn-job-1'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(writeText.mock.calls[0][0]);

    expect(payload.evidenceWeightFraction).toBe(0.22);
    expect(payload.confidence).toBe(0.22);
    expect(payload.job.confidence).toBe(0.22);
    expect(payload.liveJob.confidence).toBe(0.99);
    expect(payload.etaSelectionDebug.job.confidence).toBe(0.22);
    expect(payload.etaSelectionDebug.liveJob.confidence).toBe(0.99);
  });

  it('preserves progress on done/completed jobs instead of forcing to 0', () => {
    // Done job with progress in job state
    render(
      <QueueItem
        {...defaultProps}
        job={{
          ...defaultProps.job,
          status: 'done',
          progress: 0.85,
        }}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-progress')).toBe('0.85');
  });

  it('keeps failed or cancelled jobs at their last known progress without promoting to 100%', () => {
    render(
      <QueueItem
        {...defaultProps}
        job={{
          ...defaultProps.job,
          status: 'failed',
          progress: 0.44,
        }}
      />
    );

    const progressBar = screen.getByTestId('queue-item-progress-bar');
    expect(progressBar.getAttribute('data-progress')).toBe('0.44');
  });
});
