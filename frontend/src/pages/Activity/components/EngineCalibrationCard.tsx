import React from 'react';
import type { TtsEngine } from '@/types';

type ConfidenceState = 'success' | 'warning' | 'muted';

const confidenceStateForPercent = (value?: number | null): ConfidenceState => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'muted';
  }
  if (value >= 70) return 'success';
  if (value >= 30) return 'warning';
  return 'muted';
};

const confidenceColorForState: Record<ConfidenceState, string> = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  muted: 'var(--text-muted)',
};

const formatSpeed = (value?: number | null): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'not calibrated';
  }
  return `${Number(value).toFixed(1)} c/s`;
};

export interface EngineCalibrationCardProps {
  engines: TtsEngine[];
}

export const EngineCalibrationCard: React.FC<EngineCalibrationCardProps> = ({ engines }) => {
  return (
    <section
      aria-label="Engine calibration"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1rem',
        borderRadius: 'var(--radius-panel)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Engine calibration
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {engines.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
            No engine calibration data yet.
          </div>
        ) : engines.map((engine) => {
          const confidenceState = confidenceStateForPercent(engine.calibration_confidence_percent);
          const speed = formatSpeed(engine.calibrated_cps);
          const confidenceLabel = typeof engine.calibration_confidence_percent === 'number'
            ? `${engine.calibration_confidence_percent}% confidence`
            : 'confidence unavailable';

          return (
            <div
              key={engine.engine_id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.7rem 0.8rem',
                borderRadius: '12px',
                border: '1px solid var(--border)',
                background: 'var(--background)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {engine.display_name}
                </div>
              </div>

              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {speed}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                <span
                  data-testid={`engine-calibration-confidence-${engine.engine_id}`}
                  data-confidence-state={confidenceState}
                  aria-label={`${engine.display_name} confidence ${confidenceState}`}
                  title={confidenceLabel}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: confidenceColorForState[confidenceState],
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {engine.calibrated_cps == null ? 'confidence unavailable' : confidenceLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
