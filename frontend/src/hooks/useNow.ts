/**
 * useNow — shared 1-second clock hook (P6: dedup duplicate interval timers).
 *
 * Returns the current timestamp (ms) updated once per second. Callers share
 * the same interval via a module-level ref-count so N mounted components
 * produce exactly one `setInterval`, not N.
 */
import { useEffect, useState } from 'react';

let refCount = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(now: number) => void>();

const tick = () => {
  const now = Date.now();
  listeners.forEach(fn => fn(now));
};

const subscribe = (fn: (now: number) => void) => {
  listeners.add(fn);
  refCount++;
  if (refCount === 1) {
    intervalId = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(fn);
    refCount--;
    if (refCount === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
};

/** Reset shared state for tests. */
export const resetUseNowForTests = () => {
  listeners.clear();
  refCount = 0;
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
};

export const useNow = (): number => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => subscribe(setNow), []);
  return now;
};
