import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRenderGroups } from '@/hooks/useRenderGroups';
import { api } from '@/api';

vi.mock('@/api', () => ({
  api: {
    fetchChapterRenderGroups: vi.fn(),
  },
}));

const mockResponse = {
  count: 2,
  groups: [
    { index: 0, segment_ids: ['spanA', 'spanB'], engine: 'xtts', char_count: 50 },
    { index: 1, segment_ids: ['spanC'], engine: 'xtts', char_count: 30 },
  ],
};

describe('useRenderGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns count and correct first-span map', async () => {
    (api.fetchChapterRenderGroups as any).mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useRenderGroups('proj1', 'chap1', 0));

    await waitFor(() => {
      expect(result.current.count).toBe(2);
    });

    expect(result.current.firstSpanGroupNumber.get('spanA')).toBe(1);
    expect(result.current.firstSpanGroupNumber.has('spanB')).toBe(false);
    expect(result.current.firstSpanGroupNumber.get('spanC')).toBe(2);

    expect(result.current.groupNumberBySegmentId.get('spanA')).toBe(1);
    expect(result.current.groupNumberBySegmentId.get('spanB')).toBe(1);
    expect(result.current.groupNumberBySegmentId.get('spanC')).toBe(2);
  });

  it('refetches when refreshKey changes', async () => {
    (api.fetchChapterRenderGroups as any).mockResolvedValue(mockResponse);

    const { rerender } = renderHook(
      ({ key }: { key: number }) => useRenderGroups('proj1', 'chap1', key),
      { initialProps: { key: 0 } }
    );

    await waitFor(() => {
      expect(api.fetchChapterRenderGroups).toHaveBeenCalledTimes(1);
    });

    rerender({ key: 1 });

    await waitFor(() => {
      expect(api.fetchChapterRenderGroups).toHaveBeenCalledTimes(2);
    });
  });

  it('returns null count and empty maps on error', async () => {
    (api.fetchChapterRenderGroups as any).mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useRenderGroups('proj1', 'chap1', 0));

    await waitFor(() => {
      expect(api.fetchChapterRenderGroups).toHaveBeenCalled();
    });

    // After rejection, should not throw and should have null count
    await waitFor(() => {
      expect(result.current.count).toBeNull();
    });
    expect(result.current.groupNumberBySegmentId.size).toBe(0);
    expect(result.current.firstSpanGroupNumber.size).toBe(0);
  });

  it('ignores stale responses via request-id guard', async () => {
    let resolveFirst!: (v: any) => void;
    let resolveSecond!: (v: any) => void;
    const firstPromise = new Promise(res => { resolveFirst = res; });
    const secondPromise = new Promise(res => { resolveSecond = res; });

    (api.fetchChapterRenderGroups as any)
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useRenderGroups('proj1', 'chap1', key),
      { initialProps: { key: 0 } }
    );

    // Trigger a second fetch before the first resolves
    rerender({ key: 1 });

    // Resolve the second (newer) request first
    resolveSecond({ count: 2, groups: [{ index: 0, segment_ids: ['spanA'], engine: 'xtts', char_count: 10 }] });

    await waitFor(() => {
      expect(result.current.count).toBe(2);
    });

    // Now resolve the stale first request with different data and flush its
    // .then() continuation deterministically (explicit microtask drain — R4).
    resolveFirst({ count: 99, groups: [] });
    await act(async () => {
      await firstPromise;
    });
    expect(result.current.count).toBe(2);
  });
});
