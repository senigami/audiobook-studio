import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInitialData } from './useInitialData';

describe('useInitialData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('fetches initial data on mount', async () => {
    const mockData = { projects: [], recent_jobs: [] };
    (global.fetch as any).mockResolvedValue({
      json: () => Promise.resolve(mockData),
    });

    const { result } = renderHook(() => useInitialData());

    expect(result.current.loading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith('/api/home', { cache: 'no-store' });
  });

  it('handles fetch error', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Fetch failed'));

    const { result } = renderHook(() => useInitialData());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/home', { cache: 'no-store' });
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
  });

  it('allows refetching data', async () => {
    const mockData1 = { version: '1' };
    const mockData2 = { version: '2' };
    
    (global.fetch as any)
      .mockResolvedValueOnce({
        json: () => Promise.resolve(mockData1),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve(mockData2),
      });

    const { result } = renderHook(() => useInitialData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(mockData1);

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toEqual(mockData2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps loading until startup is ready', async () => {
    vi.useFakeTimers();

    try {
      const pendingData = { system_info: { startup_ready: false } };
      const readyData = { system_info: { startup_ready: true } };
      (global.fetch as any)
        .mockResolvedValueOnce({
          json: () => Promise.resolve(pendingData),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve(readyData),
        });

      const { result } = renderHook(() => useInitialData());

      await act(async () => {
        await Promise.resolve();
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.current.loading).toBe(true);

      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
        await Promise.resolve();
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.current.loading).toBe(false);

      expect(result.current.data).toEqual(readyData);
    } finally {
      vi.useRealTimers();
    }
  });
});
