/**
 * Task 011 — ActivityPage peek-strip integration: auto-appear on ≥2
 * concurrently rendering segments, inline expand to the full field, dismiss
 * persistence, and re-surfacing on a new failure even after a prior dismiss.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ActivityPage from '@/pages/Activity/ActivityPage';
import type { Job, ProcessingQueueItem } from '@/types';
import type { SegmentRenderMonitorSegment } from '@/components/progress/SegmentRenderMonitor/SegmentBlockRow';
import { setDevModeEnabled } from '@/utils/devMode';

vi.mock('@/api', () => ({
  api: {
    toggleQueuePause: vi.fn().mockResolvedValue({}),
    reorderProcessingQueue: vi.fn().mockResolvedValue({}),
    removeProcessingQueue: vi.fn().mockResolvedValue({}),
    clearCompletedJobs: vi.fn().mockResolvedValue({}),
    clearProcessingQueue: vi.fn().mockResolvedValue({}),
    cancelChapterGeneration: vi.fn().mockResolvedValue({}),
    generateSegments: vi.fn().mockResolvedValue({}),
    fetchHome: vi.fn().mockResolvedValue({
      render_stats: {
        sample_count: 0, word_count: 0, chars: 0, audio_duration_seconds: 0,
        render_duration_seconds: 0, audio_hours_rendered: 0, render_hours_spent: 0,
        since_timestamp: 0, by_engine: [],
      },
    }),
  },
}));

let mockSegments: SegmentRenderMonitorSegment[] = [];
vi.mock('@/hooks/useSegmentInventory', () => ({
  useSegmentInventory: () => ({ segments: mockSegments, loading: false }),
}));

function makeSegments(n: number, overrides: Partial<SegmentRenderMonitorSegment>[] = []): SegmentRenderMonitorSegment[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `seg-${i}`,
    charCount: 100 + i,
    phase: 'done' as const,
    progress: 1,
    ...(overrides[i] ?? {}),
  }));
}

const activeJob: Job = {
  id: 'job-active',
  status: 'running',
  split_part: 0,
  created_at: 1710000000,
  completed_at: null,
  chapter_id: 'chapter-1',
  chapter_title: 'Active Chapter',
  project_name: 'Project Alpha',
  progress: 0.5,
  eta_seconds: 120,
} as Job;

const queue: ProcessingQueueItem[] = [];

function renderPage() {
  return render(
    <MemoryRouter>
      <ActivityPage
        paused={false}
        jobs={{ [activeJob.id]: activeJob }}
        queue={queue}
        loading={false}
        connected
        isReconnecting={false}
        engines={[]}
        onRefresh={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe('ActivityPage — task 011 peek strip', () => {
  beforeEach(() => {
    localStorage.clear();
    setDevModeEnabled(true);
    mockSegments = [];
  });

  afterEach(() => {
    setDevModeEnabled(false);
    localStorage.clear();
  });

  it('does not show the peek strip when fewer than 2 segments are concurrently rendering', () => {
    mockSegments = makeSegments(12, [{ phase: 'rendering', progress: 0.4 }]);
    renderPage();
    expect(screen.queryByRole('button', { name: /expand segment render detail/i })).toBeNull();
    // Full field shows directly since concurrency is below the peek threshold.
    expect(screen.getByText(/1 rendering in parallel/i)).toBeInTheDocument();
  });

  it('auto-appears as a peek strip (not the full field) when ≥2 segments are concurrently rendering', () => {
    mockSegments = makeSegments(12, [{ phase: 'rendering', progress: 0.3 }, { phase: 'rendering', progress: 0.6 }]);
    renderPage();
    expect(screen.getByRole('button', { name: /expand segment render detail/i })).toBeInTheDocument();
    // The full-field caption text should not be present yet — only the strip.
    expect(screen.queryByText(/2 rendering in parallel \(cap/i)).toBeNull();
  });

  it('expands inline to the full field on click, with no navigation', () => {
    mockSegments = makeSegments(12, [{ phase: 'rendering', progress: 0.3 }, { phase: 'rendering', progress: 0.6 }]);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /expand segment render detail/i }));
    expect(screen.queryByRole('button', { name: /expand segment render detail/i })).toBeNull();
    expect(screen.getByText(/2 rendering in parallel \(cap/i)).toBeInTheDocument();
  });

  it('persists dismissal across a remount (localStorage) and does not re-show the strip', () => {
    mockSegments = makeSegments(12, [{ phase: 'rendering', progress: 0.3 }, { phase: 'rendering', progress: 0.6 }]);
    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: /dismiss segment render peek strip/i }));
    expect(screen.queryByRole('button', { name: /expand segment render detail/i })).toBeNull();
    unmount();

    renderPage();
    expect(screen.queryByRole('button', { name: /expand segment render detail/i })).toBeNull();
  });

  it('re-surfaces the peek strip when a new failure appears, even after a prior dismiss', () => {
    mockSegments = makeSegments(12, [{ phase: 'rendering', progress: 0.3 }, { phase: 'rendering', progress: 0.6 }]);
    const { rerender } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: /dismiss segment render peek strip/i }));
    expect(screen.queryByRole('button', { name: /expand segment render detail/i })).toBeNull();

    // A segment now fails — the strip must re-surface despite the dismiss.
    mockSegments = makeSegments(12, [
      { phase: 'rendering', progress: 0.3 },
      { phase: 'rendering', progress: 0.6 },
      { phase: 'failed', progress: 0.2 },
    ]);
    rerender(
      <MemoryRouter>
        <ActivityPage
          paused={false}
          jobs={{ [activeJob.id]: activeJob }}
          queue={queue}
          loading={false}
          connected
          isReconnecting={false}
          engines={[]}
          onRefresh={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /expand segment render detail/i })).toBeInTheDocument();
  });
});
