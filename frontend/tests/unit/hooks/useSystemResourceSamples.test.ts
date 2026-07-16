import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSystemResourceSamples, __resetSystemResourceSamplesForTests } from '@/hooks/useSystemResourceSamples';
import { api } from '@/api';

vi.mock('@/api', () => ({
  api: {
    fetchSystemResources: vi.fn(),
  },
}));

const withVram = (overrides: Partial<Record<string, any>> = {}) => ({
  cpu_pct: 42,
  ram_used_gb: 7.2,
  ram_total_gb: 16,
  vram_used_gb: 3.1,
  vram_total_gb: 8,
  ...overrides,
});

const noVram = () => ({
  cpu_pct: 42,
  ram_used_gb: 7.2,
  ram_total_gb: 16,
  vram_used_gb: null,
  vram_total_gb: null,
});

// Flush the microtask queue so the hook's `.then()` handlers run, without
// touching fake timers (R4 — no real setTimeout/sleep waits).
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('useSystemResourceSamples', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    __resetSystemResourceSamplesForTests();
  });

  afterEach(() => {
    __resetSystemResourceSamplesForTests();
    vi.useRealTimers();
  });

  it('polls on mount', async () => {
    (api.fetchSystemResources as any).mockResolvedValue(withVram());

    renderHook(() => useSystemResourceSamples());
    await flush();

    expect(api.fetchSystemResources).toHaveBeenCalledTimes(1);
  });

  it('accumulates samples and caps the buffer at ~30', async () => {
    (api.fetchSystemResources as any).mockResolvedValue(withVram());

    const { result } = renderHook(() => useSystemResourceSamples());
    await flush();
    expect(result.current.samples.length).toBe(1);

    for (let i = 0; i < 40; i++) {
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      await flush();
    }

    expect(result.current.samples.length).toBe(30);
  });

  it('derives hasVram=true when vram fields are present', async () => {
    (api.fetchSystemResources as any).mockResolvedValue(withVram());

    const { result } = renderHook(() => useSystemResourceSamples());
    await flush();

    expect(result.current.hasVram).toBe(true);
  });

  it('derives hasVram=false only after 2 consecutive missing-vram samples', async () => {
    (api.fetchSystemResources as any).mockResolvedValue(withVram());

    const { result } = renderHook(() => useSystemResourceSamples());
    await flush();
    expect(result.current.hasVram).toBe(true);

    (api.fetchSystemResources as any).mockResolvedValue(noVram());

    // First miss — should NOT flip to false yet.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    await flush();
    expect(result.current.hasVram).toBe(true);

    // Second consecutive miss — now it should flip.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    await flush();
    expect(result.current.hasVram).toBe(false);
  });

  it('keeps polling after unmount (module-level singleton, not per-mount)', async () => {
    (api.fetchSystemResources as any).mockResolvedValue(withVram());

    const { unmount } = renderHook(() => useSystemResourceSamples());
    await flush();
    expect(api.fetchSystemResources).toHaveBeenCalledTimes(1);

    unmount();
    const callsAtUnmount = (api.fetchSystemResources as any).mock.calls.length;

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    await flush();

    expect((api.fetchSystemResources as any).mock.calls.length).toBeGreaterThan(callsAtUnmount);
  });

  it('re-mounting sees the history accumulated while unmounted, not an empty buffer', async () => {
    (api.fetchSystemResources as any).mockResolvedValue(withVram());

    const first = renderHook(() => useSystemResourceSamples());
    await flush();
    expect(first.result.current.samples.length).toBe(1);

    first.unmount();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    await flush();

    const second = renderHook(() => useSystemResourceSamples());
    expect(second.result.current.samples.length).toBe(2);
  });
});
