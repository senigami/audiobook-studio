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
