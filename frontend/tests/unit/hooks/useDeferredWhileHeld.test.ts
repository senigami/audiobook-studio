import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeferredWhileHeld } from '@/hooks/useDeferredWhileHeld';

describe('useDeferredWhileHeld', () => {
  it('passes values through immediately when not held', () => {
    const { result, rerender } = renderHook(
      ({ value, held }: { value: number; held: boolean }) =>
        useDeferredWhileHeld(value, held),
      { initialProps: { value: 1, held: false } }
    );
    expect(result.current).toBe(1);

    rerender({ value: 2, held: false });
    expect(result.current).toBe(2);

    rerender({ value: 5, held: false });
    expect(result.current).toBe(5);
  });

  it('buffers updates while held and does not pass them through', () => {
    const { result, rerender } = renderHook(
      ({ value, held }: { value: number; held: boolean }) =>
        useDeferredWhileHeld(value, held),
      { initialProps: { value: 1, held: false } }
    );
    expect(result.current).toBe(1);

    // Start holding
    rerender({ value: 1, held: true });
    expect(result.current).toBe(1);

    // New value arrives while held — should NOT pass through
    rerender({ value: 2, held: true });
    expect(result.current).toBe(1);

    rerender({ value: 3, held: true });
    expect(result.current).toBe(1); // still 1
  });

  it('releases latest-wins buffered value when hold ends', () => {
    const { result, rerender } = renderHook(
      ({ value, held }: { value: number; held: boolean }) =>
        useDeferredWhileHeld(value, held),
      { initialProps: { value: 1, held: false } }
    );

    rerender({ value: 1, held: true });
    rerender({ value: 2, held: true });
    rerender({ value: 3, held: true }); // latest-wins: 3 buffered

    // Still buffered
    expect(result.current).toBe(1);

    // Hold ends — release buffered value
    act(() => {
      rerender({ value: 3, held: false });
    });
    expect(result.current).toBe(3);
  });

  it('passes through immediately if hold ends and no value was buffered during hold', () => {
    const { result, rerender } = renderHook(
      ({ value, held }: { value: number; held: boolean }) =>
        useDeferredWhileHeld(value, held),
      { initialProps: { value: 1, held: true } }
    );
    // No new value while held
    act(() => {
      rerender({ value: 1, held: false });
    });
    expect(result.current).toBe(1);
  });

  it('works with object values (tick shape from ChapterEditor)', () => {
    const tick1 = { chapterId: 'ch-1', tick: 1 };
    const tick2 = { chapterId: 'ch-1', tick: 2 };
    const tick3 = { chapterId: 'ch-1', tick: 3 };

    const { result, rerender } = renderHook(
      ({ value, held }: { value: typeof tick1; held: boolean }) =>
        useDeferredWhileHeld(value, held),
      { initialProps: { value: tick1, held: false } }
    );
    expect(result.current).toBe(tick1);

    // Enter hold
    rerender({ value: tick1, held: true });
    rerender({ value: tick2, held: true });
    rerender({ value: tick3, held: true });
    // Still showing tick1
    expect(result.current).toBe(tick1);

    // Hold ends — latest (tick3) released
    act(() => {
      rerender({ value: tick3, held: false });
    });
    expect(result.current).toBe(tick3);
  });
});
