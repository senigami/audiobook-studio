/**
 * Task 011 — per-row segment peek strip / render monitor: auto-appear on ≥2
 * concurrently rendering segments, inline expand to the full field, dismiss
 * persistence, and re-surfacing on a new failure even after a prior dismiss.
 *
 * W-PAR task 015 moved this behavior from a single page-level "active job"
 * strip (`ActivityPage.tsx`) into each `QueueItem` row, so this test now
 * exercises `QueueItem` directly rather than `ActivityPage`. Per
 * testing-standards.md R2, `useSegmentInventory` is exercised for real; only
 * `api.fetchScriptView` (the true network boundary) is mocked.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueueItem } from '@/components/queue/QueueItem';
import type { Job, ProcessingQueueItem, ScriptSpan } from '@/types';
import { setDevModeEnabled } from '@/utils/devMode';

vi.mock('@/api', () => ({
  api: {
    generateSegments: vi.fn().mockResolvedValue({}),
    fetchScriptView: vi.fn(),
  },
}));

import { api } from '@/api';

vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
  PredictiveProgressBar: () => <div data-testid="progress-bar" />,
}));

function makeSpans(n: number, phases: Array<'rendering' | 'done' | 'failed'> = []): ScriptSpan[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `seg-${i}`,
    order_index: i,
    text: `span ${i}`,
    sanitized_text: `span ${i}`,
    character_id: null,
    speaker_profile_name: null,
    status: (phases[i] === 'done' || !phases[i]) ? 'done' : 'processing',
    audio_file_path: null,
    audio_generated_at: null,
    char_count: 100 + i,
    sanitized_char_count: 100 + i,
  }));
}

function activeSegmentsMapFrom(phases: Array<'rendering' | 'done' | 'failed'>): Record<string, any> {
  const map: Record<string, any> = {};
  phases.forEach((phase, i) => {
    if (phase === 'rendering' || phase === 'failed') {
      map[`seg-${i}`] = { phase, progress: phase === 'failed' ? 0.2 : 0.4, char_count: 100 + i };
    }
  });
  return map;
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

function renderItem(phases: Array<'rendering' | 'done' | 'failed'>) {
  vi.mocked(api.fetchScriptView).mockResolvedValue({
    chapter_id: 'chapter-1',
    base_revision_id: null,
    paragraphs: [],
    spans: makeSpans(12, phases),
  } as any);

  const liveJob: Job = { ...activeJob, active_segments_map: activeSegmentsMapFrom(phases) };

  return render(
    <QueueItem
      job={activeJob as unknown as ProcessingQueueItem}
      liveJob={liveJob}
      localPaused={false}
      formatJobTitle={(j: any) => j.chapter_title}
      formatTime={() => '10:00'}
      onRemove={vi.fn()}
    />,
  );
}

describe('QueueItem — task 011/015 peek strip (per-row)', () => {
  beforeEach(() => {
    localStorage.clear();
    setDevModeEnabled(true);
  });

  afterEach(() => {
    setDevModeEnabled(false);
    localStorage.clear();
  });

  it('does not show the peek strip when fewer than 2 segments are concurrently rendering', async () => {
    renderItem(['rendering']);
    await waitFor(() => {
      expect(screen.getByText(/1 rendering in parallel/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /expand batch render detail/i })).toBeNull();
  });

  it('auto-appears as a peek strip (not the full field) when ≥2 segments are concurrently rendering', async () => {
    renderItem(['rendering', 'rendering']);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand batch render detail/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/2 rendering in parallel \(cap/i)).toBeNull();
  });

  it('expands inline to the full field on click, with no navigation', async () => {
    renderItem(['rendering', 'rendering']);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand batch render detail/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /expand batch render detail/i }));
    expect(screen.queryByRole('button', { name: /expand batch render detail/i })).toBeNull();
    expect(screen.getByText(/2 rendering in parallel \(cap/i)).toBeInTheDocument();
  });

  it('persists dismissal across a remount (localStorage) and does not re-show the strip', async () => {
    const { unmount } = renderItem(['rendering', 'rendering']);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /dismiss batch render peek strip/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /dismiss batch render peek strip/i }));
    expect(screen.queryByRole('button', { name: /expand batch render detail/i })).toBeNull();
    unmount();

    const { container } = renderItem(['rendering', 'rendering']);
    await waitFor(() => {
      expect(api.fetchScriptView).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: /expand batch render detail/i })).toBeNull();
    expect(container.querySelector('.segment-peek-strip')).toBeNull();
  });

  it('re-surfaces the peek strip when a new failure appears, even after a prior dismiss', async () => {
    const { rerender } = renderItem(['rendering', 'rendering']);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /dismiss batch render peek strip/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /dismiss batch render peek strip/i }));
    expect(screen.queryByRole('button', { name: /expand batch render detail/i })).toBeNull();

    // A segment now fails — the strip must re-surface despite the dismiss.
    vi.mocked(api.fetchScriptView).mockResolvedValue({
      chapter_id: 'chapter-1',
      base_revision_id: null,
      paragraphs: [],
      spans: makeSpans(12, ['rendering', 'rendering', 'failed']),
    } as any);
    const liveJob: Job = {
      ...activeJob,
      active_segments_map: activeSegmentsMapFrom(['rendering', 'rendering', 'failed']),
    };
    rerender(
      <QueueItem
        job={activeJob as unknown as ProcessingQueueItem}
        liveJob={liveJob}
        localPaused={false}
        formatJobTitle={(j: any) => j.chapter_title}
        formatTime={() => '10:00'}
        onRemove={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand batch render detail/i })).toBeInTheDocument();
    });
  });
});
