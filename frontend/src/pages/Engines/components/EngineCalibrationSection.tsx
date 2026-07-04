import React from 'react';
import type { TtsEngine } from '@/types';

const formatCalibrationSince = (timestamp?: number | null): string | null => {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp * 1000).toLocaleDateString();
};

/** Collapsed-header calibration chip + "Reset calibration" link. */
export const EngineCalibrationChip: React.FC<{
  engine: TtsEngine;
  saving: boolean;
  onResetCalibration: () => void;
}> = ({ engine, saving, onResetCalibration }) => {
  const calibrationSince = formatCalibrationSince(engine.calibration_since);
  const hasCalibrationSummary = Boolean(
    engine.calibrated_cps !== undefined
    && engine.calibrated_cps !== null
    && engine.calibration_sample_count
    && calibrationSince
  );

  if (!hasCalibrationSummary) {
    return null;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
      <span
        data-testid="calibration-chip"
        style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: '999px',
          background: 'var(--accent-tint-bg)',
          color: 'var(--accent)',
          border: '1px solid var(--accent-tint-border)',
        }}
      >
        {Number(engine.calibrated_cps).toFixed(1)} chars/s
        {engine.calibration_confidence_percent !== undefined && engine.calibration_confidence_percent !== null
          ? ` · ${engine.calibration_confidence_percent >= 70 ? 'high' : 'low'} confidence`
          : ''}
      </span>
      <button
        type="button"
        aria-label="Reset calibration baseline"
        disabled={saving}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onResetCalibration();
        }}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: saving ? 'not-allowed' : 'pointer',
          color: 'var(--text-muted)',
          fontSize: '0.65rem',
          textDecoration: 'underline',
          fontWeight: 600,
        }}
      >
        Reset calibration
      </button>
    </div>
  );
};

/** Expanded-panel "Voice generation speed" calibration summary block. */
export const EngineCalibrationSection: React.FC<{
  engine: TtsEngine;
  saving: boolean;
  onResetCalibration: () => void;
}> = ({ engine, saving, onResetCalibration }) => {
  const calibrationSince = formatCalibrationSince(engine.calibration_since);
  const hasCalibrationSummary = Boolean(
    engine.calibrated_cps !== undefined
    && engine.calibrated_cps !== null
    && engine.calibration_sample_count
    && calibrationSince
  );
  const isLowConfidence = engine.calibration_confidence_percent !== undefined &&
    engine.calibration_confidence_percent !== null &&
    engine.calibration_confidence_percent < 70;

  return (
    <div
      style={{
        marginBottom: '1.25rem',
        padding: '1rem',
        borderRadius: '16px',
        border: '1px solid var(--accent-tint-border)',
        background: 'linear-gradient(180deg, var(--surface-tinted-light), var(--surface))',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Voice generation speed
        </span>
        <button
          type="button"
          className="btn-glass"
          title="Reset the calibration history for this engine."
          disabled={saving || !hasCalibrationSummary}
          onClick={onResetCalibration}
          style={{ padding: '0.45rem 0.75rem', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 800 }}
        >
          Reset Baseline
        </button>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          padding: '0.85rem 1rem',
          borderRadius: '12px',
          border: isLowConfidence ? '1px solid var(--warning-tint-border)' : '1px solid var(--accent-focus-ring)',
          background: isLowConfidence ? 'var(--warning-tint-bg)' : 'var(--surface-glass-half)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
          <span style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-primary)' }}>
            {engine.calibrated_cps !== undefined && engine.calibrated_cps !== null
              ? `${Number(engine.calibrated_cps).toFixed(1)} characters/sec${
                  engine.calibration_confidence_percent !== undefined &&
                  engine.calibration_confidence_percent !== null
                    ? `, ${engine.calibration_confidence_percent}% confidence`
                    : ''
                }`
              : 'Not yet computed'}
          </span>
          {hasCalibrationSummary ? (
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
              from {engine.calibration_sample_count} samples since {calibrationSince}
            </span>
          ) : (
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Computed from completed renders for this plugin and shown in characters per second.
            </span>
          )}
        </div>
      </div>
      {isLowConfidence && (
        <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.82rem', color: 'var(--warning-text-strong)', fontWeight: 600, lineHeight: 1.5 }}>
          Generate more text-to-speech renders to improve confidence in this speed estimate.
        </p>
      )}
      <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        This calibrates Studio&apos;s render-time estimates and does not change voice speaking speed.
      </p>
    </div>
  );
};
