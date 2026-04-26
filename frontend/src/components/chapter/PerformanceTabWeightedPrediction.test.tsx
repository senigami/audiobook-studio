import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PerformanceTab } from './PerformanceTab';
import { mockSegments, mockCharacters } from './PerformanceTabTestMocks';

describe('PerformanceTab - Weighted Prediction', () => {
  it('uses render-group weights to predict active mixed segment progress between sparse checkpoints', () => {
    vi.useFakeTimers();
    try {
      const activeJob = {
        id: 'job-mixed-weighted-1',
        status: 'running',
        engine: 'mixed',
        active_segment_id: 'seg-1',
        active_segment_progress: 0.1,
        started_at: Date.now() / 1000 - 40,
        eta_seconds: 100,
        progress: 0.37,
        total_render_weight: 100,
        completed_render_weight: 20,
        active_render_group_weight: 40
      } as any;

      render(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1']}
          generatingSegmentIds={new Set(['seg-1'])}
          allSegmentIds={['seg-1']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={activeJob}
          segmentProgress={{} as any}
        />
      );

      expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '42');
      expect(screen.getByText('42%')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats backend mixed segment checkpoints as a floor over weighted prediction', () => {
    vi.useFakeTimers();
    try {
      const activeJob = {
        id: 'job-mixed-weighted-floor',
        status: 'running',
        engine: 'mixed',
        active_segment_id: 'seg-1',
        active_segment_progress: 0.75,
        started_at: Date.now() / 1000 - 25,
        eta_seconds: 100,
        progress: 0.37,
        total_render_weight: 100,
        completed_render_weight: 20,
        active_render_group_weight: 40
      } as any;

      render(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1']}
          generatingSegmentIds={new Set(['seg-1'])}
          allSegmentIds={['seg-1']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={activeJob}
          segmentProgress={{} as any}
        />
      );

      expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '75');
      expect(screen.getByText('75%')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let a tiny final mixed render group instantly sprint to completion', () => {
    vi.useFakeTimers();
    try {
      const activeJob = {
        id: 'job-mixed-final-group',
        status: 'running',
        engine: 'mixed',
        active_segment_id: 'seg-1',
        active_segment_progress: 0,
        started_at: Date.now() / 1000 - 79,
        eta_seconds: 68,
        progress: 0.9,
        grouped_progress: 0.95,
        total_render_weight: 1000,
        completed_render_weight: 970,
        active_render_group_weight: 30
      } as any;

      render(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1']}
          generatingSegmentIds={new Set(['seg-1'])}
          allSegmentIds={['seg-1']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={activeJob}
          segmentProgress={{} as any}
        />
      );

      expect(Number(screen.getByTestId('performance-progress-0').getAttribute('data-progress'))).toBeLessThan(25);
    } finally {
      vi.useRealTimers();
    }
  });
});
