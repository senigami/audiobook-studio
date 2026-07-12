import React from 'react';
import type { SystemResourceSample } from '@/hooks/useSystemResourceSamples';

export interface SystemResourceStripProps {
  samples: SystemResourceSample[];
  hasVram: boolean;
  loading?: boolean;
}

const HIGH_PRESSURE_THRESHOLD = 90;
const HIGH_PRESSURE_SUSTAIN_COUNT = 2;

const SPARK_WIDTH = 60;
const SPARK_HEIGHT = 18;

/** Is the trailing `pcts` series in a sustained (>= N consecutive) high-pressure state? */
function isSustainedHighPressure(pcts: number[]): boolean {
  if (pcts.length < HIGH_PRESSURE_SUSTAIN_COUNT) return false;
  const trailing = pcts.slice(-HIGH_PRESSURE_SUSTAIN_COUNT);
  return trailing.every((p) => p >= HIGH_PRESSURE_THRESHOLD);
}

function buildSparklinePoints(pcts: number[]): string {
  if (pcts.length === 0) return '';
  if (pcts.length === 1) {
    const y = SPARK_HEIGHT - (pcts[0] / 100) * SPARK_HEIGHT;
    return `0,${y.toFixed(1)} ${SPARK_WIDTH},${y.toFixed(1)}`;
  }
  const step = SPARK_WIDTH / (pcts.length - 1);
  return pcts
    .map((p, i) => {
      const x = i * step;
      const y = SPARK_HEIGHT - (Math.max(0, Math.min(100, p)) / 100) * SPARK_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

interface ResourceRowProps {
  label: string;
  pcts: number[];
  valueText: string;
  accessibleText: string;
  loading: boolean;
}

const ResourceRow: React.FC<ResourceRowProps> = ({ label, pcts, valueText, accessibleText, loading }) => {
  const highPressure = !loading && isSustainedHighPressure(pcts);
  const dotColor = highPressure ? 'var(--warning-text-strong)' : 'var(--accent)';
  const valueColor = highPressure ? 'var(--warning-text-strong)' : 'var(--text-primary)';

  const lastPoint = (() => {
    if (loading || pcts.length === 0) return null;
    const step = pcts.length > 1 ? SPARK_WIDTH / (pcts.length - 1) : SPARK_WIDTH;
    const x = pcts.length > 1 ? (pcts.length - 1) * step : SPARK_WIDTH;
    const y = SPARK_HEIGHT - (Math.max(0, Math.min(100, pcts[pcts.length - 1])) / 100) * SPARK_HEIGHT;
    return { x, y };
  })();

  return (
    <div className="system-resource-strip__row">
      <span className="system-resource-strip__label">{label}</span>
      <svg width={SPARK_WIDTH} height={SPARK_HEIGHT} aria-hidden="true" className="system-resource-strip__spark">
        {loading || pcts.length === 0 ? (
          <line
            x1={0}
            y1={SPARK_HEIGHT / 2}
            x2={SPARK_WIDTH}
            y2={SPARK_HEIGHT / 2}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ) : (
          <>
            <polyline
              points={buildSparklinePoints(pcts)}
              fill="none"
              stroke="var(--color-wave)"
              strokeWidth={1}
            />
            {lastPoint && <circle cx={lastPoint.x} cy={lastPoint.y} r={2} fill={dotColor} />}
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
