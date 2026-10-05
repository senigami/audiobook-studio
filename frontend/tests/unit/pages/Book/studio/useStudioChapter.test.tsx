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

const chapterEditorState = vi.hoisted(() => ({ scriptViewData: null as unknown, segments: [] as unknown[] }));
const chapterEditorMocks = vi.hoisted(() => ({
  handleSave: vi.fn().mockResolvedValue(true),
  executeQueue: vi.fn(),
}));

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
    get segments() { return chapterEditorState.segments; },
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
    handleSave: chapterEditorMocks.handleSave,
    handleVoiceChange: vi.fn(),
    hasRenderedOutput: false,
    handleScriptAssign: vi.fn(),
    handleScriptAssignRange: vi.fn(),
    handleUpdateCharacterColor: vi.fn(),
    handleGenerate: vi.fn(),
    executeQueue: chapterEditorMocks.executeQueue,
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

  describe('handleConfirmResync', () => {
    it('re-queues the chapter (forced rebuild) after a successful resync save', async () => {
      const { result } = renderHook(() =>
        useStudioChapter({
          chapterId: 'chapter-1',
          projectId: 'project-1',
          speakerProfiles: [],
          speakers: [],
        }),
      );

      await act(async () => {
        await result.current.handleConfirmResync();
      });

      expect(chapterEditorMocks.handleSave).toHaveBeenCalledWith('Chapter 1', 'One. Two.');
      expect(chapterEditorMocks.executeQueue).toHaveBeenCalledWith('', expect.any(Function), expect.any(Function), true);
      expect(result.current.isPreviewingResync).toBe(false);
    });

    it('does NOT re-queue when the resync save fails', async () => {
      chapterEditorMocks.handleSave.mockResolvedValueOnce(false);

      const { result } = renderHook(() =>
        useStudioChapter({
          chapterId: 'chapter-1',
          projectId: 'project-1',
          speakerProfiles: [],
          speakers: [],
        }),
      );

      await act(async () => {
        await result.current.handleConfirmResync();
      });

      expect(chapterEditorMocks.executeQueue).not.toHaveBeenCalled();
    });
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

    it('surfaces done-phase entries in chapterRenderDoneSegmentIds and excludes them from pending (2026-07-07 fix)', () => {
      // Owner report: a just-completed segment's text went gray instead of
      // staying black. _on_child_segment_tick used to POP a finished
      // segment from active_segments_map entirely; it now leaves a
      // transient phase="done" marker so the frontend has a live signal to
      // treat it as ready without waiting on the next full DB refetch
      // (which does not happen mid-render). chapterRenderPendingSegmentIds
      // must never claim a done segment is still pending.
      const job = makeJob({
        status: 'running',
        active_segments_map: {
          S1: { phase: 'done', progress: 1.0, eta_seconds: 0 },
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

      expect(result.current.chapterRenderDoneSegmentIds.has('S1')).toBe(true);
      expect(result.current.chapterRenderDoneSegmentIds.has('S2')).toBe(false);
      expect(result.current.chapterRenderPendingSegmentIds.has('S1')).toBe(false);
    });

    it('excludes a concurrently-completed (done) segment from the queued set even when it sits after the active id (2026-07-07 fix)', () => {
      // Regression guard: under concurrent fan-out a segment can COMPLETE out
      // of order at a higher segment_ids index than the single, lagging
      // active_segment_id, so it falls into the "after the active one" queued
      // slice. If it stays in chapterRenderQueuedSegmentIds, ScriptView applies
      // BOTH script-span-text-queued and script-span-text-ready; text-queued is
      // defined later in the stylesheet (equal specificity) and wins, re-dimming
      // a just-finished span to opacity 0.58 — undoing the liveDoneSpanIds fix
      // in exactly the concurrent scenario it targets.
      const job = makeJob({
        status: 'running',
        active_segment_id: 'S0',
        segment_ids: ['S0', 'S1', 'S2'],
        active_segments_map: {
          S0: { phase: 'rendering', progress: 0.3, eta_seconds: 8 },
          S2: { phase: 'done', progress: 1.0, eta_seconds: 0 },
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

      expect(result.current.chapterRenderDoneSegmentIds.has('S2')).toBe(true);
      expect(result.current.chapterRenderQueuedSegmentIds.has('S2')).toBe(false);
    });

    it('does not re-gray already-rendered segments from a PRIOR render when resuming without job.segment_ids (2026-07-13 fix)', () => {
      // Owner report: resuming/continuing a partially-rendered chapter turned
      // every already-black (done) segment gray the instant the new job's
      // first segment started pulsing. Root cause: chapterRenderDoneSegmentIds
      // was sourced ONLY from the live active_segments_map's small rolling
      // window (a handful of recently-active segments), never from a
      // segment's own persisted audio_status. The resumed job has no
      // job.segment_ids (segment_ids: null), so chapterRenderQueuedSegmentIds
      // falls back to "every render-batch span minus rendering minus
      // (live-window) done" — which wrongly includes every segment finished
      // in an EARLIER render, since chapterRenderDoneSegmentIds never knew
      // about them.
      chapterEditorState.scriptViewData = {
        render_batches: [
          { id: 'B0', span_ids: ['S0'] },
          { id: 'B1', span_ids: ['S1'] },
          { id: 'B2', span_ids: ['S2'] },
          { id: 'B3', span_ids: ['S3'] },
        ],
        spans: [],
      };
      chapterEditorState.segments = [
        { id: 'S0', audio_status: 'done', audio_file_path: 'S0.wav' },
        { id: 'S1', audio_status: 'done', audio_file_path: 'S1.wav' },
        { id: 'S2', audio_status: 'unprocessed', audio_file_path: null },
        { id: 'S3', audio_status: 'unprocessed', audio_file_path: null },
      ];
      try {
        const job = makeJob({
          status: 'running',
          segment_ids: null,
          active_segments_map: {
            S2: { phase: 'rendering', progress: 0.4, eta_seconds: 8 },
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

        // S0/S1 finished in a prior render -- persisted done, absent from the
        // live map's small window. They must read as done, never as queued.
        expect(result.current.chapterRenderDoneSegmentIds.has('S0')).toBe(true);
        expect(result.current.chapterRenderDoneSegmentIds.has('S1')).toBe(true);
        expect(result.current.chapterRenderQueuedSegmentIds.has('S0')).toBe(false);
        expect(result.current.chapterRenderQueuedSegmentIds.has('S1')).toBe(false);
        // S2 is genuinely rendering right now; S3 is genuinely still queued.
        expect(result.current.chapterRenderRenderingSegmentIds.has('S2')).toBe(true);
        expect(result.current.chapterRenderQueuedSegmentIds.has('S3')).toBe(true);
      } finally {
        chapterEditorState.scriptViewData = null;
        chapterEditorState.segments = [];
      }
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

  describe('animated per-segment interpolation (H5, concurrent map path — 2026-07-06)', () => {
    // R1 anchor: before the fix, chapterRenderRenderingBatchProgressById fed
    // each batch the RAW active_segments_map entry.progress verbatim — the
    // value only stepped when a real websocket frame landed, so the text
    // highlight jumped between percents (spec §7 H5 violation). These tests
    // hold the incoming frame CONSTANT and prove the displayed value still
    // advances at every 250 ms tick — i.e. real interpolation is happening,
    // not just an eventually-correct end state.
    const twoSegmentScriptView = {
      render_batches: [
        { id: 'B1', span_ids: ['S1'] },
        { id: 'B2', span_ids: ['S2'] },
      ],
      spans: [],
    };

    it('advances every rendering segment smoothly between real frames (samples every 250ms over ~1s)', () => {
      vi.useFakeTimers();
      chapterEditorState.scriptViewData = twoSegmentScriptView;
      try {
        const job = makeJob({
          status: 'running',
          active_segments_map: {
            S1: { phase: 'rendering', progress: 0.1, eta_seconds: 10 },
            S2: { phase: 'rendering', progress: 0.5, eta_seconds: 4 },
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

        const samplesB1: number[] = [result.current.chapterRenderRenderingBatchProgressById.B1];
        const samplesB2: number[] = [result.current.chapterRenderRenderingBatchProgressById.B2];
        for (let i = 0; i < 4; i += 1) {
          act(() => {
            vi.advanceTimersByTime(250);
          });
          samplesB1.push(result.current.chapterRenderRenderingBatchProgressById.B1);
          samplesB2.push(result.current.chapterRenderRenderingBatchProgressById.B2);
        }

        // Backend floor holds at t=0…
        expect(samplesB1[0]).toBeGreaterThanOrEqual(0.1);
        expect(samplesB2[0]).toBeGreaterThanOrEqual(0.5);
        // …and the value moved at EVERY intermediate sample with the frame
        // held constant (several animation updates per second, per owner).
        for (let i = 1; i < samplesB1.length; i += 1) {
          expect(samplesB1[i]).toBeGreaterThan(samplesB1[i - 1]);
          expect(samplesB2[i]).toBeGreaterThan(samplesB2[i - 1]);
        }
        // Interpolation stays honest: bounded by the lane target, never ≥ 1.
        expect(samplesB1[samplesB1.length - 1]).toBeLessThan(0.995);
        expect(samplesB2[samplesB2.length - 1]).toBeLessThan(0.995);
      } finally {
        chapterEditorState.scriptViewData = null;
        vi.useRealTimers();
      }
    });

    it('a frame for one segment id does not disturb a sibling segment\'s in-flight animation', () => {
      vi.useFakeTimers();
      chapterEditorState.scriptViewData = twoSegmentScriptView;
      try {
        const initialJob = makeJob({
          status: 'running',
          active_segments_map: {
            S1: { phase: 'rendering', progress: 0.1, eta_seconds: 10 },
            S2: { phase: 'rendering', progress: 0.5, eta_seconds: 4 },
          },
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
          { initialProps: { job: initialJob } },
        );

        act(() => {
          vi.advanceTimersByTime(500);
        });
        const s1BeforeSiblingFrame = result.current.chapterRenderRenderingBatchProgressById.B1;

        // A real frame arrives for S2 ONLY (S1's entry is value-identical).
        const nextJob = makeJob({
          status: 'running',
          active_segments_map: {
            S1: { phase: 'rendering', progress: 0.1, eta_seconds: 10 },
            S2: { phase: 'rendering', progress: 0.7, eta_seconds: 2 },
          },
        });
        act(() => {
          rerender({ job: nextJob });
        });

        // S2 snapped up to (at least) its new backend floor.
        expect(result.current.chapterRenderRenderingBatchProgressById.B2).toBeGreaterThanOrEqual(0.7);
        // S1 kept its animated position (no reset back to the raw 0.1) and
        // keeps advancing on the next tick — independent per-id lanes.
        expect(result.current.chapterRenderRenderingBatchProgressById.B1).toBeGreaterThanOrEqual(s1BeforeSiblingFrame);
        act(() => {
          vi.advanceTimersByTime(250);
        });
        expect(result.current.chapterRenderRenderingBatchProgressById.B1).toBeGreaterThan(s1BeforeSiblingFrame);
      } finally {
        chapterEditorState.scriptViewData = null;
        vi.useRealTimers();
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
