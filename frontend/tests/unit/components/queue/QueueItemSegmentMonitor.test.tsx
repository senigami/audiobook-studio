/**
 * W-PAR task 015 — per-row segment peek strip / render monitor.
 *
 * Prior behavior (tasks 008/011): `ActivityPage.tsx` picked a single "first
 * active job" via `Object.values(jobs).find(...)` and mounted ONE
 * `SegmentPeekStrip`/`SegmentRenderMonitor` for it at page level. If 2+ jobs
 * were rendering concurrently, only the first one found got a strip.
 *
 * This test proves the fix: the strip/monitor now mount inside each
 * `QueueItem` row (via `GlobalQueue`'s `activeJobs` list), so N concurrently-
 * active jobs each get their own independently-hydrated instance.
 *
 * Per testing-standards.md R2, only the true network boundary is mocked
 * (`api.fetchScriptView`, `api.generateSegments`) — `useSegmentInventory` and
 * `QueueItem`'s own state are exercised for real.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GlobalQueue } from '@/components/queue/GlobalQueue';
import { QueueItem } from '@/components/queue/QueueItem';
import type { Job, ProcessingQueueItem, ScriptSpan } from '@/types';
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
    fetchScriptView: vi.fn(),
  },
}));

vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({ progress, label, dataTestId, onDisplayProgress }: any) => {
    React.useEffect(() => { onDisplayProgress?.(progress); }, [progress]);
    return <div data-testid={dataTestId || 'progress-bar'} data-progress={progress}>{label}</div>;
  },
}));

import { api } from '@/api';

function makeSpans(chapterId: string, n: number, renderingIds: string[] = []): ScriptSpan[] {
  return Array.from({ length: n }, (_, i) => {
    const id = `${chapterId}-seg-${i}`;
    return {
      id,
      order_index: i,
      text: `span ${i}`,
      sanitized_text: `span ${i}`,
      character_id: null,
      speaker_profile_name: null,
      status: renderingIds.includes(id) ? 'processing' : 'done',
      audio_file_path: null,
      audio_generated_at: null,
      char_count: 50,
      sanitized_char_count: 50,
    };
  });
}

function activeSegmentsMapFor(chapterId: string, renderingIds: string[]): Record<string, any> {
  const map: Record<string, any> = {};
  for (const id of renderingIds) {
    map[id] = { phase: 'rendering', progress: 0.4, char_count: 50 };
  }
  return map;
}

function makeJob(id: string, chapterId: string, renderingCount: number): { job: ProcessingQueueItem; liveJob: Job } {
  const renderingIds = Array.from({ length: renderingCount }, (_, i) => `${chapterId}-seg-${i}`);
  const base = {
    id,
    status: 'running' as const,
    chapter_id: chapterId,
    chapter_title: `Chapter for ${chapterId}`,
    project_name: 'Project',
    split_part: 0,
    progress: 0.5,
    active_segments_map: activeSegmentsMapFor(chapterId, renderingIds),
  };
  return { job: base as any, liveJob: base as any };
}

describe('QueueItem — task 015 per-row segment monitor', () => {
  beforeEach(() => {
    localStorage.clear();
    setDevModeEnabled(true);
    vi.mocked(api.fetchScriptView).mockReset();
  });

  afterEach(() => {
    setDevModeEnabled(false);
    localStorage.clear();
  });

  it('two concurrently-active jobs each get their own independently-hydrated strip', async () => {
    vi.mocked(api.fetchScriptView).mockImplementation(async (chapterId: string) => {
      if (chapterId === 'chapter-A') {
        return { chapter_id: 'chapter-A', base_revision_id: null, paragraphs: [], spans: makeSpans('chapter-A', 12, ['chapter-A-seg-0', 'chapter-A-seg-1']) } as any;
      }
      return { chapter_id: 'chapter-B', base_revision_id: null, paragraphs: [], spans: makeSpans('chapter-B', 12, ['chapter-B-seg-0']) } as any;
    });

    const { job: jobA, liveJob: liveJobA } = makeJob('job-A', 'chapter-A', 2);
    const { job: jobB, liveJob: liveJobB } = makeJob('job-B', 'chapter-B', 1);

    render(
      <GlobalQueue
        queue={[jobA, jobB]}
        jobs={{ 'job-A': liveJobA, 'job-B': liveJobB }}
      />
    );

    // chapter-A has 2 concurrently-rendering segments -> peek strip (Level 2).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand segment render detail.*2 segments rendering/i })).toBeInTheDocument();
    });
    // chapter-B has only 1 concurrently-rendering segment -> below the peek
    // threshold, so its full field renders directly instead.
    await waitFor(() => {
      expect(screen.getByText(/1 rendering in parallel/i)).toBeInTheDocument();
    });

    // Both rows are present simultaneously — this is the core of task 015:
    // job A's strip and job B's full monitor coexist, neither replacing the
    // other (the pre-015 page-level code would only ever render one).
    expect(screen.getByRole('button', { name: /expand segment render detail.*2 segments rendering/i })).toBeInTheDocument();
    expect(screen.getByText(/1 rendering in parallel/i)).toBeInTheDocument();
  });

  it('retrying a segment on one row does not affect another row', async () => {
    // Build script-view spans where one span per chapter is 'failed' (via
    // active_segments_map), so each row's full SegmentRenderMonitor renders
    // a "Retry" action — the retry button only renders for failed segments.
    vi.mocked(api.fetchScriptView).mockImplementation(async (chapterId: string) => {
      const spans = makeSpans(chapterId, 12, []);
      return { chapter_id: chapterId, base_revision_id: null, paragraphs: [], spans } as any;
    });

    const buildJobWithFailure = (id: string, chapterId: string) => {
      const failedId = `${chapterId}-seg-0`;
      const renderingId = `${chapterId}-seg-1`;
      const base = {
        id,
        status: 'running' as const,
        chapter_id: chapterId,
        chapter_title: `Chapter for ${chapterId}`,
        project_name: 'Project',
        split_part: 0,
        progress: 0.5,
        active_segments_map: {
          [failedId]: { phase: 'failed', progress: 0.2, char_count: 50 },
          [renderingId]: { phase: 'rendering', progress: 0.5, char_count: 50 },
        },
      };
      return { job: base as any, liveJob: base as any };
    };

    const { job: jobA, liveJob: liveJobA } = buildJobWithFailure('job-A', 'chapter-A');
    const { job: jobB, liveJob: liveJobB } = buildJobWithFailure('job-B', 'chapter-B');

    render(
      <GlobalQueue
        queue={[jobA, jobB]}
        jobs={{ 'job-A': liveJobA, 'job-B': liveJobB }}
      />
    );

    const retryButtons = await screen.findAllByRole('button', { name: /^retry$/i });
    expect(retryButtons.length).toBe(2);
    fireEvent.click(retryButtons[0]);

    await waitFor(() => {
      expect(api.generateSegments).toHaveBeenCalledTimes(1);
    });
    // Only one row's failed segment should have been retried, and it must
    // belong to one chapter only — never a mix of both rows' ids.
    const retriedId = vi.mocked(api.generateSegments).mock.calls[0][0][0];
    expect(retriedId).toMatch(/^chapter-[AB]-seg-0$/);
  });

  it('renders no strip for a job outside the active-status set', async () => {
    vi.mocked(api.fetchScriptView).mockResolvedValue({ chapter_id: 'chapter-A', base_revision_id: null, paragraphs: [], spans: makeSpans('chapter-A', 12, ['chapter-A-seg-0', 'chapter-A-seg-1']) } as any);

    const { job, liveJob } = makeJob('job-A', 'chapter-A', 2);
    const doneJob = { ...job, status: 'done' as const };
    const doneLiveJob = { ...liveJob, status: 'done' as const };

    render(
      <QueueItem
        job={doneJob as any}
        liveJob={doneLiveJob as any}
        localPaused={false}
        formatJobTitle={(j: any) => j.chapter_title}
        formatTime={() => '10:00'}
        onRemove={vi.fn()}
      />
    );

    // No network call should even happen: the job is not in ACTIVE_STATUSES,
    // so useSegmentInventory is gated off entirely (job passed as null).
    await waitFor(() => {
      expect(api.fetchScriptView).not.toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: /expand segment render detail/i })).toBeNull();
    expect(screen.queryByText(/rendering in parallel/i)).toBeNull();
  });
});
