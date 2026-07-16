import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEngineConcurrency } from '@/hooks/useEngineConcurrency';
import { api } from '@/api';

vi.mock('@/api', () => ({
  api: {
    fetchEngineConcurrency: vi.fn(),
  },
}));

const response = (overrides: Partial<Record<string, any>> = {}) => ({
  global_cap: 1,
  engines: [
    { engine_id: 'xtts', engine_class: 'XttsEngine', manifest_max: 4, requested_cap: 4, effective_cap: 4, active_count: 1 },
    { engine_id: 'voxtral', engine_class: 'VoxtralEngine', manifest_max: 2, requested_cap: 2, effective_cap: 2, active_count: 0 },
  ],
  ...overrides,
});

// Flush the microtask queue so the hook's `.then()` handlers run, without
// touching fake timers (R4 — no real setTimeout/sleep waits).
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('useEngineConcurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls on mount and exposes engine_id -> effective_cap', async () => {
    (api.fetchEngineConcurrency as any).mockResolvedValue(response());

    const { result } = renderHook(() => useEngineConcurrency());
    await flush();

    expect(api.fetchEngineConcurrency).toHaveBeenCalledTimes(1);
    expect(result.current.engineCaps).toEqual({ xtts: 4, voxtral: 2 });
  });

  it('refreshes the cap map on a later poll (a live cap change reaches the map)', async () => {
    (api.fetchEngineConcurrency as any).mockResolvedValue(response());

    const { result } = renderHook(() => useEngineConcurrency());
    await flush();
    expect(result.current.engineCaps.xtts).toBe(4);

    (api.fetchEngineConcurrency as any).mockResolvedValue(
      response({ engines: [{ engine_id: 'xtts', engine_class: 'XttsEngine', manifest_max: 4, requested_cap: 2, effective_cap: 2, active_count: 1 }] })
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    await flush();

    expect(result.current.engineCaps.xtts).toBe(2);
  });

  it('keeps the previous cap map on a fetch failure instead of clearing it', async () => {
    (api.fetchEngineConcurrency as any).mockResolvedValue(response());

    const { result } = renderHook(() => useEngineConcurrency());
    await flush();
    expect(result.current.engineCaps).toEqual({ xtts: 4, voxtral: 2 });

    (api.fetchEngineConcurrency as any).mockRejectedValue(new Error('boundary failure'));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    await flush();

    expect(result.current.engineCaps).toEqual({ xtts: 4, voxtral: 2 });
  });

  it('stops polling on unmount', async () => {
    (api.fetchEngineConcurrency as any).mockResolvedValue(response());

    const { unmount } = renderHook(() => useEngineConcurrency());
    await flush();
    expect(api.fetchEngineConcurrency).toHaveBeenCalledTimes(1);

    unmount();
    const callsAtUnmount = (api.fetchEngineConcurrency as any).mock.calls.length;

    act(() => {
      vi.advanceTimersByTime(20000);
    });
    await flush();

    expect((api.fetchEngineConcurrency as any).mock.calls.length).toBe(callsAtUnmount);
  });
});
