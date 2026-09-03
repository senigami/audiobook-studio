import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSegmentInventory } from '@/hooks/useSegmentInventory';
import { api } from '@/api';
import type { Job, ScriptViewResponse } from '@/types';

vi.mock('@/api', () => ({
  api: {
    fetchScriptView: vi.fn(),
  },
}));

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    engine: 'xtts',
    chapter_file: '',
    status: 'running',
    created_at: 0,
    safe_mode: true,
    make_mp3: true,
    progress: 0.3,
    warning_count: 0,
    chapter_id: 'chap-1',
    ...overrides,
  } as Job;
}

const mockScriptView: ScriptViewResponse = {
  chapter_id: 'chap-1',
  base_revision_id: 'rev-1',
  paragraphs: [],
  // Status strings match the REAL backend contract (app/domain/chapters/helpers.py
  // `_normalize_segment_status`): a done segment's span.status is 'rendered', never
  // the literal 'done' — that string only ever appears on the raw DB `audio_status`
  // column, one layer below this API response.
  spans: [
    { id: 'seg-1', order_index: 0, text: 'Hello there friend.', sanitized_text: 'Hello there friend.', character_id: null, speaker_profile_name: null, status: 'rendered', audio_file_path: null, audio_generated_at: null, char_count: 19, sanitized_char_count: 19 },
    { id: 'seg-2', order_index: 1, text: 'A longer segment of dialogue right here.', sanitized_text: 'A longer segment of dialogue right here.', character_id: null, speaker_profile_name: null, status: 'draft', audio_file_path: null, audio_generated_at: null, char_count: 41, sanitized_char_count: 41 },
    { id: 'seg-3', order_index: 2, text: 'Currently rendering this one.', sanitized_text: 'Currently rendering this one.', character_id: null, speaker_profile_name: null, status: 'rendering', audio_file_path: null, audio_generated_at: null, char_count: 30, sanitized_char_count: 30 },
  ],
  render_batches: [],
  audio_groups: [],
};

