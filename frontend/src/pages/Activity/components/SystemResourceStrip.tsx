import React from 'react';
import type { SystemResourceSample } from '@/hooks/useSystemResourceSamples';
import { smoothPath } from './smoothPath';

// Moderate smoothing — rounded enough to look refined, but not so much that
// spikes flatten into sine-like hills.
const SMOOTHING = 0.65;

export interface SystemResourceStripProps {
  samples: SystemResourceSample[];
  hasVram: boolean;
  loading?: boolean;
}

const HIGH_PRESSURE_THRESHOLD = 90;
const HIGH_PRESSURE_SUSTAIN_COUNT = 2;
const ELEVATED_PRESSURE_THRESHOLD = 70;

const SPARK_WIDTH = 60;
const SPARK_HEIGHT = 18;

type PressureTier = 'normal' | 'elevated' | 'hot';

/** Is the trailing `pcts` series in a sustained (>= N consecutive) high-pressure state? */
function isSustainedHighPressure(pcts: number[]): boolean {
  if (pcts.length < HIGH_PRESSURE_SUSTAIN_COUNT) return false;
  const trailing = pcts.slice(-HIGH_PRESSURE_SUSTAIN_COUNT);
  return trailing.every((p) => p >= HIGH_PRESSURE_THRESHOLD);
}

/** Current intensity tier: sustained-hot (alarm) > elevated (current reading only, no sustain gate) > normal. */
function pressureTier(pcts: number[]): PressureTier {
  if (isSustainedHighPressure(pcts)) return 'hot';
  const last = pcts[pcts.length - 1];
  if (last !== undefined && last >= ELEVATED_PRESSURE_THRESHOLD) return 'elevated';
  return 'normal';
}

function scaleY(p: number): number {
  return SPARK_HEIGHT - (Math.max(0, Math.min(100, p)) / 100) * SPARK_HEIGHT;
}

function sparklinePts(pcts: number[]): { x: number; y: number }[] {
  if (pcts.length === 0) return [];
  if (pcts.length === 1) {
    const y = scaleY(pcts[0]);
    return [
      { x: 0, y },
      { x: SPARK_WIDTH, y },
    ];
  }
  const step = SPARK_WIDTH / (pcts.length - 1);
  return pcts.map((p, i) => ({ x: i * step, y: scaleY(p) }));
}

/** Smoothed line path through the trailing samples. */
function buildSparklineLinePath(pcts: number[]): string {
  return smoothPath(sparklinePts(pcts), SMOOTHING);
}

/** Baseline-anchored fill path: the smoothed sparkline line, dropped down to the bottom edge and closed. */
function buildSparklineAreaPath(pcts: number[]): string {
  const pts = sparklinePts(pcts);
  if (pts.length === 0) return '';
  const line = smoothPath(pts, SMOOTHING);
  const lastX = pts[pts.length - 1].x;
  return `${line} L${lastX.toFixed(1)},${SPARK_HEIGHT} L0,${SPARK_HEIGHT} Z`;
}

interface ResourceRowProps {
  label: string;
  pcts: number[];
  valueText: string;
  accessibleText: string;
  loading: boolean;
}

const TIER_COLOR: Record<PressureTier, string> = {
  normal: 'var(--accent)',
  elevated: 'var(--warning-text-strong)',
  hot: 'var(--error)',
};

