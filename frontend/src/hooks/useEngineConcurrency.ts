/**
 * useEngineConcurrency — polls GET /api/engines/concurrency (W-PAR task 014's
 * live per-engine cap admission endpoint) and exposes each engine's current
 * *effective* cap by engine_id, so UI captions can show the real live limit
 * instead of a hardcoded guess. It also exposes the safe maximums the server
 * will accept right now, so a stepper never offers a value the save would refuse.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/api';

const POLL_INTERVAL_MS = 5000;

export interface EngineConcurrencyLimits {
  engineCaps: Record<string, number>;
  /** engine_id -> the most this computer can safely run at once right now. */
  safeMax: Record<string, number>;
  /** Largest safe global cap, or null until the first poll answers. */
  globalSafeMax: number | null;
  /** False when the server could not read this computer's memory. */
  memoryMeasurable: boolean;
  /** Re-poll now (call after a refused or accepted save). */
  refresh: () => void;
}

export function useEngineConcurrency(): EngineConcurrencyLimits {
  const [engineCaps, setEngineCaps] = useState<Record<string, number>>({});
  const [safeMax, setSafeMax] = useState<Record<string, number>>({});
  const [globalSafeMax, setGlobalSafeMax] = useState<number | null>(null);
  const [memoryMeasurable, setMemoryMeasurable] = useState(true);
  const pollRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      api.fetchEngineConcurrency()
        .then((data) => {
          if (cancelled) return;
          const caps: Record<string, number> = {};
          const safe: Record<string, number> = {};
          for (const entry of data.engines ?? []) {
            caps[entry.engine_id] = entry.effective_cap;
            if (typeof entry.safe_max === 'number') safe[entry.engine_id] = entry.safe_max;
          }
          setEngineCaps(caps);
          setSafeMax(safe);
          setGlobalSafeMax(typeof data.global_safe_max === 'number' ? data.global_safe_max : null);
          setMemoryMeasurable(data.memory_measurable !== false);
        })
        .catch(() => {
          // Boundary fetch failure: skip this tick, keep polling and keep the
          // last good limits on screen. Callers fall back to their own default
          // cap when a lookup misses.
        });
    };

    pollRef.current = poll;
    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const refresh = useCallback(() => pollRef.current(), []);

  return { engineCaps, safeMax, globalSafeMax, memoryMeasurable, refresh };
}
