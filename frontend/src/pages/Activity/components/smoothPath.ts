/**
 * Catmull-Rom → cubic-bézier path builder for SVG line/area charts.
 * Returns an SVG path `d` string starting with `M` through each point using
 * `C` (cubic-bézier) commands. Returns `''` when fewer than 2 points are given.
 *
 * `smoothing` scales the control-point reach (0 = straight polyline / sharp
 * corners, 1 = full Catmull-Rom rounding). Lower values keep spikes sharp and
 * the line tracking the data, instead of rounding everything into sine-like
 * hills — so real telemetry reads as flat-with-spikes, lightly smoothed.
 */
export function smoothPath(pts: readonly { x: number; y: number }[], smoothing = 1): string {
  const first = pts[0];
  if (!first || pts.length < 2) return '';

  // Clamp control-point y to the data's own range. Catmull-Rom otherwise
  // overshoots past the data — after a sharp spike back to zero it dips the
  // curve below the lowest point, scooping under the baseline (negative). With
  // every control point inside [yMin, yMax], the bézier convex-hull property
  // keeps the whole curve within the data's vertical extent.
  let yMin = first.y;
  let yMax = first.y;
  for (const p of pts) {
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  const clampY = (y: number): number => (y < yMin ? yMin : y > yMax ? yMax : y);

  let d = `M${first.x.toFixed(1)},${first.y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    if (!p1 || !p2) continue;
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * smoothing;
    const c1y = clampY(p1.y + ((p2.y - p0.y) / 6) * smoothing);
    const c2x = p2.x - ((p3.x - p1.x) / 6) * smoothing;
    const c2y = clampY(p2.y - ((p3.y - p1.y) / 6) * smoothing);
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}