const ResourceRow: React.FC<ResourceRowProps> = ({ label, pcts, valueText, accessibleText, loading }) => {
  const tier = loading ? 'normal' : pressureTier(pcts);
  const tierColor = TIER_COLOR[tier];
  const valueColor = tier === 'normal' ? 'var(--text-primary)' : tierColor;
  const currentPct = !loading && pcts.length > 0 ? Math.max(0, Math.min(100, pcts[pcts.length - 1])) : 0;

  const lastPoint = (() => {
    if (loading || pcts.length === 0) return null;
    const step = pcts.length > 1 ? SPARK_WIDTH / (pcts.length - 1) : SPARK_WIDTH;
    const x = pcts.length > 1 ? (pcts.length - 1) * step : SPARK_WIDTH;
    const y = scaleY(pcts[pcts.length - 1]);
    return { x, y };
  })();

  const thresholdY = scaleY(HIGH_PRESSURE_THRESHOLD);

  return (
    <div className="system-resource-strip__row-wrap">
      <div className="system-resource-strip__row">
        <span className="system-resource-strip__label">{label}</span>
        <svg
          viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="system-resource-strip__spark"
        >
          {loading || pcts.length === 0 ? (
            <line
              x1={0}
              y1={SPARK_HEIGHT / 2}
              x2={SPARK_WIDTH}
              y2={SPARK_HEIGHT / 2}
              stroke="var(--border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <>
              <line
                x1={0}
                y1={thresholdY}
                x2={SPARK_WIDTH}
                y2={thresholdY}
                stroke="var(--border)"
                strokeWidth={0.75}
                strokeDasharray="2,1.5"
                vectorEffect="non-scaling-stroke"
              />
              <path d={buildSparklineAreaPath(pcts)} fill={tierColor} fillOpacity={0.16} stroke="none" />
              <path
                d={buildSparklineLinePath(pcts)}
                fill="none"
                stroke={tierColor}
                strokeWidth={1.25}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {lastPoint && (
                // Zero-length round-capped stroke instead of a <circle>: with
                // preserveAspectRatio="none" the viewBox scales x/y unevenly,
                // which stretches a plain circle into an ellipse. A stroke's
                // round linecap is drawn in unscaled stroke-space (especially
                // with vector-effect), so it stays a true circle.
                <path
                  d={`M${lastPoint.x.toFixed(1)},${lastPoint.y.toFixed(1)} l 0.01 0`}
                  stroke={tierColor}
                  strokeWidth={4}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </>
          )}
        </svg>
        <span
          className="system-resource-strip__value"
          style={{ color: loading ? 'var(--text-muted)' : valueColor }}
        >
          {loading ? '—' : valueText}
        </span>
        <span className="sr-only">{accessibleText}</span>
      </div>
      <div className="system-resource-strip__meter-row">
        <span className="system-resource-strip__label-spacer" aria-hidden="true" />
        <div className="system-resource-strip__meter" aria-hidden="true">
          <div
            className="system-resource-strip__meter-fill"
            style={{ width: `${currentPct}%`, background: loading ? 'var(--border)' : tierColor }}
          />
        </div>
        <span className="system-resource-strip__value-spacer" aria-hidden="true" />
      </div>
    </div>
  );
};

export const SystemResourceStrip: React.FC<SystemResourceStripProps> = ({ samples, hasVram, loading = false }) => {
  const cpuPcts = samples.map((s) => s.cpuPct);
  const ramPcts = samples.map((s) => (s.ramTotalGB > 0 ? (s.ramUsedGB / s.ramTotalGB) * 100 : 0));
  const vramPcts = samples
    .filter((s) => s.vramUsedGB !== undefined && s.vramTotalGB !== undefined && (s.vramTotalGB as number) > 0)
    .map((s) => ((s.vramUsedGB as number) / (s.vramTotalGB as number)) * 100);

  const lastSample = samples[samples.length - 1];

  const cpuValueText = lastSample ? `${Math.round(lastSample.cpuPct)}%` : '—';
  const ramValueText = lastSample ? `${lastSample.ramUsedGB.toFixed(1)}/${lastSample.ramTotalGB.toFixed(0)} GB` : '—';
  const vramValueText = vramPcts.length > 0 ? `${Math.round(vramPcts[vramPcts.length - 1])}%` : '—';

  return (
    <div className="system-resource-strip">
      <h2 className="label-uppercase-sm">System</h2>
      <div className="system-resource-strip__rows">
        <ResourceRow
          label="CPU"
          pcts={cpuPcts}
          valueText={cpuValueText}
          accessibleText={lastSample ? `CPU: ${Math.round(lastSample.cpuPct)} percent` : 'CPU: no data yet'}
          loading={loading}
        />
        <ResourceRow
          label="RAM"
          pcts={ramPcts}
          valueText={ramValueText}
          accessibleText={
            lastSample
              ? `RAM: ${lastSample.ramUsedGB.toFixed(1)} of ${lastSample.ramTotalGB.toFixed(0)} gigabytes`
              : 'RAM: no data yet'
          }
          loading={loading}
        />
        {hasVram && (
          <ResourceRow
            label="VRAM"
            pcts={vramPcts}
            valueText={vramValueText}
            accessibleText={vramPcts.length > 0 ? `VRAM: ${Math.round(vramPcts[vramPcts.length - 1])} percent` : 'VRAM: no data yet'}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
};
