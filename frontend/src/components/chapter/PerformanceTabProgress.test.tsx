import { render, screen, within, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PerformanceTab } from './PerformanceTab';
import { mockSegments, mockCharacters } from './PerformanceTabTestMocks';

describe('PerformanceTab - Progress', () => {
  it('highlights only the active segment group for a live job', () => {
    const activeJob = {
      id: 'job-1',
      status: 'running',
      active_segment_id: 'seg-2',
      active_segment_progress: 0.5
    } as any;

    render(
      <PerformanceTab 
        chunkGroups={[
          { characterId: 'char-1', segments: [mockSegments[0]] },
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
        generatingJob={activeJob}
        segmentProgress={{
          'seg-2': { job_id: 'job-1', segment_id: 'seg-2', progress: 0.5 }
        } as any}
      />
    );

    const activeCard = screen.getByText('Sentence two.').closest('div[style*="background: var(--surface)"]');
    const inactiveCard = screen.getByText('Sentence one.').closest('div[style*="background: var(--surface)"]');

    expect(activeCard).toBeTruthy();
    expect(inactiveCard).toBeTruthy();
    expect(within(activeCard as HTMLElement).getAllByText('50%').length).toBeGreaterThan(0);
    expect(within(inactiveCard as HTMLElement).queryByText('50%')).toBeNull();
  });

  it('falls back to learned job progress until active segment progress arrives', () => {
    const activeJob = {
      id: 'job-1',
      status: 'running',
      engine: 'xtts',
      active_segment_id: null,
      active_segment_progress: undefined,
      started_at: Date.now() / 1000 - 20,
      eta_seconds: 100,
      progress: 0.72
    } as any;

    render(
      <PerformanceTab 
        chunkGroups={[
          { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'unprocessed' }] },
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
        generatingJob={activeJob}
      />
    );

    const activeCard = screen.getByText('Sentence one.').closest('div[style*="background: var(--surface)"]');
    expect(activeCard).toBeTruthy();
    expect(within(activeCard as HTMLElement).getByText('72%')).toBeInTheDocument();
    expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '72');
  });

  it('does not use chapter/job prediction for a mixed-engine segment once an active segment is known', () => {
    const activeJob = {
      id: 'job-mixed-1',
      status: 'running',
      engine: 'mixed',
      active_segment_id: 'seg-1',
      active_segment_progress: 0,
      started_at: Date.now() / 1000 - 20,
      eta_seconds: 100,
      progress: 0.72
    } as any;

    render(
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
        generatingJob={activeJob}
        segmentProgress={{} as any}
      />
    );

    const activeCard = screen.getByText('Sentence one.').closest('div[style*="background: var(--surface)"]');
    expect(activeCard).toBeTruthy();
    expect(within(activeCard as HTMLElement).queryByText('72%')).toBeNull();
    expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '0');
    expect(within(activeCard as HTMLElement).getByText('0%')).toBeInTheDocument();
  });

  it('shows a determinate progress bar for running mixed segment jobs even before the first nonzero checkpoint', () => {
    vi.useFakeTimers();
    const activeJob = {
      id: 'job-mixed-2',
      status: 'running',
      engine: 'mixed',
      active_segment_id: 'seg-1',
      active_segment_progress: 0,
      started_at: Date.now() / 1000 - 5,
      eta_seconds: 57,
      progress: 0.05
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

    expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '0');
    expect(screen.queryByText('Working...')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(Number(screen.getByTestId('performance-progress-0').getAttribute('data-progress'))).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it('shows Voxtral jobs as indeterminate while running instead of predictive percentages', () => {
    const activeJob = {
      id: 'job-vox-1',
      status: 'running',
      engine: 'voxtral',
      active_segment_id: null,
      active_segment_progress: undefined,
      started_at: Date.now() / 1000 - 20,
      eta_seconds: 100,
      progress: 1
    } as any;

    render(
      <PerformanceTab
        chunkGroups={[
          { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'unprocessed' }] }
        ]}
        characters={mockCharacters}
        playingSegmentId={null}
        playbackQueue={['seg-1']}
        generatingSegmentIds={new Set()}
        allSegmentIds={['seg-1']}
        segments={mockSegments}
        onPlay={vi.fn()}
        onStop={vi.fn()}
        onGenerate={vi.fn()}
        generatingJob={activeJob}
      />
    );

    expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '0');
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('shows mixed segment jobs as determinate progress when real segment progress is present', () => {
    const activeJob = {
      id: 'job-mixed-seg-1',
      status: 'running',
      engine: 'mixed',
      segment_ids: ['seg-1', 'seg-2'],
      active_segment_id: 'seg-1',
      active_segment_progress: 0.2,
      started_at: Date.now() / 1000 - 20,
      eta_seconds: 100,
      progress: 0.05,
      custom_title: 'Chapter 1: segment #3'
    } as any;

    render(
      <PerformanceTab
        chunkGroups={[
          { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'unprocessed' }] }
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
      />
    );

    expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '20');
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.queryByText('Working...')).toBeNull();
  });

  it('pins Voxtral jobs at 100% while finalizing', () => {
    const activeJob = {
      id: 'job-vox-2',
      status: 'finalizing',
      engine: 'voxtral',
      active_segment_id: null,
      active_segment_progress: undefined
    } as any;

    render(
      <PerformanceTab
        chunkGroups={[
          { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'unprocessed' }] }
        ]}
        characters={mockCharacters}
        playingSegmentId={null}
        playbackQueue={['seg-1']}
        generatingSegmentIds={new Set()}
        allSegmentIds={['seg-1']}
        segments={mockSegments}
        onPlay={vi.fn()}
        onStop={vi.fn()}
        onGenerate={vi.fn()}
        generatingJob={activeJob}
      />
    );

    expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '100');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
