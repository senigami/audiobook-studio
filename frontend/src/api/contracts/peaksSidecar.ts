// Contract for the server-computed peaks sidecar (task 006/007 backend,
// task 008 frontend consumer) served at
// GET /api/projects/{pid}/chapters/{cid}/assets/peaks?filename=<wav>
// (app/api/routers/chapters_assets.py). Lets long chapters (over
// TAPE_DURATION_CAP_SEC) feed WaveformTape's usePeaks from a precomputed
// array instead of a browser AudioContext decode.

// Bump in lockstep with SIDECAR_VERSION in app/engines/audio_ops.py — that
// constant is the source of truth. A mismatch here silently makes every
// sidecar fetch look "invalid" and permanently falls back to plain-bar/no
// tape for long chapters, so treat any backend version bump as a required
// same-change update here (this is exactly what happened when the backend
// moved 1 -> 2 and this file was not updated alongside it).
export const CURRENT_SIDECAR_VERSION = 2;

export interface PeaksSidecar {
  version: typeof CURRENT_SIDECAR_VERSION;
  peaks: number[];
  duration_sec: number;
  sample_rate: number;
  channels: number;
  peaks_per_sec: number;
  source: { filename: string; size_bytes: number; mtime_ns: number };
}

/**
 * Validates and extracts the peaks array from an untrusted JSON payload.
 * Returns null (rather than throwing) on any shape/version mismatch or an
 * out-of-range value, so callers can fall back to browser decode.
 */
export function parsePeaksSidecar(json: unknown): number[] | null {
  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;
  if (obj.version !== CURRENT_SIDECAR_VERSION || !Array.isArray(obj.peaks)) return null;
  const peaks = obj.peaks;
  if (!peaks.every(p => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1)) {
    return null;
  }
  return peaks as number[];
}
