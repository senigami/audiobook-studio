/**
 * useSystemResourceSamples — polls GET /api/system/resources every 2s and
 * keeps a rolling buffer (~30 samples / 60s window) for the Activity page's
 * SystemResourceStrip sparklines.
 *
 * `hasVram` uses a 2-consecutive-miss rule: the VRAM row is only declared
 * absent for the session after 2 consecutive polls come back without vram
 * fields, so a single dropped/null sample doesn't flicker the row in and
 * out. Once vram fields are seen again the miss streak resets and hasVram
 * flips back to true.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '@/api';

export interface SystemResourceSample {
  t: number;
  cpuPct: number;
  ramUsedGB: number;
  ramTotalGB: number;
  vramUsedGB?: number;
  vramTotalGB?: number;
}

const POLL_INTERVAL_MS = 2000;
const MAX_SAMPLES = 30;
const VRAM_MISS_THRESHOLD = 2;

export function useSystemResourceSamples(): {
  samples: SystemResourceSample[];
  hasVram: boolean;
} {
  const [samples, setSamples] = useState<SystemResourceSample[]>([]);
  const [hasVram, setHasVram] = useState(false);
  const vramMissStreakRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      api.fetchSystemResources()
        .then((data) => {
          if (cancelled) return;

          const hasVramFields = data.vram_used_gb !== null && data.vram_used_gb !== undefined
            && data.vram_total_gb !== null && data.vram_total_gb !== undefined;

          if (hasVramFields) {
            vramMissStreakRef.current = 0;
            setHasVram(true);
          } else {
            vramMissStreakRef.current += 1;
            if (vramMissStreakRef.current >= VRAM_MISS_THRESHOLD) {
              setHasVram(false);
            }
          }

          const sample: SystemResourceSample = {
            t: Date.now(),
            cpuPct: data.cpu_pct,
            ramUsedGB: data.ram_used_gb,
            ramTotalGB: data.ram_total_gb,
            ...(hasVramFields ? { vramUsedGB: data.vram_used_gb as number, vramTotalGB: data.vram_total_gb as number } : {}),
          };

          setSamples((prev) => {
            const next = [...prev, sample];
            return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
          });
        })
        .catch(() => {
          // Boundary fetch failure: skip this tick, keep polling. Never
          // fabricate a sample on error.
        });
    };

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return { samples, hasVram };
}
