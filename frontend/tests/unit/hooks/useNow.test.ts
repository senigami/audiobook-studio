/**
 * P6 pinning test — useNow shares one interval across N mounted instances.
 *
 * Verifies the shared ref-count mechanism: mounting N hooks produces exactly
 * one setInterval call, and the interval is cleared when all hooks unmount.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useNow, resetUseNowForTests } from '@/hooks/useNow';

describe('P6 — useNow shared interval', () => {
  beforeEach(() => {
    resetUseNowForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetUseNowForTests();
  });

  it('produces exactly one setInterval when multiple hooks mount', () => {
    const spy = vi.spyOn(global, 'setInterval');

    const { unmount: u1 } = renderHook(() => useNow());
    const { unmount: u2 } = renderHook(() => useNow());
    const { unmount: u3 } = renderHook(() => useNow());

    // Three consumers but only one shared interval should be registered.
    expect(spy).toHaveBeenCalledTimes(1);

    u1();
    u2();
    u3();
  });

  it('clears the interval when the last consumer unmounts', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval');

    const { unmount: u1 } = renderHook(() => useNow());
    const { unmount: u2 } = renderHook(() => useNow());

    u1();
    // Interval still alive — one consumer remains.
    expect(clearSpy).not.toHaveBeenCalled();

    u2();
    // Last consumer gone — interval must be cleared.
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it('advances the returned timestamp by ~1 s per tick', () => {
    const { result } = renderHook(() => useNow());
    const t0 = result.current;

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBeGreaterThanOrEqual(t0 + 999);
  });
});
