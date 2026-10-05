/**
 * useEngineConcurrency — polls GET /api/engines/concurrency (W-PAR task 014's
 * live per-engine cap admission endpoint) and exposes each engine's current
 * *effective* cap by engine_id, so UI captions can show the real live limit
 * instead of a hardcoded guess. It also exposes the comfortable (safe) and hard maximums
 * right now: the stepper stops at the hard limit, the safe one only drives the guide.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/api';

const POLL_INTERVAL_MS = 5000;

export interface EngineConcurrencyLimits {
  engineCaps: Record<string, number>;
  /** engine_id -> the most this computer can safely run at once right now. */
  safeMax: Record<string, number>;
  /** engine_id -> the most the server will accept right now (above it a save is refused). */
  hardMax: Record<string, number>;
  /** Largest safe global cap, or null until the first poll answers. */
  globalSafeMax: number | null;
  /** Largest global cap the server will accept, or null until the first poll answers. */
  globalHardMax: number | null;
  /** The global cap in force (explicit or automatic), or null until the first poll answers. */
  globalCap: number | null;
  /** True when no global cap is saved and the server picked one. */
  globalCapIsAuto: boolean;
  /** False when the server could not read this computer's memory. */
  memoryMeasurable: boolean;
  /** Re-poll now (call after a refused or accepted save). */
  refresh: () => void;
}

export function useEngineConcurrency(): EngineConcurrencyLimits {
  const [engineCaps, setEngineCaps] = useState<Record<string, number>>({});
  const [safeMax, setSafeMax] = useState<Record<string, number>>({});
  const [hardMax, setHardMax] = useState<Record<string, number>>({});
  const [globalSafeMax, setGlobalSafeMax] = useState<number | null>(null);
  const [globalHardMax, setGlobalHardMax] = useState<number | null>(null);
  const [globalCap, setGlobalCap] = useState<number | null>(null);
  const [globalCapIsAuto, setGlobalCapIsAuto] = useState(false);
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
          const hard: Record<string, number> = {};
          for (const entry of data.engines ?? []) {
            caps[entry.engine_id] = entry.effective_cap;
            if (typeof entry.safe_max === 'number') safe[entry.engine_id] = entry.safe_max;
            if (typeof entry.hard_max === 'number') hard[entry.engine_id] = entry.hard_max;
          }
          setEngineCaps(caps);
          setSafeMax(safe);
          setHardMax(hard);
          setGlobalSafeMax(typeof data.global_safe_max === 'number' ? data.global_safe_max : null);
          setGlobalHardMax(typeof data.global_hard_max === 'number' ? data.global_hard_max : null);
          setGlobalCap(typeof data.global_cap === 'number' ? data.global_cap : null);
          setGlobalCapIsAuto(data.global_cap_is_auto === true);
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

  return {
    engineCaps, safeMax, hardMax, globalSafeMax, globalHardMax, globalCap, globalCapIsAuto, memoryMeasurable, refresh,
  };
}
