import { useEffect, useRef, useState } from 'react';

interface EasedProgressOptions {
  /** Smoothing time constant in ms. Larger = gentler/slower glide. Default 700. */
  timeConstantMs?: number;
  /** Animation step interval in ms. Default ~33ms (~30fps). */
  stepMs?: number;
}

/**
 * Eases a displayed progress value toward `target` so that coarse, unevenly-spaced
 * datapoints render as a continuous fill instead of snapping.
 *
 * Motivation: XTTS reports synthesis progress only at chunk boundaries — a short
 * segment yields just 0 → 0.33 → 0.66 → 1.0, spaced 1–5s apart. The predictive
 * progress BAR catches up to each datapoint over ~750ms then idles, which reads as
 * a "quick start" on the segment TEXT reveal that rides that value. This hook
 * decouples the text reveal: it glides toward each datapoint over ~the inter-update
 * interval. It drives the text reveal ONLY — the progress bar is unaffected.
 *
 * Behaviour:
 *  - exponential approach (frame-rate independent) toward `target`;
 *  - forward-only within a segment (a regressing target never pulls the fill back);
 *  - resets to 0 when `resetKey` (the active segment id) changes.
 */
export function useEasedProgress(
  target: number,
  resetKey: string | null,
  options?: EasedProgressOptions,
): number {
  const timeConstantMs = Math.max(1, options?.timeConstantMs ?? 700);
  const stepMs = Math.max(1, options?.stepMs ?? 33);
  const [displayed, setDisplayed] = useState(0);
  const displayedRef = useRef(0);
  const targetRef = useRef(0);
  useEffect(() => {
    targetRef.current = Number.isFinite(target) ? Math.max(0, Math.min(1, target)) : 0;
  }, [target]);

  // New segment → start the fill over from empty.
  useEffect(() => {
    displayedRef.current = 0;
    setDisplayed(0);
  }, [resetKey]);

  useEffect(() => {
    const alpha = 1 - Math.exp(-stepMs / timeConstantMs);
    const id = setInterval(() => {
      const t = targetRef.current;
      const cur = displayedRef.current;
      const gap = t - cur;
      if (gap <= 0) return; // forward-only; idle once caught up
      let next = cur + gap * alpha;
      if (t - next < 0.001) next = t; // settle onto the datapoint
      displayedRef.current = next;
      setDisplayed(next);
    }, stepMs);
    return () => clearInterval(id);
  }, [resetKey, stepMs, timeConstantMs]);

  return displayed;
}
