import React from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { type ProgressBarTestConfig, type ProgressBarStatus, type ProgressBarCheckpointMode, STATUS_OPTIONS, CHECKPOINT_MODES } from './ProgressBarTestTypes';
import { FieldLabel, clamp01 } from './ProgressBarTestHelpers';

interface ProgressBarLaunchPanelProps {
  launchConfig: ProgressBarTestConfig;
  applyConfigPatch: (patch: Partial<ProgressBarTestConfig>, message: string) => void;
  setConfigStartedAtToNow: () => void;
  setStatus: (status: ProgressBarStatus) => void;
  launchSampleRun: () => void;
  resetPreview: () => void;
}

export const ProgressBarLaunchPanel: React.FC<ProgressBarLaunchPanelProps> = ({
  launchConfig,
  applyConfigPatch,
  setConfigStartedAtToNow,
  setStatus,
  launchSampleRun,
  resetPreview
}) => {
  return (
    <section style={{
      padding: '1rem',
      borderRadius: '14px',
      border: '1px solid var(--border)',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,253,0.96))',
      boxShadow: 'var(--shadow-sm)',
      borderLeft: '4px solid rgba(84, 107, 255, 0.75)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem' }}>
            <Play size={15} color="var(--accent)" />
            <h2 style={{ margin: 0 }}>Launch State</h2>
          </div>
          <p style={{ marginTop: '-0.15rem', marginBottom: 0, color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            Set the starting snapshot the bar should launch from.
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
          background: 'rgba(84, 107, 255, 0.12)',
          color: 'var(--accent)',
        }}>
          Initial snapshot
        </span>
      </div>
      <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <FieldLabel label="Progress" help="The authoritative backend progress value. Use this to simulate a job reporting its current percent complete." />
          <input type="range" min={0} max={1} step={0.01} value={launchConfig.progress} onChange={e => applyConfigPatch({ progress: clamp01(Number(e.target.value)) }, `Progress set to ${Math.round(Number(e.target.value) * 100)}%.`)} />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <FieldLabel label="Label" help="The visible title shown beside the bar." />
          <input value={launchConfig.label} onChange={e => applyConfigPatch({ label: e.target.value }, `Label changed to "${e.target.value}".`)} />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <FieldLabel label="Started At" help="Unix timestamp in seconds. This is the launch-time anchor for a run. In live updates, the backend normally keeps this stable instead of re-sending a new value each tick." />
          <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
            <input
              type="number"
              value={launchConfig.startedAt ?? ''}
              onChange={e => applyConfigPatch({ startedAt: e.target.value === '' ? undefined : Number(e.target.value) }, `startedAt updated to ${e.target.value || 'unset'}.`)}
              style={{ flex: 1 }}
            />
            <button className="btn-ghost" type="button" onClick={setConfigStartedAtToNow} title="Set this timestamp to the current unix time.">
              Now
            </button>
          </div>
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <FieldLabel label="ETA Seconds" help="The current server ETA value. The live runtime sends this as a real field update, not as a delta." />
          <input type="number" min={1} value={launchConfig.etaSeconds ?? ''} onChange={e => applyConfigPatch({ etaSeconds: e.target.value === '' ? undefined : Number(e.target.value) }, `etaSeconds updated to ${e.target.value || 'unset'}.`)} />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <FieldLabel label="Persistence Key" help="A stable identifier used to remember progress and ETA across remounts and reloads." />
          <input value={launchConfig.persistenceKey ?? ''} onChange={e => applyConfigPatch({ persistenceKey: e.target.value || undefined }, `persistenceKey updated.`)} />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <FieldLabel label="Status" help="The lifecycle state being simulated. Running and processing animate; queued and preparing stay idle unless a live run is explicitly started." />
          <select value={launchConfig.status} onChange={e => setStatus(e.target.value as ProgressBarStatus)}>
            {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <FieldLabel label="Checkpoint Mode" help="Changes how strongly the bar trusts incoming updates. Segment mode is more responsive, queue mode is more conservative, and default sits in between." />
          <select value={launchConfig.checkpointMode} onChange={e => {
            const mode = e.target.value as ProgressBarCheckpointMode;
            const ticks = mode === 'segment' ? 3 : (mode === 'queue' ? 12 : 8);
            applyConfigPatch({ checkpointMode: mode, transitionTickCount: ticks }, `checkpointMode set to ${mode} (auto-tapered transition to ${ticks} ticks).`);
          }}>
            {CHECKPOINT_MODES.map(mode => <option key={mode} value={mode}>{mode}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <FieldLabel label="ETA Basis" help="Chooses whether etaSeconds is treated as 'remaining from now' or 'total from start'." />
          <select value={launchConfig.etaBasis} onChange={e => applyConfigPatch({ etaBasis: e.target.value as any }, `etaBasis set to ${e.target.value}.`)}>
            <option value="total_from_start">Total from start</option>
            <option value="remaining_from_update">Remaining from update</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <label title="Show or hide the ETA readout next to the percent value." style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><input type="checkbox" checked={launchConfig.showEta} onChange={e => applyConfigPatch({ showEta: e.target.checked }, `showEta ${e.target.checked ? 'enabled' : 'disabled'}.`)} /> Show ETA</label>
        <label title="Explicitly allow the bar to move backward when a newer backend update reports a lower value." style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><input type="checkbox" checked={launchConfig.allowBackwardProgress} onChange={e => applyConfigPatch({ allowBackwardProgress: e.target.checked }, `Allow Backward ${e.target.checked ? 'enabled' : 'disabled'}.`)} /> Allow Backward</label>
      </div>

      <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <FieldLabel label="Forward Ticks" help="Standard physics ticks for blending forward updates." />
          <input type="number" min={1} max={50} value={launchConfig.transitionTickCount} onChange={e => applyConfigPatch({ transitionTickCount: Number(e.target.value) }, `transitionTickCount set to ${e.target.value}.`)} />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <FieldLabel label="Backward Ticks" help="Physics ticks used for correcting backward (if enabled). Usually 2." />
          <input type="number" min={1} max={50} value={launchConfig.backwardTransitionTickCount} onChange={e => applyConfigPatch({ backwardTransitionTickCount: Number(e.target.value) }, `backwardTransitionTickCount set to ${e.target.value}.`)} />
        </label>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <FieldLabel label="Tick Ms" help="Duration of one physics tick in milliseconds. Usually 250ms." />
          <input type="number" min={50} max={2000} step={50} value={launchConfig.tickMs} onChange={e => applyConfigPatch({ tickMs: Number(e.target.value) }, `tickMs set to ${e.target.value}ms.`)} />
        </label>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={launchSampleRun} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <Play size={14} />
            Launch From Config
          </button>
          <button className="btn-ghost" onClick={resetPreview} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
      </div>
    </section>
  );
};
