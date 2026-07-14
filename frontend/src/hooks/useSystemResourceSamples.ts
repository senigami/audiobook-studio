/**
 * useSystemResourceSamples — polls GET /api/system/resources every 2s and
 * keeps a rolling buffer (~30 samples / 60s window) for the Activity page's
 * SystemResourceStrip sparklines.
 *
 * Polling is a MODULE-LEVEL singleton, not per-mount: it starts the first
 * time any component subscribes and then keeps running for the lifetime of
 * the tab, independent of whether the Activity page is currently mounted.
 * Navigating away and back re-subscribes to the same running buffer instead
 * of restarting it empty. The buffer is also mirrored to `sessionStorage` so
 * a full page reload within the same browser session restores the recent
 * history instead of starting from blank.
 *
 * `hasVram` uses a 2-consecutive-miss rule: the VRAM row is only declared
 * absent for the session after 2 consecutive polls come back without vram
 * fields, so a single dropped/null sample doesn't flicker the row in and
 * out. Once vram fields are seen again the miss streak resets and hasVram
 * flips back to true.
 */
import { useSyncExternalStore } from 'react';
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
const SESSION_STORAGE_KEY = 'studio.systemResourceSamples.v1';

interface Snapshot {
  samples: SystemResourceSample[];
  hasVram: boolean;
}

function loadPersistedSamples(): SystemResourceSample[] {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SystemResourceSample[]).slice(-MAX_SAMPLES) : [];
  } catch {
    return [];
  }
}

function persistSamples(samples: SystemResourceSample[]): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(samples));
  } catch {
    // Storage unavailable/full — the in-memory buffer still works this tab.
  }
}

let snapshot: Snapshot = { samples: loadPersistedSamples(), hasVram: false };
const listeners = new Set<() => void>();
let vramMissStreak = 0;
let pollingStarted = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

function setSnapshot(next: Snapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function poll(): void {
  api.fetchSystemResources()
    .then((data) => {
      const hasVramFields = data.vram_used_gb !== null && data.vram_used_gb !== undefined
        && data.vram_total_gb !== null && data.vram_total_gb !== undefined;

      let hasVram = snapshot.hasVram;
      if (hasVramFields) {
        vramMissStreak = 0;
        hasVram = true;
      } else {
        vramMissStreak += 1;
        if (vramMissStreak >= VRAM_MISS_THRESHOLD) hasVram = false;
      }

      const sample: SystemResourceSample = {
        t: Date.now(),
        cpuPct: data.cpu_pct,
        ramUsedGB: data.ram_used_gb,
        ramTotalGB: data.ram_total_gb,
        ...(hasVramFields ? { vramUsedGB: data.vram_used_gb as number, vramTotalGB: data.vram_total_gb as number } : {}),
      };

      const nextSamples = [...snapshot.samples, sample];
      const trimmed = nextSamples.length > MAX_SAMPLES ? nextSamples.slice(nextSamples.length - MAX_SAMPLES) : nextSamples;
      persistSamples(trimmed);
      setSnapshot({ samples: trimmed, hasVram });
    })
    .catch(() => {
      // Boundary fetch failure: skip this tick, keep polling. Never
      // fabricate a sample on error.
    });
}

/** Idempotent — safe to call from every subscriber; only the first call actually starts the interval. */
function ensurePolling(): void {
  if (pollingStarted) return;
  pollingStarted = true;
  poll();
  intervalId = setInterval(poll, POLL_INTERVAL_MS);
}

/**
 * Test-only: tears down the module singleton (interval + buffered state) so
 * each test starts from a clean slate. Not used by app code — the whole
 * point of this store is that it normally never resets for the tab's life.
 */
export function __resetSystemResourceSamplesForTests(): void {
  if (intervalId !== null) clearInterval(intervalId);
  intervalId = null;
  pollingStarted = false;
  vramMissStreak = 0;
  snapshot = { samples: [], hasVram: false };
  listeners.clear();
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function subscribe(listener: () => void): () => void {
  ensurePolling();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Snapshot {
  return snapshot;
}

export function useSystemResourceSamples(): {
  samples: SystemResourceSample[];
  hasVram: boolean;
} {
  return useSyncExternalStore(subscribe, getSnapshot);
}