describe('useSegmentInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty segments when there is no job', () => {
    const { result } = renderHook(() => useSegmentInventory(null));
    expect(result.current.segments).toEqual([]);
    expect(api.fetchScriptView).not.toHaveBeenCalled();
  });

  it('merges script-view spans with active_segments_map, using real per-span char counts', async () => {
    (api.fetchScriptView as any).mockResolvedValue(mockScriptView);

    const job = makeJob({
      active_segments_map: {
        'seg-3': { phase: 'rendering', progress: 0.4, eta_seconds: 12, char_count: 30 },
      },
    });

    const { result } = renderHook(() => useSegmentInventory(job));

    await waitFor(() => {
      expect(result.current.segments.length).toBe(3);
    });

    const bySeg = Object.fromEntries(result.current.segments.map((s) => [s.id, s]));

    // Already-rendered span, absent from the live map -> done/1.
    expect(bySeg['seg-1']).toMatchObject({ phase: 'done', progress: 1, charCount: 19, engineId: 'xtts' });
    // Not-yet-started span, absent from the live map -> preparing/0 (no
    // invented phase — SegmentRenderMonitor's own idle/dimmest state).
    expect(bySeg['seg-2']).toMatchObject({ phase: 'preparing', progress: 0, charCount: 41 });
    // In-flight span, present in the live map -> real phase/progress, and the
    // live entry's OWN char_count (never the group's combined total).
    expect(bySeg['seg-3']).toMatchObject({ phase: 'rendering', progress: 0.4, charCount: 30 });
  });

  it('does not report a partially-rendered batch as Preparing (#237)', async () => {
    // A batch whose members are part done and part not-yet-started, with nothing
    // in the live map: the resume-after-restart shape. Expected values are read
    // off the batch members, not recomputed from the hook's own aggregation.
    const view: ScriptViewResponse = {
      ...mockScriptView,
      spans: [
        { id: 'a', order_index: 0, text: 'Done already.', sanitized_text: 'Done already.', character_id: null, speaker_profile_name: null, status: 'rendered', audio_file_path: null, audio_generated_at: null, char_count: 50, sanitized_char_count: 50 },
        { id: 'b', order_index: 1, text: 'Not started.', sanitized_text: 'Not started.', character_id: null, speaker_profile_name: null, status: 'draft', audio_file_path: null, audio_generated_at: null, char_count: 50, sanitized_char_count: 50 },
      ],
      render_batches: [{ id: 'batch-1', span_ids: ['a', 'b'] } as any],
    };
    (api.fetchScriptView as any).mockResolvedValue(view);

    const { result } = renderHook(() => useSegmentInventory(makeJob({ active_segments_map: {} })));
    await waitFor(() => expect(result.current.segments.length).toBe(1));

    const batch = result.current.segments[0];
    // One of two equal-length members is rendered, so half the characters are done.
    expect(batch.progress).toBeCloseTo(0.5);
    // The label must not claim the batch has not started when half of it has.
    expect(batch.phase).not.toBe('preparing');
    // ...and it must not claim to be occupying a render slot, because nothing
    // in this batch is actually in flight (drives the parallel-render count).
    expect(batch.inFlight).toBe(false);
  });

  it('shows a failed span with the real failed phase from active_segments_map', async () => {
    (api.fetchScriptView as any).mockResolvedValue(mockScriptView);

    const job = makeJob({
      active_segments_map: {
        'seg-3': { phase: 'failed', progress: 0.5, eta_seconds: null, char_count: 30 },
      },
    });

    const { result } = renderHook(() => useSegmentInventory(job));

    await waitFor(() => {
      expect(result.current.segments.length).toBe(3);
    });

    const seg3 = result.current.segments.find((s) => s.id === 'seg-3');
    expect(seg3?.phase).toBe('failed');
  });

  it('refetches when the job chapter_id changes and ignores stale responses', async () => {
    let resolveFirst!: (v: any) => void;
    let resolveSecond!: (v: any) => void;
    const firstPromise = new Promise((res) => { resolveFirst = res; });
    const secondPromise = new Promise((res) => { resolveSecond = res; });

    (api.fetchScriptView as any)
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    const { result, rerender } = renderHook(
      ({ job }: { job: Job }) => useSegmentInventory(job),
      { initialProps: { job: makeJob({ chapter_id: 'chap-1' }) } },
    );

    rerender({ job: makeJob({ chapter_id: 'chap-2' }) });

    resolveSecond({ ...mockScriptView, chapter_id: 'chap-2', spans: [mockScriptView.spans[0]] });

    await waitFor(() => {
      expect(result.current.segments.length).toBe(1);
    });

    resolveFirst({ ...mockScriptView, chapter_id: 'chap-1' });
    await act(async () => {
      await firstPromise;
    });
    expect(result.current.segments.length).toBe(1);
  });

  it('does not refetch script-view when only active_segments_map changes for the same chapter (dedup)', async () => {
    (api.fetchScriptView as any).mockResolvedValue(mockScriptView);

    const { result, rerender } = renderHook(
      ({ job }: { job: Job }) => useSegmentInventory(job),
      {
        initialProps: {
          job: makeJob({
            active_segments_map: {
              'seg-3': { phase: 'rendering', progress: 0.1, eta_seconds: 20, char_count: 30 },
            },
          }),
        },
      },
    );

    await waitFor(() => {
      expect(result.current.segments.length).toBe(3);
    });
    expect(api.fetchScriptView).toHaveBeenCalledTimes(1);

    // Simulate several progress ticks: a brand-new object reference for
    // active_segments_map each time (as real websocket job updates do),
    // same chapter_id.
    rerender({
      job: makeJob({
        active_segments_map: {
          'seg-3': { phase: 'rendering', progress: 0.4, eta_seconds: 12, char_count: 30 },
        },
      }),
    });
    await waitFor(() => {
      expect(result.current.segments.find((s) => s.id === 'seg-3')?.progress).toBe(0.4);
    });

    rerender({
      job: makeJob({
        active_segments_map: {
          'seg-3': { phase: 'rendering', progress: 0.8, eta_seconds: 4, char_count: 30 },
        },
      }),
    });
    await waitFor(() => {
      expect(result.current.segments.find((s) => s.id === 'seg-3')?.progress).toBe(0.8);
    });

    // The live merge updated across ticks, but the network fetch happened
    // only once for this chapter_id.
    expect(api.fetchScriptView).toHaveBeenCalledTimes(1);
  });

  it('aggregates spans into render batches when render_batches is present (owner ruling: batch is the finest visible granularity)', async () => {
    const batchedScriptView: ScriptViewResponse = {
      ...mockScriptView,
      spans: [
        { id: 'seg-1', order_index: 0, text: 'a', sanitized_text: 'a', character_id: null, speaker_profile_name: null, status: 'rendered', audio_file_path: null, audio_generated_at: null, char_count: 19, sanitized_char_count: 19 },
        { id: 'seg-2', order_index: 1, text: 'b', sanitized_text: 'b', character_id: null, speaker_profile_name: null, status: 'rendered', audio_file_path: null, audio_generated_at: null, char_count: 41, sanitized_char_count: 41 },
        { id: 'seg-3', order_index: 2, text: 'c', sanitized_text: 'c', character_id: null, speaker_profile_name: null, status: 'draft', audio_file_path: null, audio_generated_at: null, char_count: 30, sanitized_char_count: 30 },
      ],
      render_batches: [
        { id: 'batch-1', span_ids: ['seg-1', 'seg-2'], status: 'rendered', estimated_work_weight: 60 },
        { id: 'batch-2', span_ids: ['seg-3'], status: 'draft', estimated_work_weight: 30 },
      ],
    };
    (api.fetchScriptView as any).mockResolvedValue(batchedScriptView);

    const job = makeJob({
      active_segments_map: {
        // The live map is keyed by the batch's LEADER span id (seg-3, the
        // first/only member of batch-2) — exactly how the real orchestrator
        // reports an active render group (its leader id).
        'seg-3': { phase: 'rendering', progress: 0.4, eta_seconds: 12, char_count: 30 },
      },
    });

    const { result } = renderHook(() => useSegmentInventory(job));

    await waitFor(() => {
      expect(result.current.segments.length).toBe(2);
    });

    const byBatch = Object.fromEntries(result.current.segments.map((s) => [s.id, s]));

    // batch-1: both members already rendered -> the batch itself is done,
    // char-summed across its members (never one row per sentence).
    expect(byBatch['batch-1']).toMatchObject({ phase: 'done', progress: 1, charCount: 60, engineId: 'xtts' });
    // batch-2: its one member is live/rendering -> the batch reflects that.
    expect(byBatch['batch-2']).toMatchObject({ phase: 'rendering', progress: 0.4, charCount: 30 });

    // batchSpanIds resolves a batch id back to its real member span ids —
    // what a batch-level retry needs to pass to the multi-id generate API.
    expect(result.current.batchSpanIds).toEqual({
      'batch-1': ['seg-1', 'seg-2'],
      'batch-2': ['seg-3'],
    });
  });

  it('falls back to per-span rows when render_batches is empty (older/degraded data)', async () => {
    (api.fetchScriptView as any).mockResolvedValue(mockScriptView); // render_batches: []
    const { result } = renderHook(() => useSegmentInventory(makeJob()));
    await waitFor(() => {
      expect(result.current.segments.length).toBe(3);
    });
  });

  it('clears segments on fetch error', async () => {
    (api.fetchScriptView as any).mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useSegmentInventory(makeJob()));

    await waitFor(() => {
      expect(api.fetchScriptView).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(result.current.segments).toEqual([]);
      expect(result.current.loading).toBe(false);
    });
  });
});
