import React from 'react';
import { RefreshCw, Terminal, Clipboard, SkipForward } from 'lucide-react';
import { type ProgressBarTestConfig } from './ProgressBarTestTypes';
import { MetricGrid } from './ProgressBarTestHelpers';
import { type PredictiveProgressDebugSnapshot } from '../PredictiveProgressBar';

interface ProgressBarDebugPanelProps {
  activeConfig: ProgressBarTestConfig;
  launchConfig: ProgressBarTestConfig;
  debugSnapshot: PredictiveProgressDebugSnapshot | null;
  debugHistory: string[];
  eventLog: string[];
}

export const ProgressBarDebugPanel: React.FC<ProgressBarDebugPanelProps> = ({
  activeConfig,
  launchConfig,
  debugSnapshot,
  debugHistory,
  eventLog
}) => {
  const debugDump = debugSnapshot
    ? JSON.stringify({
        config: activeConfig,
        snapshot: debugSnapshot,
      }, null, 2)
    : '{}';

  const historyDump = debugHistory.join('\n');

  return (
    <>
      <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
        <section style={{ padding: '1rem', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem' }}>Rendered Display Data</h3>
          <p style={{ marginTop: 0, marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            These are the values the bar is actually using for its visible render.
          </p>
          <MetricGrid items={[
            ['Bar status', 'The status currently being rendered by the bar.', debugSnapshot?.status ?? activeConfig.status],
            ['Launch started_at', 'The staged launch snapshot currently configured in the left panel.', launchConfig.startedAt !== undefined ? `${launchConfig.startedAt}` : 'unset'],
            ['Runtime started_at', 'The started_at value the live bar is currently using after any handoff or live update.', debugSnapshot?.startedAt != null ? `${debugSnapshot.startedAt}` : 'n/a'],
            ['Tick loop active', 'Whether the bar is currently running its predictive tick loop or sitting in a static presentation state.', debugSnapshot?.tickLoopActive != null ? (debugSnapshot.tickLoopActive ? 'yes' : 'no') : 'n/a'],
            ['Displayed progress', 'The width actually being shown on screen right now.', debugSnapshot?.displayProgress != null ? `${Math.round(debugSnapshot.displayProgress * 100)}%` : 'n/a'],
            ['Local progress', 'The rendered percent used for the visible label and width after smoothing and floors are applied.', debugSnapshot?.localProgress != null ? `${Math.round(debugSnapshot.localProgress * 100)}%` : 'n/a'],
            ['ETA remaining', 'The countdown currently being displayed beside the bar.', debugSnapshot?.displayedRemaining != null ? `${debugSnapshot.displayedRemaining}s` : 'n/a'],
          ]} />
        </section>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <RefreshCw size={16} color="var(--accent)" />
          <strong>Lane Migration Debug</strong>
        </div>
        <p style={{ marginTop: 0, marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          This monitors the movement between the current authoritative lane and the desired target.
        </p>
        <MetricGrid items={[
          ['currentLaneEnd', 'The end time of the lane currently driving the visible position.', debugSnapshot?.currentLane?.endAtMs != null ? new Date(debugSnapshot.currentLane.endAtMs).toLocaleTimeString() : 'n/a'],
          ['desiredLaneEnd', 'The target end time we are migrating toward.', debugSnapshot?.desiredLane?.endAtMs != null ? new Date(debugSnapshot.desiredLane.endAtMs).toLocaleTimeString() : 'n/a'],
          ['isBackward', 'Whether the current migration is a backward correction.', debugSnapshot?.isBackwardMigration ? 'YES' : 'no'],
          ['activeTicks', 'The tick count chosen for this specific transition window.', debugSnapshot?.activeTransitionTickCount ?? 'n/a'],
          ['migrationProgress', 'Visual blending percent between the old and new lanes.', debugSnapshot?.migrationProgress != null ? `${Math.round(debugSnapshot.migrationProgress * 100)}%` : 'none'],
          ['migrationElapsed', 'Wall-clock time that has passed since migration started.', debugSnapshot?.migrationElapsedMs != null ? `${debugSnapshot.migrationElapsedMs}ms` : 'n/a'],
          ['migrationTicks', 'Progress through the transition in discrete physics ticks.', debugSnapshot?.migrationTicksElapsed != null ? `${debugSnapshot.migrationTicksElapsed} / ${debugSnapshot.migrationTicksTotal}` : 'n/a'],
          ['evidenceWeight', 'Confidence/weighting applied to the most recent update.', debugSnapshot?.evidenceWeightFraction != null ? `${Math.round(debugSnapshot.evidenceWeightFraction * 100)}%` : 'n/a'],
          ['incomingProgress', 'The raw progress value received from the update.', debugSnapshot?.incomingProgress != null ? `${Math.round(debugSnapshot.incomingProgress * 100)}%` : 'n/a'],
          ['targetProgress', 'The calculated blended target progress for the desired lane.', debugSnapshot?.effectiveTargetProgress != null ? `${(debugSnapshot.effectiveTargetProgress * 100).toFixed(2)}%` : 'n/a'],
          ['visualAtUpdate', 'The visual progress position captured at the moment of update.', debugSnapshot?.currentVisualAtUpdate != null ? `${(debugSnapshot.currentVisualAtUpdate * 100).toFixed(2)}%` : 'n/a'],
          ['transitionDuration', 'Total duration of the migration window.', debugSnapshot?.migrationDurationMs != null ? `${debugSnapshot.migrationDurationMs}ms` : 'n/a'],
          ['lastSource', 'Which internal code path most recently wrote the display progress value.', debugSnapshot?.lastDisplayWriteSource ?? 'n/a'],
        ]} />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Terminal size={16} color="var(--accent)" />
            <strong>Paste Debug Dump</strong>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(debugDump);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'white',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <Clipboard size={14} />
            Copy JSON
          </button>
        </div>
        <p style={{ marginTop: 0, marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Copy this block back to me and I can read the exact live state without needing screenshots or row-by-row slices.
        </p>
        <textarea
          readOnly
          value={debugDump}
          style={{
            width: '100%',
            minHeight: '280px',
            padding: '0.85rem',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--surface-light)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '0.82rem',
            lineHeight: 1.5,
            whiteSpace: 'pre',
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <SkipForward size={16} color="var(--accent)" />
            <strong>Snapshot History</strong>
          </div>
          <button
            onClick={() => {
              const combined = {
                current: debugSnapshot ? { config: activeConfig, snapshot: debugSnapshot } : null,
                history: debugHistory,
                exported_at: new Date().toISOString()
              };
              navigator.clipboard.writeText(JSON.stringify(combined, null, 2));
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'white',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <Clipboard size={14} />
            Copy History
          </button>
        </div>
        <p style={{ marginTop: 0, marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          This keeps the last few ticks in order so we can compare what changed over time instead of only reading one instant.
        </p>
        <textarea
          readOnly
          value={historyDump}
          style={{
            width: '100%',
            minHeight: '220px',
            padding: '0.85rem',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--surface-light)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '0.82rem',
            lineHeight: 1.5,
            whiteSpace: 'pre',
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <SkipForward size={16} color="var(--accent)" />
          <strong>Update log</strong>
        </div>
        <div style={{
          maxHeight: '280px',
          overflow: 'auto',
          padding: '0.85rem',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          background: 'var(--surface-light)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '0.82rem',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}>
          {eventLog.map((line, idx) => (
            <div key={`${idx}-${line}`}>{line}</div>
          ))}
        </div>
      </div>
    </>
  );
};
