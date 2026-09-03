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

  // -----------------------------------------------------------------------
  // Test B (R1 revert-check): sentinel end-of-chapter safety timer fires with source='safety'
  // Pre-change: safety timer called onVisualCompleteRef with no arg → source defaults to 'display'
  //             (the `onVisualComplete` default param was 'display', so ring recorded source:'display')
  // Post-change: safety timer passes 'safety' explicitly → ring records source:'safety'
  // -----------------------------------------------------------------------
  it('records visual_complete with source safety when safety timer fires (no notifyDisplayProgress call)', () => {
    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-safety', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.5 } }
    );

    // Trigger sentinel handoff (end-of-chapter): segmentId becomes 'none'.
    // This enters COMPLETING with sentinel pending and arms the 3s safety timer.
    rerender({ segmentId: 'none', progress: 0.0 });

    // Advance 3000ms — safety timer fires. Do NOT call notifyDisplayProgress.
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const transitions = getHandoffTransitions();
    const visualCompletes = transitions.filter(t => t.event === 'visual_complete');

    // There must be at least one visual_complete, and it must carry source='safety'.
    expect(visualCompletes.length).toBeGreaterThan(0);
    const safetyFire = visualCompletes.find(e => (e.detail as any)?.source === 'safety');
    expect(safetyFire).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // H7: ring buffer records terminal_failure_reset with jobId and prior segment
  // -----------------------------------------------------------------------
  it('records terminal_failure_reset ring event with jobId and prior displayedSegmentId', () => {
    const { result, rerender } = renderHook(
      (props: { segmentId: string; progress: number; status: string }) =>
        useSegmentHandoffQueue({ jobId: 'job-fail-1', segmentId: props.segmentId, progress: props.progress, status: props.status }),
      { initialProps: { segmentId: 'seg-A', progress: 0.5, status: 'running' } }
    );

    // Queue a pending segment
    rerender({ segmentId: 'seg-B', progress: 0, status: 'running' });

    // Transition to failed
    rerender({ segmentId: 'seg-B', progress: 0, status: 'failed' });

    const transitions = getHandoffTransitions();
    const resetEvent = transitions.find(t => t.event === 'terminal_failure_reset');
    expect(resetEvent).toBeDefined();
    expect((resetEvent!.detail as any)?.jobId).toBe('job-fail-1');
    expect((resetEvent!.detail as any)?.priorDisplayedSegmentId).toBe('seg-A');
  });
});
