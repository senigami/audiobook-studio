import React from 'react';
import { RefreshCw } from 'lucide-react';
import { type ProgressBarTestConfig, type ProgressBarStatus, STATUS_OPTIONS } from './ProgressBarTestTypes';
import { FieldLabel } from './ProgressBarTestHelpers';

interface ProgressBarUpdatePanelProps {
  activeConfig: ProgressBarTestConfig;
  setActiveConfig: React.Dispatch<React.SetStateAction<ProgressBarTestConfig>>;
  manualProgressValue: string;
  setManualProgressValue: (v: string) => void;
  manualEtaSeconds: string;
  setManualEtaSeconds: (v: string) => void;
  manualStatus: ProgressBarStatus;
  setManualStatus: (s: ProgressBarStatus) => void;
  nudgeProgress: (delta: number) => void;
  applyManualUpdate: () => void;
}

export const ProgressBarUpdatePanel: React.FC<ProgressBarUpdatePanelProps> = ({
  activeConfig,
  setActiveConfig,
  manualProgressValue,
  setManualProgressValue,
  manualEtaSeconds,
  setManualEtaSeconds,
  manualStatus,
  setManualStatus,
  nudgeProgress,
  applyManualUpdate
}) => {
  return (
    <>
      <section style={{
        marginTop: '1rem',
        padding: '1rem',
        borderRadius: '14px',
        border: '1px solid var(--border)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,253,0.96))',
        boxShadow: 'var(--shadow-sm)',
        borderLeft: '4px solid rgba(22, 163, 74, 0.75)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem' }}>
              <RefreshCw size={15} color="var(--accent)" />
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Progress Updates</h3>
            </div>
            <p style={{ marginTop: '-0.15rem', marginBottom: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Apply live-like websocket payload fields after the run has been launched.
            </p>
          </div>
          <span style={{
            alignSelf: 'start',
            padding: '0.25rem 0.55rem',
            borderRadius: '999px',
            fontSize: '0.72rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            background: 'rgba(22, 163, 74, 0.12)',
            color: 'rgb(22, 163, 74)',
          }}>
            Live mutations
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={() => nudgeProgress(0.01)}>+1%</button>
          <button className="btn-ghost" onClick={() => nudgeProgress(0.05)}>+5%</button>
          <button className="btn-ghost" onClick={() => nudgeProgress(0.1)}>+10%</button>
          <button className="btn-ghost" style={{ border: '1px solid var(--error)', color: 'var(--error)' }} onClick={() => nudgeProgress(-0.1)}>-10%</button>
          <button className="btn-ghost" onClick={() => setActiveConfig(prev => ({ ...prev, progress: 1, status: 'finalizing' }))}>
            Finish
          </button>
        </div>
      </section>

      <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Manual update console</h3>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          This console mirrors the real live payload shape: `progress`, `eta_seconds`, and `status`. `started_at` stays in the launch card because the backend treats it as a stable run anchor.
        </p>
        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <FieldLabel label="Progress %" help="The authoritative absolute progress value to send in the update payload." />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{manualProgressValue || '0'}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Number(manualProgressValue || 0)}
              onChange={e => setManualProgressValue(e.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <FieldLabel label="ETA Seconds" help="The absolute ETA field to send with the update. This mirrors the real runtime payload rather than a debug-only delta." />
            <input value={manualEtaSeconds} onChange={e => setManualEtaSeconds(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <FieldLabel label="Update Confidence" help="How much of the whole this update should count for. Larger segments or more trusted checkpoints should influence ETA more strongly." />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{Math.round(activeConfig.evidenceWeightFraction * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(activeConfig.evidenceWeightFraction * 100)}
              onChange={e => setActiveConfig(prev => ({ ...prev, evidenceWeightFraction: Number(e.target.value) / 100 }))}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Real producers should derive this from the update payload. If it is missing, use an 80% fallback confidence.
            </span>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <FieldLabel label="Update Status" help="Choose the status to send with the manual update payload." />
            <select value={manualStatus} onChange={e => setManualStatus(e.target.value as ProgressBarStatus)}>
              {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button className="btn-primary" onClick={applyManualUpdate} style={{ width: '100%' }}>
              <RefreshCw size={14} style={{ marginRight: '0.4rem' }} />
              Send Update
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
