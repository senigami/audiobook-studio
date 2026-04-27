import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PerformanceTab } from './PerformanceTab';
import { mockSegments, mockCharacters } from './PerformanceTabTestMocks';

describe('PerformanceTab - Lifecycle', () => {
  it('lets a completed segment linger at 100% before clearing when the job advances', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] },
            { characterId: null, segments: [mockSegments[1]] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1', 'seg-2']}
          generatingSegmentIds={new Set()}
          allSegmentIds={['seg-1', 'seg-2']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={{
            id: 'job-1',
            status: 'running',
            active_segment_id: 'seg-1',
            active_segment_progress: 0.92
          } as any}
        />
      );

      expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '92');

      rerender(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'done' }] },
            { characterId: null, segments: [{ ...mockSegments[1], audio_status: 'processing' }] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1', 'seg-2']}
          generatingSegmentIds={new Set()}
          allSegmentIds={['seg-1', 'seg-2']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={{
            id: 'job-1',
            status: 'running',
            active_segment_id: 'seg-2',
            active_segment_progress: 0.08
          } as any}
        />
      );

      expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '100');

      act(() => {
        vi.advanceTimersByTime(700);
      });

      expect(screen.queryByTestId('performance-progress-0')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reuse a stale 100% settle state when a new local generate starts', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] },
            { characterId: null, segments: [mockSegments[1]] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1', 'seg-2']}
          generatingSegmentIds={new Set()}
          allSegmentIds={['seg-1', 'seg-2']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={{
            id: 'job-1',
            status: 'running',
            active_segment_id: 'seg-1',
            active_segment_progress: 0.95
          } as any}
        />
      );

      rerender(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'done', audio_file_path: '/audio/1.wav' }] },
            { characterId: null, segments: [{ ...mockSegments[1], audio_status: 'processing' }] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1', 'seg-2']}
          generatingSegmentIds={new Set()}
          allSegmentIds={['seg-1', 'seg-2']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={{
            id: 'job-1',
            status: 'running',
            active_segment_id: 'seg-2',
            active_segment_progress: 0.08
          } as any}
        />
      );

      expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '100');

      rerender(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] },
            { characterId: null, segments: [mockSegments[1]] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1', 'seg-2']}
          generatingSegmentIds={new Set(['seg-1'])}
          allSegmentIds={['seg-1', 'seg-2']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
        />
      );

      expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '0');
      expect(screen.getByText('Working...')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a moving partial bar during indeterminate work instead of a full-width fill', () => {
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
        generatingJob={{
          id: 'job-queued',
          status: 'queued',
          progress: 0,
          active_segment_id: null,
          active_segment_progress: 0
        } as any}
      />
    );

    expect(screen.getByText('Working...')).toBeInTheDocument();
    expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '0');
    expect(screen.getByTestId('performance-progress-0')).toHaveStyle({ width: '28%' });
    expect(screen.getByTestId('performance-progress-0')).toHaveClass('progress-bar-pending');
  });

  it('keeps sibling queued groups visibly queued instead of reverting to generate', () => {
    render(
      <PerformanceTab
        chunkGroups={[
          { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'unprocessed' }] },
          { characterId: null, segments: [{ ...mockSegments[1], audio_status: 'processing' }] }
        ]}
        characters={mockCharacters}
        playingSegmentId={null}
        playbackQueue={['seg-1', 'seg-2']}
        generatingSegmentIds={new Set()}
        queuedSegmentIds={new Set(['seg-1'])}
        allSegmentIds={['seg-1', 'seg-2']}
        segments={mockSegments}
        onPlay={vi.fn()}
        onStop={vi.fn()}
        onGenerate={vi.fn()}
        generatingJob={{
          id: 'job-running',
          status: 'running',
          segment_ids: ['seg-2'],
          active_segment_id: 'seg-2',
          active_segment_progress: 0.5
        } as any}
      />
    );

    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.queryByText('Generate')).toBeNull();
  });

  it('keeps a live chapter-level job visibly attached even when all groups were already done', () => {
    render(
      <PerformanceTab
        chunkGroups={[
          { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'done', audio_file_path: 'seg-1.wav' }] },
          { characterId: null, segments: [{ ...mockSegments[1], audio_status: 'done', audio_file_path: 'seg-2.wav' }] }
        ]}
        characters={mockCharacters}
        playingSegmentId={null}
        playbackQueue={['seg-1', 'seg-2']}
        generatingSegmentIds={new Set()}
        allSegmentIds={['seg-1', 'seg-2']}
        segments={[
          { ...mockSegments[0], audio_status: 'done', audio_file_path: 'seg-1.wav' } as any,
          { ...mockSegments[1], audio_status: 'done', audio_file_path: 'seg-2.wav' } as any
        ]}
        onPlay={vi.fn()}
        onStop={vi.fn()}
        onGenerate={vi.fn()}
        generatingJob={{
          id: 'job-voxtral',
          status: 'preparing',
          progress: 0,
          active_segment_id: null,
          active_segment_progress: 0
        } as any}
      />
    );

    expect(screen.getByText('Working...')).toBeInTheDocument();
    expect(screen.getByTestId('performance-progress-0')).toBeInTheDocument();
  });
});
