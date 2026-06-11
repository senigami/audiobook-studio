/**
 * Bug 2 regression tests: the script text highlight (active segment identity and progress
 * used by ScriptView's rendering orchestration) must go through the handoff queue so the
 * outgoing segment's text fill animates to 100% before the highlight moves to the next segment.
 *
 * These tests validate the integration contract: when a batched A@0.8 → B@0 event arrives,
 * the handoff queue's displayedSegmentId/displayedProgress (used as chapterRenderActiveSegmentId
 * and liveBarSegmentProgress) must still report A at 1.0, not B at 0.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useSegmentHandoffQueue, COMPLETION_HOLD_MS } from '@/hooks/useSegmentHandoffQueue';

describe('useSegmentHandoffQueue – script view / text-highlight integration', () => {
  // -----------------------------------------------------------------------
  // Bug 2 (script highlight): displayedSegmentId must stay A (not B) so
  // chapterRenderActiveSegmentId keeps highlighting A until visual 100%.
  // -----------------------------------------------------------------------
  it('reports A as displayedSegmentId with progress 1.0 after batched A@0.8→B@0, so script highlight stays on A', () => {
    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.8 } }
    );

    // Batched: B starts before A's visual bar reaches 100%
    rerender({ segmentId: 'seg-B', progress: 0 });

    // Script highlight: must still show A (not B) so text fill completes
    expect(result.current.displayedSegmentId).toBe('seg-A');
    // Progress must be 1.0 (forced on entering COMPLETING) — not 0.8
    // This is what chapterRenderActiveSegmentId's dependent computations consume
    // to drive the text fill forward to 100%.
    expect(result.current.displayedProgress).toBe(1.0);
    // B must not yet be active
    expect(result.current.hasPending).toBe(true);
  });

  // -----------------------------------------------------------------------
  // After visual completion, B becomes active at 0 and then catches up.
  // -----------------------------------------------------------------------
  it('transitions script highlight to B only after onVisualComplete, mounting B at 0 then catching up', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.8 } }
    );

    rerender({ segmentId: 'seg-B', progress: 0 });

    // Still A during hold
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.displayedProgress).toBe(1.0);

    // B gets a progress update while holding
    rerender({ segmentId: 'seg-B', progress: 0.3 });

    // Visual bar reaches 100% → hold begins
    act(() => {
      result.current.notifyDisplayProgress(1.0);
    });

    // Still seg-A during hold
    expect(result.current.displayedSegmentId).toBe('seg-A');

    // Advance through 500ms hold → B now active, mounted at 0
    act(() => {
      vi.advanceTimersByTime(COMPLETION_HOLD_MS);
    });
    expect(result.current.displayedSegmentId).toBe('seg-B');
    expect(result.current.displayedProgress).toBe(0);

    // After catch-up tick: B at its latest frame (0.3)
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current.displayedSegmentId).toBe('seg-B');
    expect(result.current.displayedProgress).toBe(0.3);

    vi.useRealTimers();
  });
});
