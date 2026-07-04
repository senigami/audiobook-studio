import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useInitialData } from '@/hooks/useInitialData';

describe('useInitialData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    // Ensure fake timers are always restored to avoid cross-test leakage
    vi.useRealTimers();
  });

  it('fetches initial data on mount', async () => {
    const mockData = { projects: [], recent_jobs: [] };
    (global.fetch as any).mockResolvedValue({
      ok: true,
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

  // F15 — a rejected fetch must surface a retryable error, not just an
  // infinite silent spinner.
  it('surfaces an error state when the fetch rejects (F15)', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Fetch failed'));

    const { result } = renderHook(() => useInitialData());

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });

  it('clears the error state once a retry succeeds (F15)', async () => {
    vi.useFakeTimers();

    (global.fetch as any)
      .mockRejectedValueOnce(new Error('Fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ system_info: { startup_ready: true } }),
      });

    const { result } = renderHook(() => useInitialData());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.error).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  // F15 follow-up (Fable review) — an HTTP error response (e.g. a 500) is valid,
  // parseable JSON/HTML, not a network rejection. Without a res.ok check it was
  // silently treated as a successful payload.
  it('surfaces an error for a non-ok HTTP response instead of treating the body as data', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ detail: 'internal error' }),
    });

    const { result } = renderHook(() => useInitialData());

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    expect(result.current.data).toBeNull();
  });

  it('allows refetching data', async () => {
    vi.useFakeTimers();

    const mockData1 = { system_info: { startup_ready: true }, version: '1' };
    const mockData2 = { system_info: { startup_ready: true }, version: '2' };

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData1),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData2),
      });

    const { result } = renderHook(() => useInitialData());

    // Flush microtasks so the initial fetch (called directly, not via timer) resolves
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.data).toEqual(mockData1);

    // Call refetch — schedules the debounce timer
    act(() => {
      result.current.refetch();
    });

    // Advance past the debounce window and flush Promises
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(mockData2);
  });

  it('keeps loading until startup is ready', async () => {
    vi.useFakeTimers();

    const pendingData = { system_info: { startup_ready: false } };
    const readyData = { system_info: { startup_ready: true } };
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(pendingData),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(readyData),
      });

    const { result } = renderHook(() => useInitialData());

    // Flush the initial fetchHome call (direct, not via timer)
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);

    // Advance past the STARTUP_RETRY_MS timer and flush
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(readyData);
  });

  // P9 — rapid refetch calls coalesce to a single fetch (debounce)
  it('coalesces multiple rapid refetch calls into a single fetch (P9 debounce)', async () => {
    vi.useFakeTimers();

    const mockData = { system_info: { startup_ready: true } };
    const mockData2 = { system_info: { startup_ready: true }, version: 2 };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const { result } = renderHook(() => useInitialData());

    // Let the initial fetch complete (direct call, not via timer)
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loading).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Queue the mock for the coalesced refetch
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData2),
    });

    // Fire three rapid refetch calls — all within the debounce window
    act(() => {
      result.current.refetch();
      result.current.refetch();
      result.current.refetch();
    });

    // Advance past the debounce window and flush Promises
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    // Only one additional fetch should have fired despite three calls
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
