/**
 * Per-segment animated progress for the concurrent (map-driven) render path.
 *
 * Under the chapter fan-out (W-PAR), N segments render simultaneously and each
 * carries its OWN entry in `active_segments_map` (keyed by real segment id,
 * with its own progress + eta_seconds). The raw entry values only step when a
 * real websocket frame lands (≥1% server gating), so feeding them directly to
 * ScriptView's text fill makes the highlight JUMP between percents — violating
 * progress-presentation.md §7 H5 ("the text fill MUST follow the bar's
 * *animated* display progress, never raw stepped event data"). The legacy
 * single-active-segment path satisfied H5 by feeding back the one
 * PredictiveProgressBar's interpolated `onDisplayProgress`; that feedback loop
 * is single-lane by construction and cannot serve N concurrent segments.
 *
 * This hook is the N-way equivalent: one independent lane per segment id,
 * REUSING the exact lane math the bar already uses
 * (`resolveEndAtMs`/`getLaneProgress` from predictiveProgressBarLane.ts) and
 * the same 250 ms tick cadence. Each lane anchors at the segment's latest real
 * (progress, eta) frame and interpolates toward the ETA end-time between
 * frames; entries whose values did not change are left untouched (each
 * segment filters the shared stream by its own id and animates independently).
 *
 * Rules preserved:
 * - Backend value is the authoritative floor: the displayed value never falls
 *   below the latest raw progress, and lanes never move backward.
 * - No fabrication: with no positive `eta_seconds` the lane holds at its
 *   anchor (no invented velocity); it advances again when a real ETA arrives.
 * - Only `rendering`-phase entries animate — `preparing` entries keep the
 *   pulse treatment (§2.7) and `done` entries are finished.
 */
import { useEffect, useRef, useState } from 'react';
import {
  getLaneProgress,
  resolveEndAtMs,
  type ProgressLane,
} from '@/components/progress/PredictiveProgressBar/predictiveProgressBarLane';

interface AnimatableSegmentEntry {
  phase: string;
  progress: number;
  eta_seconds: number | null;
}

interface SegmentLaneState {
  lane: ProgressLane;
  lastRaw: number;
  lastEta: number | null;
}

/** Same cadence as PredictiveProgressBar's default `tickMs`. */
const TICK_MS = 250;

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const computeDisplayed = (
  lanes: Map<string, SegmentLaneState>,
  nowMs: number,
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [segId, state] of lanes) {
    const laneValue = getLaneProgress(
      state.lane.startedAtMs,
      state.lane.endAtMs,
      state.lane.startProgress,
      nowMs,
    );
    // Authoritative floor: never display below the latest backend value.
    // Rounded to 4 decimals (mirrors the bar's onDisplayProgress throttle) so
    // sub-visible drift does not churn re-renders.
    out[segId] = Math.round(clamp01(Math.max(state.lastRaw, laneValue)) * 10000) / 10000;
  }
  return out;
};

const sameRecord = (a: Record<string, number>, b: Record<string, number>): boolean => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
};

/**
 * Returns a map of segment id → smoothly-interpolated display progress for
 * every `rendering`-phase entry of `activeSegmentsMap`. Segments absent from
 * the map (or not rendering) have no entry — callers fall back to raw values.
 */
export function useAnimatedSegmentProgress(
  activeSegmentsMap: Record<string, AnimatableSegmentEntry> | undefined | null,
): Record<string, number> {
  const lanesRef = useRef<Map<string, SegmentLaneState>>(new Map());
  const [displayed, setDisplayed] = useState<Record<string, number>>({});

  // Real websocket frames: rebuild only the lanes whose own entry changed —
  // per-id filtering, so an update for segment A never disturbs segment B's
  // in-flight animation.
  useEffect(() => {
    const lanes = lanesRef.current;
    const nowMs = Date.now();
    const liveIds = new Set<string>();
    let changed = false;

    for (const [segId, entry] of Object.entries(activeSegmentsMap ?? {})) {
      if (!entry || entry.phase !== 'rendering') continue;
      liveIds.add(segId);
      const raw = clamp01(entry.progress ?? 0);
      const eta = typeof entry.eta_seconds === 'number' && Number.isFinite(entry.eta_seconds) && entry.eta_seconds > 0
        ? entry.eta_seconds
        : null;
      const existing = lanes.get(segId);
      if (existing && existing.lastRaw === raw && existing.lastEta === eta) continue;

      // Continuity: the new lane starts where the animation currently IS (or
      // at the raw value when it is ahead — the backend floor wins), so a
      // real frame re-anchors velocity without a visual jump.
      const currentDisplay = existing
        ? getLaneProgress(
            existing.lane.startedAtMs,
            existing.lane.endAtMs,
            existing.lane.startProgress,
            nowMs,
          )
        : raw;
      const startProgress = clamp01(Math.max(raw, currentDisplay));
      const endAtMs = resolveEndAtMs({
        nowMs,
        etaSeconds: eta ?? undefined,
        etaBasis: 'remaining_from_update',
        updatedAt: nowMs / 1000,
        presentationState: 'running',
      });
      lanes.set(segId, {
        lane: { startedAtMs: nowMs, startProgress, endAtMs },
        lastRaw: raw,
        lastEta: eta,
      });
      changed = true;
    }

    for (const segId of Array.from(lanes.keys())) {
      if (!liveIds.has(segId)) {
        lanes.delete(segId);
        changed = true;
      }
    }

    if (changed) {
      setDisplayed(computeDisplayed(lanes, nowMs));
    }
  }, [activeSegmentsMap]);

  // 250 ms cadence between real frames — the interpolation driver. Keyed on a
  // boolean so websocket frame identity churn never resets the interval.
  const hasRenderingEntries = !!activeSegmentsMap
    && Object.values(activeSegmentsMap).some((entry) => entry?.phase === 'rendering');

  useEffect(() => {
    if (!hasRenderingEntries) return undefined;
    const interval = setInterval(() => {
      setDisplayed((prev) => {
        const next = computeDisplayed(lanesRef.current, Date.now());
        return sameRecord(prev, next) ? prev : next;
      });
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [hasRenderingEntries]);

  return displayed;
}
