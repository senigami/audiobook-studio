/**
 * useEngineConcurrency — polls GET /api/engines/concurrency (W-PAR task 014's
 * live per-engine cap admission endpoint) and exposes each engine's current
 * *effective* cap by engine_id, so UI captions can show the real live limit
 * instead of a hardcoded guess.
 */
import { useEffect, useState } from 'react';
import { api } from '@/api';

const POLL_INTERVAL_MS = 5000;

export function useEngineConcurrency(): { engineCaps: Record<string, number> } {
  const [engineCaps, setEngineCaps] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      api.fetchEngineConcurrency()
        .then((data) => {
          if (cancelled) return;
          const next: Record<string, number> = {};
          for (const entry of data.engines ?? []) {
            next[entry.engine_id] = entry.effective_cap;
          }
          setEngineCaps(next);
        })
        .catch(() => {
          // Boundary fetch failure: skip this tick, keep polling. Callers
          // fall back to their own default cap when a lookup misses.
        });
    };

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return { engineCaps };
}
