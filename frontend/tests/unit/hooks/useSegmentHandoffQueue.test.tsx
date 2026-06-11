import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSegmentHandoffQueue } from '@/hooks/useSegmentHandoffQueue';

describe('useSegmentHandoffQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Test 1: SEGMENT_SAVED then START_SEGMENT — old segment stays until visual 100%
  // -----------------------------------------------------------------------
  it('keeps old segment displayed when new START_SEGMENT arrives while visual bar has not yet reached 100%', () => {
    // Start with seg-A at 80% progress
    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.8 } }
    );

    // Initial state: seg-A is displayed
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.displayedProgress).toBe(0.8);
    expect(result.current.hasPending).toBe(false);

    // SEGMENT_SAVED arrives: progress moves to 1.0 but visual bar hasn't caught up yet
    rerender({ segmentId: 'seg-A', progress: 1.0 });
    expect(result.current.displayedSegmentId).toBe('seg-A');

    // START_SEGMENT arrives for seg-B (new segment, progress 0)
    // Visual bar still < 1.0 (not yet reported via onVisualComplete)
    rerender({ segmentId: 'seg-B', progress: 0 });

    // seg-A must remain displayed; seg-B is queued
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Test 2: pendingLatest accumulates while completing; on swap: mount at 0 then catch-up
  // -----------------------------------------------------------------------
  it('captures pendingLatest frames and applies them one tick after mounting the pending segment', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.9 } }
    );

    // seg-A finishes
    rerender({ segmentId: 'seg-A', progress: 1.0 });

    // START_SEGMENT for seg-B at progress 0
    rerender({ segmentId: 'seg-B', progress: 0 });
    expect(result.current.displayedSegmentId).toBe('seg-A');

    // More progress frames arrive for seg-B while seg-A bar is animating to 100
    rerender({ segmentId: 'seg-B', progress: 0.25 });
    rerender({ segmentId: 'seg-B', progress: 0.45 });

    // Visual bar on seg-A completes (onVisualComplete called)
    act(() => {
      result.current.onVisualComplete();
    });

    // After visual complete: seg-B should be mounted at 0 (start frame)
    expect(result.current.displayedSegmentId).toBe('seg-B');
    expect(result.current.displayedProgress).toBe(0);

    // After one tick (e.g. rAF / setTimeout): pendingLatest (0.45) should be applied
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current.displayedProgress).toBe(0.45);

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Test 3: Normal flow (no successor) — behavior unchanged
  // -----------------------------------------------------------------------
  it('passes through progress normally when there is no queued successor segment', () => {
    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.3 } }
    );

    rerender({ segmentId: 'seg-A', progress: 0.6 });
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.displayedProgress).toBe(0.6);
    expect(result.current.hasPending).toBe(false);

    // onVisualComplete with no pending: no-op
    act(() => {
      result.current.onVisualComplete();
    });

    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Test 4: Multiple fast segment starts — latest-wins for pendingStart identity
  // -----------------------------------------------------------------------
  it('uses latest-wins for pendingStart when multiple START_SEGMENT frames arrive during completion', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 1.0 } }
    );

    // Two successive new segments start while seg-A is completing
    rerender({ segmentId: 'seg-B', progress: 0 });
    rerender({ segmentId: 'seg-C', progress: 0 });

    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(true);

    // Visual completes: seg-C (latest) should mount, not seg-B
    act(() => {
      result.current.onVisualComplete();
    });

    expect(result.current.displayedSegmentId).toBe('seg-C');

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Test 5: When no pending exists (normal flow), swaps immediately
  // -----------------------------------------------------------------------
  it('swaps segment immediately when visual bar is already at 1.0 (no queue needed)', () => {
    // Simulate: bar already reported onVisualComplete before new segment arrives
    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 1.0 } }
    );

    // Mark visual complete with no pending
    act(() => {
      result.current.onVisualComplete();
    });

    // New segment arrives after visual complete — should be displayed immediately
    rerender({ segmentId: 'seg-B', progress: 0 });
    expect(result.current.displayedSegmentId).toBe('seg-B');
    expect(result.current.hasPending).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Test 6 (Bug 1): visualCompleteRef must be reset on mount so third segment queues
  // -----------------------------------------------------------------------
  it('queues a third segment (C) even though the first handoff (A→B) used the immediate-mount path', () => {
    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.5 } }
    );

    // A reaches visual 1.0 — sets visualCompleteRef=true (no pending yet)
    act(() => {
      result.current.notifyDisplayProgress(1.0);
    });

    // B starts — should mount immediately via the immediate-mount path (ref was true)
    rerender({ segmentId: 'seg-B', progress: 0 });
    expect(result.current.displayedSegmentId).toBe('seg-B');
    expect(result.current.hasPending).toBe(false);

    // B is mid-animation (not visually complete)
    act(() => {
      result.current.notifyDisplayProgress(0.5);
    });

    // C starts while B bar is mid-animation — must be QUEUED, not mounted immediately
    rerender({ segmentId: 'seg-C', progress: 0 });
    expect(result.current.hasPending).toBe(true);
    expect(result.current.displayedSegmentId).toBe('seg-B');
  });

  // -----------------------------------------------------------------------
  // Test 7 (Bug 2): safety timeout flushes pending when old bar never reaches 100%
  // -----------------------------------------------------------------------
  it('force-flushes pending segment after 3000ms if onVisualComplete never fires', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.6 } }
    );

    // B starts — A is stuck at 0.6 and will never reach 1.0
    rerender({ segmentId: 'seg-B', progress: 0 });
    expect(result.current.hasPending).toBe(true);
    expect(result.current.displayedSegmentId).toBe('seg-A');

    // Advance past the 3000ms safety timeout
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // B should now be mounted at progress 0
    expect(result.current.displayedSegmentId).toBe('seg-B');
    expect(result.current.displayedProgress).toBe(0);

    // Advance another 16ms so the catch-up tick fires and applies latestFrame
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current.displayedProgress).toBe(0);  // latestFrame was also progress=0 here

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Bug 1 fix: entering COMPLETING state must set displayed progress to 1.0
  // -----------------------------------------------------------------------
  it('sets displayedProgress to 1.0 (not last-seen) when entering COMPLETING state due to segment change', () => {
    // A@0.8 → B@0 batch: the hook enters COMPLETING for A.
    // Since B's arrival proves A is done, displayed must show A@1.0 so the
    // bar can animate forward to 100% naturally rather than stalling at 0.8.
    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.8 } }
    );

    expect(result.current.displayedProgress).toBe(0.8);

    // Batched arrival of B@0 (A never reached 1.0 in props before B started)
    rerender({ segmentId: 'seg-B', progress: 0 });

    // displayedSegmentId must still be A (completing state)
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(true);
    // displayedProgress must be forced to 1.0 (not 0.8)
    expect(result.current.displayedProgress).toBe(1.0);
    // etaSeconds must be nulled so the bar doesn't show a stale ETA
    expect(result.current.displayedEtaSeconds).toBeNull();
  });
});
