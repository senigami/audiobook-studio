/**
 * rafControl.ts
 *
 * Deterministic `requestAnimationFrame`/`cancelAnimationFrame` stand-in for
 * components that run a continuous rAF polling loop (WaveformTape.tsx: an
 * unconditional 60Hz loop for the lifetime of the mount).
 *
 * Why this exists (R4 — no sleep-based/real-timer timing, testing-standards.md):
 * jsdom's real `requestAnimationFrame` is backed by a real ~16ms setTimeout.
 * A component that reschedules itself every frame for as long as it's
 * mounted keeps that real timer armed for the ENTIRE test, including every
 * `await waitFor(...)` polling window after render. Under CI/Docker load
 * (slower wall clock, no real 60fps cadence guarantee), extra frames can
 * fire in the gaps between a test's `act()`/`waitFor()` calls and its
 * assertions, updating component state outside `act()` and racing the
 * assertions — this was the confirmed cause of the WaveformTape suite's
 * cross-CI-run flakiness (issue #214): the same test failed on a different
 * assertion each run.
 *
 * `installControlledRaf()` replaces both globals with a manual queue: a
 * callback is recorded but never fires on its own. Call `flush()` to run
 * exactly one queued frame per call, synchronously, from the test — the
 * component's polling loop then advances by exactly the number of frames
 * the test asked for and no more. `vi.spyOn` on top of these mocks still
 * observes real calls (they're plain functions, not real timers), so
 * existing `toHaveBeenCalled()`-style assertions on rAF/cAF keep working.
 */
export interface ControlledRaf {
  /** Synchronously invokes `times` pending frame(s), oldest first. */
  flush: (times?: number) => void;
  /** Restores the previous window.requestAnimationFrame/cancelAnimationFrame. */
  uninstall: () => void;
}

export function installControlledRaf(): ControlledRaf {
  const originalRaf = window.requestAnimationFrame;
  const originalCaf = window.cancelAnimationFrame;

  let nextId = 1;
  const queue = new Map<number, FrameRequestCallback>();

  window.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  }) as typeof window.requestAnimationFrame;

  window.cancelAnimationFrame = ((id: number): void => {
    queue.delete(id);
  }) as typeof window.cancelAnimationFrame;

  return {
    flush(times = 1) {
      for (let i = 0; i < times; i++) {
        const oldestId = Math.min(...queue.keys());
        if (!Number.isFinite(oldestId)) return; // nothing queued
        const cb = queue.get(oldestId);
        queue.delete(oldestId);
        cb?.(performance.now());
      }
    },
    uninstall() {
      window.requestAnimationFrame = originalRaf;
      window.cancelAnimationFrame = originalCaf;
      queue.clear();
    },
  };
}
