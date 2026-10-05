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
    fetchChapter: vi.fn(),
    fetchSegments: vi.fn().mockResolvedValue([]),
    fetchCharacters: vi.fn().mockResolvedValue([]),
    fetchScriptView: vi.fn().mockResolvedValue({ render_batches: [], spans: [] }),
  },
}));

describe('Chapter Editor Rendering & Queue Orchestration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchChapter as any).mockResolvedValue(null);
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
      setChapterNotFound: vi.fn(),
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

    (api.fetchChapter as any).mockResolvedValue({
      id: 'chap-1',
      project_id: 'proj-1',
      title: 'Chapter 1',
      audio_status: 'done', // Now completed on backend
      has_wav: true, // Audio ready
    });
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

    // Verify polling was triggered and api.fetchChapter was called to fetch updated details
    expect(api.fetchChapter).toHaveBeenCalled();
    expect(mockState.setChapter).toHaveBeenCalledWith(
      expect.objectContaining({
        audio_status: 'done',
        has_wav: true,
      })
    );

    vi.useRealTimers();
  });

  // COR-F-1: loadChapter used to unconditionally overwrite the local title/text
  // draft on every reload (mount, WS chapter-update tick, and each 1s
  // completion-poll tick). The autosave in useStudioChapter.ts is debounced
  // 1500ms, so a completion-refresh reload landing inside that window could
  // revert an unsaved edit before it had a chance to save.
  it('preserves an unsaved local title/text edit across a completion-refresh reload', async () => {
    vi.useFakeTimers();

    const mockState: any = {
      chapter: null,
      title: '',
      text: '',
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
      setChapterNotFound: vi.fn(),
      segments: [],
    };

    (api.fetchChapter as any).mockResolvedValueOnce({
      id: 'chap-1',
      project_id: 'proj-1',
      title: 'Original Title',
      text_content: 'Original body',
    });

    const { result, rerender } = renderHook(
      ({ state }) => useChapterLoader(state, 'chap-1', 'proj-1', [], undefined, undefined),
      { initialProps: { state: mockState } }
    );

    // Mount load resolves and applies the server value (no local edits yet).
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(mockState.setTitle).toHaveBeenCalledWith('Original Title');
    expect(mockState.setText).toHaveBeenCalledWith('Original body');

    // Simulate the resulting local state (what the real setTitle/setText calls
    // would have produced) and a local, still-unsaved edit on top of it.
    mockState.title = 'User Edited Title';
    mockState.text = 'User edited body';
    rerender({ state: mockState });

    mockState.setTitle.mockClear();
    mockState.setText.mockClear();

    // Server reflects the pre-edit content — the local edit hasn't saved yet
    // (autosave is debounced 1500ms) when this completion-refresh reload fires.
    (api.fetchChapter as any).mockResolvedValueOnce({
      id: 'chap-1',
      project_id: 'proj-1',
      title: 'Original Title',
      text_content: 'Original body',
    });

    await act(async () => {
      await result.current.loadChapter('completion-refresh');
    });

    expect(mockState.setTitle).not.toHaveBeenCalled();
    expect(mockState.setText).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  // COR-F-1 (legitimate case): with no local edits pending, a genuine
  // server-side title/text change must still be applied on reload.
  it('applies a genuine server-side title/text change when there are no local edits', async () => {
    vi.useFakeTimers();

    const mockState: any = {
      chapter: null,
      title: '',
      text: '',
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
      setChapterNotFound: vi.fn(),
      segments: [],
    };

    (api.fetchChapter as any).mockResolvedValueOnce({
      id: 'chap-1',
      project_id: 'proj-1',
      title: 'Original Title',
      text_content: 'Original body',
    });

    const { result, rerender } = renderHook(
      ({ state }) => useChapterLoader(state, 'chap-1', 'proj-1', [], undefined, undefined),
      { initialProps: { state: mockState } }
    );

    await act(async () => { await vi.runAllTimersAsync(); });
    expect(mockState.setTitle).toHaveBeenCalledWith('Original Title');

    // No local edit: the draft mirrors exactly what was just loaded.
    mockState.title = 'Original Title';
    mockState.text = 'Original body';
    rerender({ state: mockState });

    mockState.setTitle.mockClear();
    mockState.setText.mockClear();

    // Server-side content genuinely changed (e.g. edited elsewhere) since the
    // last load — this reload must still apply it.
    (api.fetchChapter as any).mockResolvedValueOnce({
      id: 'chap-1',
      project_id: 'proj-1',
      title: 'New Server Title',
      text_content: 'New server body',
    });

    await act(async () => {
      await result.current.loadChapter('chapter-update');
    });

    expect(mockState.setTitle).toHaveBeenCalledWith('New Server Title');
    expect(mockState.setText).toHaveBeenCalledWith('New server body');

    vi.useRealTimers();
  });
});
