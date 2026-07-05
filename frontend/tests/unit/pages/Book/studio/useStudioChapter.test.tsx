import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/api', () => ({
  api: {
    previewSourceTextResync: vi.fn(),
    exportChapterAudio: vi.fn(),
    resetChapter: vi.fn(),
    cancelChapterGeneration: vi.fn(),
  },
}));

vi.mock('@/hooks/useDeferredWhileHeld', () => ({
  useDeferredWhileHeld: (value: unknown) => value,
}));

vi.mock('@/hooks/useRenderGroups', () => ({
  useRenderGroups: () => ({ count: 0, firstSpanGroupNumber: 1 }),
}));

vi.mock('@/hooks/useSegmentHandoffQueue', () => ({
  useSegmentHandoffQueue: () => ({
    displayedSegmentId: 'none',
    displayedProgress: 0,
    hasPending: false,
  }),
  getHandoffTransitions: () => [],
  recordExternalHandoffEvent: vi.fn(),
}));


vi.mock('@/hooks/useChapterPlayback', () => ({
  useChapterPlayback: () => ({
    playingSegmentId: null,
    playingSegmentIds: new Set<string>(),
    playSegment: vi.fn(),
    stopPlayback: vi.fn(),
    togglePause: vi.fn(),
    seekTo: vi.fn(),
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    duration: 0,
    startSkim: vi.fn(),
    stopSkim: vi.fn(),
  }),
}));

const chapterEditorState = vi.hoisted(() => ({ scriptViewData: null as unknown }));

vi.mock('@/hooks/useChapterEditor', () => ({
  useChapterEditor: () => ({
    chapter: {
      id: 'chapter-1',
      title: 'Chapter 1',
      text_content: 'One. Two.',
      audio_status: 'unprocessed',
      audio_file_path: null,
      has_wav: false,
      has_mp3: false,
      has_m4a: false,
      char_count: 9,
      word_count: 2,
      done_segments_count: 0,
      total_segments_count: 0,
    },
    title: 'Chapter 1',
    setTitle: vi.fn(),
    text: 'One. Two.',
    setText: vi.fn(),
    loading: false,
    saving: false,
    submitting: false,
    localVoice: '',
    segments: [],
    characters: [],
    get scriptViewData() { return chapterEditorState.scriptViewData; },
    scriptViewLoading: false,
    generatingSegmentIds: new Set<string>(),
    analysis: null,
    setAnalysis: vi.fn(),
    analyzing: false,
    loadChapter: vi.fn(),
    generatingSegmentJob: null,
    liveSegmentJobIds: new Set<string>(),
    handleSave: vi.fn().mockResolvedValue(true),
    handleVoiceChange: vi.fn(),
    hasRenderedOutput: false,
    handleScriptAssign: vi.fn(),
    handleScriptAssignRange: vi.fn(),
    handleUpdateCharacterColor: vi.fn(),
    handleGenerate: vi.fn(),
    executeQueue: vi.fn(),
  }),
}));

import { useStudioChapter } from '@/pages/Book/studio/useStudioChapter';
import type { Job } from '@/types';

/** Minimal valid Job shape for testing — cast to any to allow overlay-only fields. */
function makeJob(overrides: Record<string, unknown>): Job {
  return {
    id: 'job-1',
    engine: 'xtts',
    chapter_file: '',
    status: 'running',
    created_at: 1000,
    safe_mode: false,
    make_mp3: false,
    progress: 0.1,
    warning_count: 0,
    ...overrides,
  } as Job;
}

