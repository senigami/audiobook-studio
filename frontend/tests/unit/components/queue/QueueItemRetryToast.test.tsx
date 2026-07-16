/**
 * Task 011 (U6 guided failure recovery) — a failed segment-retry request
 * must surface an explanatory toast instead of only a silent console.error,
 * so the failure isn't a dead end. Per testing-standards.md R2, only the
 * true network boundary is mocked (`api.generateSegments`,
 * `api.fetchScriptView`) — `QueueItem`'s own state is exercised for real.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GlobalQueue } from '@/components/queue/GlobalQueue';
import type { Job, ProcessingQueueItem, ScriptSpan } from '@/types';
import { setDevModeEnabled } from '@/utils/devMode';
import { APP_TOAST_EVENT } from '@/utils/toast';

vi.mock('@/api', () => ({
  api: {
    toggleQueuePause: vi.fn().mockResolvedValue({}),
    reorderProcessingQueue: vi.fn().mockResolvedValue({}),
    removeProcessingQueue: vi.fn().mockResolvedValue({}),
    clearCompletedJobs: vi.fn().mockResolvedValue({}),
    clearProcessingQueue: vi.fn().mockResolvedValue({}),
    cancelChapterGeneration: vi.fn().mockResolvedValue({}),
    generateSegments: vi.fn(),
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

function makeSpans(chapterId: string, n: number): ScriptSpan[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${chapterId}-seg-${i}`,
    order_index: i,
    text: `span ${i}`,
    sanitized_text: `span ${i}`,
    character_id: null,
    speaker_profile_name: null,
    status: 'done',
    audio_file_path: null,
    audio_generated_at: null,
    char_count: 50,
    sanitized_char_count: 50,
  })) as any;
}

function buildJobWithFailure(id: string, chapterId: string): { job: ProcessingQueueItem; liveJob: Job } {
  const failedId = `${chapterId}-seg-0`;
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
    },
  };
  return { job: base as any, liveJob: base as any };
}

describe('QueueItem — task 011 guided failure recovery (segment retry)', () => {
  beforeEach(() => {
    localStorage.clear();
    setDevModeEnabled(true);
    vi.mocked(api.fetchScriptView).mockReset();
    vi.mocked(api.generateSegments).mockReset();
  });

  afterEach(() => {
    setDevModeEnabled(false);
    localStorage.clear();
  });

  it('surfaces a toast when a segment retry request fails', async () => {
    vi.mocked(api.fetchScriptView).mockImplementation(async (chapterId: string) => {
      return { chapter_id: chapterId, base_revision_id: null, paragraphs: [], spans: makeSpans(chapterId, 12) } as any;
    });
    vi.mocked(api.generateSegments).mockRejectedValue(new Error('network down'));

    const toastHandler = vi.fn();
    window.addEventListener(APP_TOAST_EVENT, toastHandler);

    const { job, liveJob } = buildJobWithFailure('job-A', 'chapter-A');

    render(<GlobalQueue queue={[job]} jobs={{ 'job-A': liveJob }} />);

    const retryButton = await screen.findByRole('button', { name: /^retry$/i });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(toastHandler).toHaveBeenCalledTimes(1);
    });
    const detail = (toastHandler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.message).toMatch(/retry/i);

    window.removeEventListener(APP_TOAST_EVENT, toastHandler);
  });

  it('does not surface a toast when a segment retry request succeeds', async () => {
    vi.mocked(api.fetchScriptView).mockImplementation(async (chapterId: string) => {
      return { chapter_id: chapterId, base_revision_id: null, paragraphs: [], spans: makeSpans(chapterId, 12) } as any;
    });
    vi.mocked(api.generateSegments).mockResolvedValue({} as any);

    const toastHandler = vi.fn();
    window.addEventListener(APP_TOAST_EVENT, toastHandler);

    const { job, liveJob } = buildJobWithFailure('job-B', 'chapter-B');

    render(<GlobalQueue queue={[job]} jobs={{ 'job-B': liveJob }} />);

    const retryButton = await screen.findByRole('button', { name: /^retry$/i });
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(api.generateSegments).toHaveBeenCalledTimes(1);
    });
    expect(toastHandler).not.toHaveBeenCalled();

    window.removeEventListener(APP_TOAST_EVENT, toastHandler);
  });
});
