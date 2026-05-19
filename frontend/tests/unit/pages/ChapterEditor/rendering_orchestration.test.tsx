import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Job, ProcessingQueueItem } from '@/types';
import { pickRelevantJob, isSegmentScopedJob } from '@/utils/jobSelection';
import { createHydrationCoordinator } from '@/api/hydration';
import { useChapterLoader } from '@/hooks/chapter/useChapterLoader';
import { api } from '@/api';

// Mock API for useChapterLoader tests
vi.mock('@/api', () => ({
  api: {
    fetchChapters: vi.fn(),
    fetchSegments: vi.fn().mockResolvedValue([]),
    fetchCharacters: vi.fn().mockResolvedValue([]),
    fetchScriptView: vi.fn().mockResolvedValue({ render_batches: [], spans: [] }),
  },
}));

describe('Chapter Editor Rendering & Queue Orchestration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchChapters as any).mockResolvedValue([]);
    (api.fetchSegments as any).mockResolvedValue([]);
    (api.fetchCharacters as any).mockResolvedValue([]);
    (api.fetchScriptView as any).mockResolvedValue({ render_batches: [], spans: [] });
  });

  // Test 1: Chapter Editor switches to the newest terminal chapter job instead of keeping an older live overlay active.
  it('switches to the newest terminal chapter job instead of keeping an older live overlay active', () => {
    const olderRunningJob = {
      id: 'job-old-running',
      status: 'running' as const,
      created_at: 100,
      started_at: 110,
      progress: 0.92,
      safe_mode: false,
      make_mp3: true,
      warning_count: 0,
    };

    const newerDoneJob = {
      id: 'job-new-done',
      status: 'done' as const,
      created_at: 200,
      finished_at: 210,
      progress: 1.0,
      safe_mode: false,
      make_mp3: true,
      warning_count: 0,
    };

    // When includeDone is true, pickRelevantJob should prefer the newer terminal done job
    const selectedJob = pickRelevantJob([olderRunningJob, newerDoneJob], true);
    expect(selectedJob?.id).toBe('job-new-done');
    expect(selectedJob?.status).toBe('done');
  });

  // Test 2: Global Queue does not show duplicate chapter-level retry rows for the same chapter.
  it('does not show duplicate chapter-level retry rows for the same chapter in Global Queue', () => {
    const coordinator = createHydrationCoordinator();
    
    // Existing running job in the snapshot (older)
    const snapshotItem: ProcessingQueueItem = {
      id: 'job-old',
      project_id: 'proj-1',
      chapter_id: 'chap-1',
      status: 'running',
      created_at: 100,
      split_part: 0,
      chapter_title: 'Chapter 1',
    };

    const snapshot = coordinator.createSnapshot([snapshotItem]);

    // Newer retry done job in the live overlays (newer)
    const overlays = {
      eventsById: {
        'job-new': {
          project_id: 'proj-1',
          chapter_id: 'chap-1',
          status: 'done' as const,
          created_at: 200,
          updated_at: 210,
        },
      },
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    
    // Deduplication should keep only the newest job-new
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('job-new');
    expect(merged[0].status).toBe('done');
  });

  // Test 3: True segment-scoped jobs remain hidden from the main queue.
  it('keeps true segment-scoped jobs hidden from the main queue', () => {
    const coordinator = createHydrationCoordinator();
    const snapshot = coordinator.createSnapshot([]);

    // Segment scoped job delta (has segment_ids)
    const overlays = {
      eventsById: {
        'job-segment': {
          project_id: 'proj-1',
          chapter_id: 'chap-1',
          status: 'running' as const,
          created_at: 200,
          segment_ids: ['seg-1'],
          custom_title: 'chapter 1 * Part 2: segment #1',
        },
      },
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    expect(merged).toHaveLength(0); // Should be filtered out by isSegmentScopedJob
  });

  // Test 4: Websocket terminal update clears the stale completion hold without requiring a hard refresh.
  it('websocket terminal update clears the stale completion hold via polling without requiring a hard refresh', async () => {
    vi.useFakeTimers();

    const mockState = {
      chapter: {
        id: 'chap-1',
        project_id: 'proj-1',
        title: 'Chapter 1',
        audio_status: 'processing' as const, // Stale active state
      },
      setChapter: vi.fn(),
      setTitle: vi.fn(),
      setText: vi.fn(),
      setLocalVoice: vi.fn(),
      setSegments: vi.fn(),
      setCharacters: vi.fn(),
      setScriptViewData: vi.fn(),
      setGeneratingSegmentIds: vi.fn(),
      pendingGenerationIdsRef: { current: new Set() },
      pendingGenerationTimesRef: { current: new Map() },
      segmentRefreshTimerRef: { current: null },
      completionPollTimerRef: { current: null },
      completionPollAttemptsRef: { current: 0 },
      setLoading: vi.fn(),
      setScriptViewLoading: vi.fn(),
      segments: [],
    };

    // The newer job is completed (done)
    const chapterJobs: Job[] = [
      {
        id: 'job-new-done',
        status: 'done',
        created_at: 200,
        render_group_count: 1,
        safe_mode: false,
        make_mp3: true,
        progress: 1.0,
        warning_count: 0,
      },
    ];

    (api.fetchChapters as any).mockResolvedValue([
      {
        id: 'chap-1',
        project_id: 'proj-1',
        title: 'Chapter 1',
        audio_status: 'done', // Now completed on backend
        has_wav: true, // Audio ready
      },
    ]);
    (api.fetchSegments as any).mockResolvedValue([]);
    (api.fetchCharacters as any).mockResolvedValue([]);

    const { result } = renderHook(() =>
      useChapterLoader(
        mockState as any,
        'chap-1',
        'proj-1',
        chapterJobs,
        undefined,
        undefined
      )
    );

    // Let the hook mount and trigger initial load
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Verify polling was triggered and api.fetchChapters was called to fetch updated details
    expect(api.fetchChapters).toHaveBeenCalled();
    expect(mockState.setChapter).toHaveBeenCalledWith(
      expect.objectContaining({
        audio_status: 'done',
        has_wav: true,
      })
    );

    vi.useRealTimers();
  });
});