describe('useStudioChapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes live state setters for the studio shell', () => {
    const { result } = renderHook(() =>
      useStudioChapter({
        chapterId: 'chapter-1',
        projectId: 'project-1',
        speakerProfiles: [],
        speakers: [],
      }),
    );

    expect(result.current.queueNotice).toBeNull();
    expect(result.current.confirmConfig).toBeNull();
    expect(result.current.exportingFormat).toBeNull();

    act(() => {
      result.current.setQueueNotice('Queued');
      result.current.setConfirmConfig({
        title: 'Confirm',
        message: 'Proceed?',
        onConfirm: vi.fn(),
      });
      result.current.setIsPreviewingResync(true);
      result.current.setIsResyncing(true);
      result.current.setExportingFormat('wav');
    });

    expect(result.current.queueNotice).toBe('Queued');
    expect(result.current.confirmConfig?.title).toBe('Confirm');
    expect(result.current.isPreviewingResync).toBe(true);
    expect(result.current.isResyncing).toBe(true);
    expect(result.current.exportingFormat).toBe('wav');
  });

  describe('chapterRenderPreparingSegmentIds', () => {
    it('puts active segment in preparing (not rendering) when reason_code is LOADING_MODEL', () => {
      // R1 anchor: before the hook change, S lands in rendering on presence alone.
      // After the change, S must be in preparing and absent from rendering.
      const preparingJob = makeJob({
        status: 'running',
        active_segment_id: 'S',
        reason_code: 'LOADING_MODEL',
        indeterminate: true,
      });

      const { result } = renderHook(() =>
        useStudioChapter({
          chapterId: 'chapter-1',
          projectId: 'project-1',
          speakerProfiles: [],
          speakers: [],
          job: preparingJob,
        }),
      );

      expect(result.current.chapterRenderPreparingSegmentIds.has('S')).toBe(true);
      expect(result.current.chapterRenderRenderingSegmentIds.has('S')).toBe(false);
    });

    it('moves active segment from preparing into rendering when reason_code changes to START_SEGMENT', () => {
      const preparingJob = makeJob({
        status: 'running',
        active_segment_id: 'S',
        reason_code: 'LOADING_MODEL',
        indeterminate: true,
      });

      const { result, rerender } = renderHook(
        ({ job }: { job: Job }) =>
          useStudioChapter({
            chapterId: 'chapter-1',
            projectId: 'project-1',
            speakerProfiles: [],
            speakers: [],
            job,
          }),
        { initialProps: { job: preparingJob } },
      );

      // Verify initial preparing state
      expect(result.current.chapterRenderPreparingSegmentIds.has('S')).toBe(true);
      expect(result.current.chapterRenderRenderingSegmentIds.has('S')).toBe(false);

      // Transition to rendering: reason_code = START_SEGMENT, indeterminate falsy
      const renderingJob = makeJob({
        status: 'running',
        active_segment_id: 'S',
        reason_code: 'START_SEGMENT',
        indeterminate: false,
      });

      act(() => {
        rerender({ job: renderingJob });
      });

      expect(result.current.chapterRenderPreparingSegmentIds.has('S')).toBe(false);
      expect(result.current.chapterRenderRenderingSegmentIds.has('S')).toBe(true);
    });

    it('puts active segment in preparing when only indeterminate is true (no reason_code)', () => {
      const preparingJob = makeJob({
        status: 'running',
        active_segment_id: 'S',
        reason_code: undefined,
        indeterminate: true,
      });

      const { result } = renderHook(() =>
        useStudioChapter({
          chapterId: 'chapter-1',
          projectId: 'project-1',
          speakerProfiles: [],
          speakers: [],
          job: preparingJob,
        }),
      );

      expect(result.current.chapterRenderPreparingSegmentIds.has('S')).toBe(true);
      expect(result.current.chapterRenderRenderingSegmentIds.has('S')).toBe(false);
    });

    it('puts active segment in preparing when reason_code is SEGMENT_PENDING', () => {
      const preparingJob = makeJob({
        status: 'running',
        active_segment_id: 'S',
        reason_code: 'SEGMENT_PENDING',
        indeterminate: false,
      });

      const { result } = renderHook(() =>
        useStudioChapter({
          chapterId: 'chapter-1',
          projectId: 'project-1',
          speakerProfiles: [],
          speakers: [],
          job: preparingJob,
        }),
      );

      expect(result.current.chapterRenderPreparingSegmentIds.has('S')).toBe(true);
      expect(result.current.chapterRenderRenderingSegmentIds.has('S')).toBe(false);
    });

    it('returns empty preparing set when there is no active job', () => {
      const { result } = renderHook(() =>
        useStudioChapter({
          chapterId: 'chapter-1',
          projectId: 'project-1',
          speakerProfiles: [],
          speakers: [],
        }),
      );

      expect(result.current.chapterRenderPreparingSegmentIds.size).toBe(0);
    });
  });

  describe('chapterRenderActiveSegmentsMap (W-PAR 006)', () => {
    it('exposes both segments from active_segments_map and includes both in the rendering set', () => {
      const job = makeJob({
        status: 'running',
        active_segments_map: {
          S1: { phase: 'rendering', progress: 0.3, eta_seconds: 10 },
          S2: { phase: 'rendering', progress: 0.6, eta_seconds: 5 },
        },
      });

      const { result } = renderHook(() =>
        useStudioChapter({
          chapterId: 'chapter-1',
          projectId: 'project-1',
          speakerProfiles: [],
          speakers: [],
          job,
        }),
      );

      expect(result.current.chapterRenderActiveSegmentsMap?.S1).toMatchObject({ phase: 'rendering', progress: 0.3 });
      expect(result.current.chapterRenderActiveSegmentsMap?.S2).toMatchObject({ phase: 'rendering', progress: 0.6 });
      expect(result.current.chapterRenderRenderingSegmentIds.has('S1')).toBe(true);
      expect(result.current.chapterRenderRenderingSegmentIds.has('S2')).toBe(true);
    });

    it('falls back to the single active_segment_id path when active_segments_map is absent (INV-1)', () => {
      const job = makeJob({
        status: 'running',
        active_segment_id: 'S',
        active_segment_progress: 0.4,
      });

      const { result } = renderHook(() =>
        useStudioChapter({
          chapterId: 'chapter-1',
          projectId: 'project-1',
          speakerProfiles: [],
          speakers: [],
          job,
        }),
      );

      expect(result.current.chapterRenderActiveSegmentsMap).toBeUndefined();
      expect(result.current.chapterRenderRenderingSegmentIds.has('S')).toBe(true);
    });

    it('excludes done-phase entries from the rendering set (SEGMENT_SAVED must not stick as rendering)', () => {
      const job = makeJob({
        status: 'running',
        active_segments_map: {
          S1: { phase: 'done', progress: 1.0, eta_seconds: null },
          S2: { phase: 'rendering', progress: 0.5, eta_seconds: 5 },
        },
      });

      const { result } = renderHook(() =>
        useStudioChapter({
          chapterId: 'chapter-1',
          projectId: 'project-1',
          speakerProfiles: [],
          speakers: [],
          job,
        }),
      );

      expect(result.current.chapterRenderRenderingSegmentIds.has('S1')).toBe(false);
      expect(result.current.chapterRenderRenderingSegmentIds.has('S2')).toBe(true);
      expect(result.current.chapterRenderPreparingSegmentIds.has('S1')).toBe(false);
    });

    it('expands each map entry to its render-batch siblings, matching the legacy single-ID visual contract (INV-1)', () => {
      chapterEditorState.scriptViewData = {
        render_batches: [
          { id: 'B1', span_ids: ['S1', 'S1b'] },
          { id: 'B2', span_ids: ['S2'] },
        ],
        spans: [],
      };
      try {
        const job = makeJob({
          status: 'running',
          active_segments_map: {
            S1: { phase: 'rendering', progress: 0.3, eta_seconds: 10 },
          },
        });

        const { result } = renderHook(() =>
          useStudioChapter({
            chapterId: 'chapter-1',
            projectId: 'project-1',
            speakerProfiles: [],
            speakers: [],
            job,
          }),
        );

        // The whole batch lights up, not just the leader segment.
        expect(result.current.chapterRenderRenderingSegmentIds.has('S1')).toBe(true);
        expect(result.current.chapterRenderRenderingSegmentIds.has('S1b')).toBe(true);
        expect(result.current.chapterRenderRenderingSegmentIds.has('S2')).toBe(false);
        expect(result.current.chapterRenderRenderingBatchProgressById.B1).toBe(0.3);
      } finally {
        chapterEditorState.scriptViewData = null;
      }
    });
  });

  describe('segmentProgress fallback active-segments map (escaped defect fix, 2026-07-05)', () => {
    it('builds a fallback map from segmentProgress when the backend has no active_segments_map at all', () => {
      const job = makeJob({ status: 'running' });

      const { result } = renderHook(() =>
        useStudioChapter({
          chapterId: 'chapter-1',
          projectId: 'project-1',
          speakerProfiles: [],
          speakers: [],
          job,
          segmentProgress: {
            S1: { job_id: 'job-1', chapter_id: 'chapter-1', segment_id: 'S1', progress: 0.4, eta_seconds: 8, status: 'running' },
          },
        }),
      );

      expect(result.current.chapterRenderActiveSegmentsMap?.S1).toMatchObject({ phase: 'rendering', progress: 0.4, eta_seconds: 8 });
      expect(result.current.chapterRenderRenderingSegmentIds.has('S1')).toBe(true);
    });

    it('does NOT use the fallback when the backend map is present but empty ({} means nothing rendering right now)', () => {
      const job = makeJob({ status: 'running', active_segments_map: {} });

      const { result } = renderHook(() =>
        useStudioChapter({
          chapterId: 'chapter-1',
          projectId: 'project-1',
          speakerProfiles: [],
          speakers: [],
          job,
          segmentProgress: {
            S1: { job_id: 'job-1', chapter_id: 'chapter-1', segment_id: 'S1', progress: 0.4, eta_seconds: 8, status: 'running' },
          },
        }),
      );

      // Backend {} must win — a stale local segmentProgress entry from a
      // prior render must never resurrect highlighting on a job the backend
      // has explicitly said has nothing in flight.
      expect(result.current.chapterRenderActiveSegmentsMap).toEqual({});
    });

    it('excludes segmentProgress entries for a different chapter, and terminal/complete entries', () => {
      const job = makeJob({ status: 'running' });

      const { result } = renderHook(() =>
        useStudioChapter({
          chapterId: 'chapter-1',
          projectId: 'project-1',
          speakerProfiles: [],
          speakers: [],
          job,
          segmentProgress: {
            other: { job_id: 'job-2', chapter_id: 'chapter-OTHER', segment_id: 'other', progress: 0.5 },
            done: { job_id: 'job-1', chapter_id: 'chapter-1', segment_id: 'done', progress: 1.0, status: 'done' },
            failed: { job_id: 'job-1', chapter_id: 'chapter-1', segment_id: 'failed', progress: 0.5, status: 'failed' },
            live: { job_id: 'job-1', chapter_id: 'chapter-1', segment_id: 'live', progress: 0.2, status: 'running' },
          },
        }),
      );

      expect(result.current.chapterRenderActiveSegmentsMap).toEqual({
        live: { phase: 'rendering', progress: 0.2, eta_seconds: null },
      });
    });
  });
});
