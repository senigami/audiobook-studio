import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useSegmentHandoffQueue,
  COMPLETION_HOLD_MS,
  getHandoffTransitions,
  clearHandoffTransitions,
} from '@/hooks/useSegmentHandoffQueue';

describe('useSegmentHandoffQueue debug ring buffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearHandoffTransitions();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records completing_enter, visual_complete, hold_start, flush in order for a segA→segB handoff', () => {
    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.5 } }
    );

    // Trigger handoff: seg-B arrives while seg-A bar has not visually completed.
    rerender({ segmentId: 'seg-B', progress: 0.0 });

    // Notify the queue that the visual bar reached 1.0.
    act(() => {
      result.current.notifyDisplayProgress(1.0);
    });

    // Advance through the 500ms hold.
    act(() => {
      vi.advanceTimersByTime(COMPLETION_HOLD_MS);
    });

    // Advance the catch-up tick (16ms).
    act(() => {
      vi.advanceTimersByTime(20);
    });

    const transitions = getHandoffTransitions();
    const events = transitions.map(t => t.event);

    // Must contain these four events, in order.
    const idxCompleting = events.indexOf('completing_enter');
    const idxVisual = events.indexOf('visual_complete');
    const idxHold = events.indexOf('hold_start');
    const idxFlush = events.indexOf('flush');

    expect(idxCompleting).toBeGreaterThanOrEqual(0);
    expect(idxVisual).toBeGreaterThan(idxCompleting);
    expect(idxHold).toBeGreaterThanOrEqual(idxVisual);
    expect(idxFlush).toBeGreaterThan(idxHold);

    // Check segment ids in the relevant entries.
    expect(transitions[idxCompleting].segmentId).toBe('seg-B');
    expect(transitions[idxFlush].segmentId).toBe('seg-B');
  });
});
