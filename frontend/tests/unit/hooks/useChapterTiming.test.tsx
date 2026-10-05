/**
 * useChapterTiming.test.tsx
 *
 * Tests for frontend/src/hooks/useChapterTiming.ts (synced-reader plan,
 * Task 7) — fetches GET /api/projects/{projectId}/chapters/{chapterId}/timing
 * and returns `{ groups, audioDurationMs } | null`.
 *
 * Mocks (R2 — boundaries outside the unit): `fetch` only. The hook's own
 * null-vs-data logic is the unit under test; the fetch-wrapper's own shape
 * validation is already covered indirectly and is not re-tested here.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChapterTiming } from '@/hooks/useChapterTiming';

function validTimingPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schema: 'chapter_segment_timing',
    version: 1,
    chapter_id: 'ch1',
    audio_file: 'chapter_ch1.wav',
    audio_generated_at: 1699999999.0,
    audio_duration_ms: 6360,
    generated_at: 1699999999.0,
    group_count: 2,
    groups: [
      { group_id: 'seg_0001', segment_ids: ['seg_0001'], order: 0, start_ms: 0, end_ms: 3180, duration_ms: 3180 },
      { group_id: 'seg_0002', segment_ids: ['seg_0002'], order: 1, start_ms: 3180, end_ms: 6360, duration_ms: 3180 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useChapterTiming', () => {
  it('fetches the timing route and returns groups + audioDurationMs on a 200', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validTimingPayload()),
    });

    const { result } = renderHook(() => useChapterTiming('ch-200', 'proj-200'));

    expect(global.fetch).toHaveBeenCalledWith('/api/projects/proj-200/chapters/ch-200/timing');

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current?.audioDurationMs).toBe(6360);
    expect(result.current?.groups).toHaveLength(2);
    expect(result.current?.groups[0]).toEqual({
      group_id: 'seg_0001',
      segment_ids: ['seg_0001'],
      order: 0,
      start_ms: 0,
      end_ms: 3180,
      duration_ms: 3180,
    });
  });

  it('returns null on a 404 response (no sidecar / stale / invalid)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useChapterTiming('ch-404', 'proj-404'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/projects/proj-404/chapters/ch-404/timing');
    });

    // Give the rejected/null-resolving promise a tick to settle.
    await waitFor(() => {
      expect(result.current).toBeNull();
    });
  });

  it('returns null when the fetch itself rejects (network failure)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useChapterTiming('ch-error', 'proj-error'));

    await waitFor(() => {
      expect(result.current).toBeNull();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('re-fetches on remount instead of serving stale cached data after the chapter was re-rendered (regression)', async () => {
    // Regression test: a chapter re-render produces a new sidecar with a new
    // `audio_generated_at` and (usually) different groups/duration. If the
    // reader unmounts and remounts for the same (projectId, chapterId)
    // *after* that re-render — e.g. navigating away from and back to the
    // Book tab within the same browser session — it must show the fresh
    // timing, not whatever was fetched before the re-render.
    const firstPayload = validTimingPayload();
    const secondPayload = validTimingPayload({
      audio_generated_at: 1700000500.0,
      audio_duration_ms: 9000,
      groups: [
        { group_id: 'seg_0001', segment_ids: ['seg_0001'], order: 0, start_ms: 0, end_ms: 9000, duration_ms: 9000 },
      ],
    });

    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(firstPayload) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(secondPayload) });

    const { result, unmount } = renderHook(() => useChapterTiming('ch-refresh', 'proj-refresh'));
    await waitFor(() => {
      expect(result.current?.audioDurationMs).toBe(6360);
    });
    unmount();

    // Simulate the chapter having been re-rendered between the two mounts.
    const { result: result2 } = renderHook(() => useChapterTiming('ch-refresh', 'proj-refresh'));
    await waitFor(() => {
      expect(result2.current?.audioDurationMs).toBe(9000);
    });
    expect(result2.current?.groups).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
