import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSegmentHandoffQueue, COMPLETION_HOLD_MS } from '@/hooks/useSegmentHandoffQueue';

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
  // Now includes 500ms hold before flush.
  // -----------------------------------------------------------------------
  it('captures pendingLatest frames and applies them one tick after mounting the pending segment (after hold)', () => {
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

    // DURING hold: seg-A still displayed, hasPending still true
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(true);

    // Advance through 500ms hold
    act(() => {
      vi.advanceTimersByTime(COMPLETION_HOLD_MS);
    });

    // After hold fires: seg-B should be mounted at 0 (start frame)
    expect(result.current.displayedSegmentId).toBe('seg-B');
    expect(result.current.displayedProgress).toBe(0);

    // After one tick (e.g. rAF / setTimeout): pendingLatest (0.45) should be applied
    act(() => {
      vi.advanceTimersByTime(16);
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
  // Now includes 500ms hold before seg-C mounts.
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

    // Visual completes; hold begins — still seg-A during hold
    act(() => {
      result.current.onVisualComplete();
    });
    expect(result.current.displayedSegmentId).toBe('seg-A');

    // Advance through hold — seg-C (latest) should mount, not seg-B
    act(() => {
      vi.advanceTimersByTime(COMPLETION_HOLD_MS);
    });
    expect(result.current.displayedSegmentId).toBe('seg-C');

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Test 5: When no pending exists, visual complete → new segment enters hold then swaps
  // -----------------------------------------------------------------------
  it('serves remaining hold when visual bar reaches 1.0 before new segment arrives, then swaps after hold', () => {
    vi.useFakeTimers();

    // Simulate: bar already reported onVisualComplete before new segment arrives
    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 1.0 } }
    );

    // Mark visual complete with no pending (early visual complete, no pending segment)
    act(() => {
      result.current.onVisualComplete();
    });

    // New segment arrives — still within hold window, so hold is entered
    rerender({ segmentId: 'seg-B', progress: 0 });
    // seg-A still displayed during remaining hold
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(true);

    // Advance through full hold
    act(() => {
      vi.advanceTimersByTime(COMPLETION_HOLD_MS);
    });
    expect(result.current.displayedSegmentId).toBe('seg-B');
    expect(result.current.hasPending).toBe(false);

    // Catch-up tick
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current.displayedSegmentId).toBe('seg-B');

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Test 6 (Bug 1): visualCompleteRef must be reset on flush so third segment queues
  // -----------------------------------------------------------------------
  it('queues a third segment (C) even though the first handoff (A→B) used the remaining-hold path', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.5 } }
    );

    // A reaches visual 1.0 — sets visualCompleteRef=true (no pending yet)
    act(() => {
      result.current.notifyDisplayProgress(1.0);
    });

    // B starts — enters remaining-hold path (visual was complete, hold not yet elapsed)
    rerender({ segmentId: 'seg-B', progress: 0 });
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(true);

    // Advance through full hold — B now mounted
    act(() => {
      vi.advanceTimersByTime(COMPLETION_HOLD_MS);
    });
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

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Test 7 (Bug 2): safety timeout + hold flushes pending when bar never reaches 100%
  // The safety timer fires after 3000ms, then the 500ms hold fires before flush.
  // -----------------------------------------------------------------------
  it('force-flushes pending segment after 3000ms safety + 500ms hold if onVisualComplete never fires', () => {
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

    // Advance past the 3000ms safety timeout — hold starts but seg-B not yet mounted
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Still in hold phase (displayed is still seg-A, hasPending still true)
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(true);

    // Advance through the 500ms hold
    act(() => {
      vi.advanceTimersByTime(COMPLETION_HOLD_MS);
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

  // -----------------------------------------------------------------------
  // NEW: End-of-chapter sentinel handoff
  // -----------------------------------------------------------------------
  it('end-of-chapter: defers sentinel when displayed is real and mid-animation', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.8 } }
    );

    // Job finishes: input becomes sentinel
    rerender({ segmentId: 'none', progress: 0 });

    // Displayed stays seg-A, driven to 1.0, hasPending true
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.displayedProgress).toBe(1.0);
    expect(result.current.hasPending).toBe(true);

    // Notify visual 100%
    act(() => {
      result.current.notifyDisplayProgress(1.0);
    });

    // During hold: still seg-A
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(true);

    // Advance through hold
    act(() => {
      vi.advanceTimersByTime(COMPLETION_HOLD_MS);
    });

    // Now sentinel is displayed, hasPending false
    expect(result.current.displayedSegmentId).toBe('none');
    expect(result.current.hasPending).toBe(false);

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // NEW: 500ms hold mid-chapter
  // -----------------------------------------------------------------------
  it('500ms hold mid-chapter: segA still shown for full hold duration after visual 100%', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.8 } }
    );

    rerender({ segmentId: 'seg-B', progress: 0 });
    expect(result.current.displayedSegmentId).toBe('seg-A');

    // Visual 100% fires
    act(() => {
      result.current.notifyDisplayProgress(1.0);
    });

    // Still seg-A during hold
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(true);

    // 499ms — still in hold
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current.displayedSegmentId).toBe('seg-A');

    // 1ms more → hold fires → seg-B mounted at 0
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.displayedSegmentId).toBe('seg-B');
    expect(result.current.displayedProgress).toBe(0);

    // 16ms catch-up tick
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current.displayedSegmentId).toBe('seg-B');

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // NEW: Safety timer + hold for sentinel (end-of-chapter safety path)
  // -----------------------------------------------------------------------
  it('safety timer + hold flush to sentinel when notifyDisplayProgress never called (end-of-chapter)', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.8 } }
    );

    // Job ends: sentinel arrives
    rerender({ segmentId: 'none', progress: 0 });
    expect(result.current.hasPending).toBe(true);
    expect(result.current.displayedSegmentId).toBe('seg-A');

    // Advance 3000ms safety timer — hold begins
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    // Still in hold
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(true);

    // Advance 500ms hold
    act(() => {
      vi.advanceTimersByTime(COMPLETION_HOLD_MS);
    });

    // Sentinel now displayed
    expect(result.current.displayedSegmentId).toBe('none');
    expect(result.current.hasPending).toBe(false);

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // NEW (race fix): serves remaining hold when visual completes before sentinel arrives
  // -----------------------------------------------------------------------
  it('serves remaining hold when visual completes before sentinel arrives', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.8 } }
    );

    // Visual bar reaches 100% with no pending segment yet
    act(() => {
      result.current.notifyDisplayProgress(1.0);
    });
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(false);

    // 200ms elapses before sentinel arrives (300ms of hold remaining)
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Sentinel arrives — should NOT swap immediately; remaining hold = 300ms
    rerender({ segmentId: 'none', progress: 0 });
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(true);

    // 299ms more — still in hold
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current.displayedSegmentId).toBe('seg-A');

    // 1ms more — hold fires, sentinel displayed
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.displayedSegmentId).toBe('none');
    expect(result.current.hasPending).toBe(false);

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // NEW (race fix): serves remaining hold when visual completes before next segment arrives
  // -----------------------------------------------------------------------
  it('serves remaining hold when visual completes before next real segment arrives', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.9 } }
    );

    // Visual bar reaches 100% — no pending yet
    act(() => {
      result.current.notifyDisplayProgress(1.0);
    });
    expect(result.current.hasPending).toBe(false);

    // 200ms elapses, then seg-B arrives
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ segmentId: 'seg-B', progress: 0 });
    // Should hold for remaining ~300ms, not swap immediately
    expect(result.current.displayedSegmentId).toBe('seg-A');
    expect(result.current.hasPending).toBe(true);

    // Advance through remaining hold (300ms) + catch-up tick (16ms)
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // After hold: seg-B mounted at 0
    expect(result.current.displayedSegmentId).toBe('seg-B');
    expect(result.current.displayedProgress).toBe(0);

    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current.displayedSegmentId).toBe('seg-B');

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // NEW (race fix): swap is immediate when hold has already elapsed before swap arrives
  // -----------------------------------------------------------------------
  it('swap is immediate when hold already elapsed before swap arrives', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ segmentId, progress }: { segmentId: string; progress: number }) =>
        useSegmentHandoffQueue({ jobId: 'job-1', segmentId, progress, status: 'running' }),
      { initialProps: { segmentId: 'seg-A', progress: 0.9 } }
    );

    // Visual bar reaches 100% — no pending yet
    act(() => {
      result.current.notifyDisplayProgress(1.0);
    });

    // 600ms elapses — well past the 500ms hold
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // seg-B arrives after hold has elapsed — should mount immediately
    rerender({ segmentId: 'seg-B', progress: 0 });
    expect(result.current.displayedSegmentId).toBe('seg-B');
    expect(result.current.hasPending).toBe(false);

    vi.useRealTimers();
  });
});
