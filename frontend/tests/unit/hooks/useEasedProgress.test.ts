import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEasedProgress } from '@/hooks/useEasedProgress';

// R4: deterministic via fake timers — the hook eases on a setInterval loop, so
// advancing timers drives the animation with no real-time waits.
describe('useEasedProgress', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts at 0', () => {
    const { result } = renderHook(() => useEasedProgress(0, 'seg-1', { stepMs: 50, timeConstantMs: 800 }));
    expect(result.current).toBe(0);
  });

  it('eases toward a jumped target instead of snapping to it', () => {
    const { result, rerender } = renderHook(
      ({ t }) => useEasedProgress(t, 'seg-1', { stepMs: 50, timeConstantMs: 800 }),
      { initialProps: { t: 0 } },
    );
    // Coarse engine datapoint arrives: target jumps straight to 0.33.
    rerender({ t: 0.33 });
    // One step in, it has moved off 0 but is nowhere near the target (no snap).
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(0.1);
    // Given enough time it converges on the datapoint.
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBeGreaterThan(0.32);
    expect(result.current).toBeLessThanOrEqual(0.33);
  });

  it('never exceeds the target', () => {
    const { result } = renderHook(() => useEasedProgress(0.5, 'seg-1', { stepMs: 50, timeConstantMs: 200 }));
    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current).toBeLessThanOrEqual(0.5);
  });

  it('is forward-only within a segment (a regressing target does not pull it back)', () => {
    const { result, rerender } = renderHook(
      ({ t }) => useEasedProgress(t, 'seg-1', { stepMs: 50, timeConstantMs: 200 }),
      { initialProps: { t: 0.6 } },
    );
    act(() => { vi.advanceTimersByTime(5000); });
    const high = result.current;
    expect(high).toBeGreaterThan(0.5);
    rerender({ t: 0.3 }); // target regresses (shouldn't happen mid-segment, but guard it)
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBeGreaterThanOrEqual(high - 1e-6);
  });

  it('resets to 0 when the segment (resetKey) changes', () => {
    const { result, rerender } = renderHook(
      ({ t, k }) => useEasedProgress(t, k, { stepMs: 50, timeConstantMs: 200 }),
      { initialProps: { t: 0.8, k: 'seg-1' } },
    );
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBeGreaterThan(0.5);
    rerender({ t: 0, k: 'seg-2' }); // new segment
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe(0);
  });
});
