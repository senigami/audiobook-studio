import React from 'react';
import { Info, RefreshCw, Play, SkipForward, RotateCcw, Terminal, Clipboard } from 'lucide-react';
import { PredictiveProgressBar, resetPredictiveProgressMemory, type PredictiveProgressDebugSnapshot } from './PredictiveProgressBar';

type ProgressBarCheckpointMode = 'default' | 'queue' | 'segment';
type ProgressBarStatus = 'queued' | 'preparing' | 'running' | 'finalizing' | 'done' | 'failed' | 'cancelled';

interface ProgressBarTestConfig {
  progress: number;
  startedAt?: number;
  etaSeconds?: number;
  persistenceKey?: string;
  label: string;
  showEta: boolean;
  status: ProgressBarStatus;
  allowBackwardProgress: boolean;
  evidenceWeightFraction: number;
  checkpointMode: ProgressBarCheckpointMode;
  etaBasis: 'remaining_from_update' | 'total_from_start';
  updatedAt?: number;
  transitionTickCount: number;
  backwardTransitionTickCount: number;
  tickMs: number;
}

const DEFAULT_CONFIG: ProgressBarTestConfig = {
  progress: 0.25,
  startedAt: Math.floor(Date.now() / 1000) - 35,
  etaSeconds: 120,
  persistenceKey: 'progress-test-run',
  label: 'Progress Test',
  showEta: true,
  status: 'running',
  allowBackwardProgress: false,
  evidenceWeightFraction: 0.8,
  checkpointMode: 'segment',
  etaBasis: 'total_from_start',
  transitionTickCount: 8,
  backwardTransitionTickCount: 2,
  tickMs: 250,
};

const STATUS_OPTIONS: ProgressBarStatus[] = ['queued', 'preparing', 'running', 'finalizing', 'done', 'failed', 'cancelled'];
const CHECKPOINT_MODES: ProgressBarCheckpointMode[] = ['default', 'queue', 'segment'];

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const nowUnixSeconds = () => Math.floor(Date.now() / 1000);

const HelpHint: React.FC<{ help: string }> = ({ help }) => (
  <span
    title={help}
    aria-label={help}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      cursor: 'help',
      flexShrink: 0,
    }}
  >
    <Info size={13} />
  </span>
);

const FieldLabel: React.FC<{ label: string; help: string }> = ({ label, help }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700 }}>
    {label}
    <HelpHint help={help} />
  </span>
);

const MetricRow: React.FC<{ label: string; help: string; value: string }> = ({ label, help, value }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)',
    gap: '0.75rem',
    alignItems: 'center',
    padding: '0.35rem 0.5rem',
    borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
  }}>
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <HelpHint help={help} />
    </div>
    <div style={{
      fontSize: '0.82rem',
      fontWeight: 700,
      color: 'var(--text-primary)',
      fontVariantNumeric: 'tabular-nums',
      wordBreak: 'break-word',
      textAlign: 'right',
    }}>
      {value}
    </div>
  </div>
);

const MetricGrid: React.FC<{ items: Array<[string, string, string | number]> }> = ({ items }) => (
  <div style={{
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.55)',
  }}>
    {items.map(([label, help, value]) => (
      <MetricRow
        key={String(label)}
        label={String(label)}
        help={String(help)}
        value={String(value)}
      />
    ))}
  </div>
);

export const ProgressBarTestPage: React.FC = () => {
  const [launchConfig, setLaunchConfig] = React.useState<ProgressBarTestConfig>(DEFAULT_CONFIG);
  const [activeConfig, setActiveConfig] = React.useState<ProgressBarTestConfig>(DEFAULT_CONFIG);
  const [renderToken, setRenderToken] = React.useState(0);
  const [eventLog, setEventLog] = React.useState<string[]>([
    'Initialized with a live segment-style checkpoint mode.'
  ]);
  const [manualStatus, setManualStatus] = React.useState<ProgressBarStatus>('running');
  const [manualProgressValue, setManualProgressValue] = React.useState(String(Math.round(DEFAULT_CONFIG.progress * 100)));
  const [manualEtaSeconds, setManualEtaSeconds] = React.useState(String(DEFAULT_CONFIG.etaSeconds ?? ''));
  const [debugSnapshot, setDebugSnapshot] = React.useState<PredictiveProgressDebugSnapshot | null>(null);
  const [debugHistory, setDebugHistory] = React.useState<string[]>([]);

  const pushLog = (message: string) => {
    setEventLog(prev => [`${new Date().toLocaleTimeString()} ${message}`, ...prev].slice(0, 20));
  };

  const applyConfigPatch = (patch: Partial<ProgressBarTestConfig>, message: string) => {
    setLaunchConfig(prev => ({ ...prev, ...patch }));
    pushLog(message);
  };

  const applyManualUpdate = () => {
    const nextProgressValue = manualProgressValue.trim() === '' ? undefined : clamp01(Number(manualProgressValue) / 100);
    const nextEtaValue = manualEtaSeconds.trim() === '' ? undefined : Math.max(1, Math.round(Number(manualEtaSeconds)));

    setActiveConfig(prev => {
      const nextStatus = manualStatus;
      const shouldSeedStartNow = nextStatus === 'running' && typeof prev.startedAt !== 'number';
      const nextStartedAt = shouldSeedStartNow ? nowUnixSeconds() : prev.startedAt;
      const next: ProgressBarTestConfig = {
        ...prev,
        progress: typeof nextProgressValue === 'number' ? nextProgressValue : prev.progress,
        etaSeconds: typeof nextEtaValue === 'number' ? nextEtaValue : prev.etaSeconds,
        startedAt: nextStartedAt,
        status: nextStatus,
        updatedAt: nowUnixSeconds(),
      };
      return next;
    });

    pushLog(
      `Applied live update: progress ${manualProgressValue.trim() || 'unchanged'}%, eta_seconds ${manualEtaSeconds.trim() || 'unchanged'}, status ${manualStatus}`
    );
  };

  const launchSampleRun = () => {
    const startedAt = launchConfig.status === 'preparing' ? undefined : (launchConfig.startedAt ?? nowUnixSeconds());
    const launchProgress = launchConfig.progress;
    const etaSeconds = launchConfig.etaSeconds;
    const persistenceKey = launchConfig.persistenceKey || `progress-test-${Date.now()}`;
    resetPredictiveProgressMemory(persistenceKey);
    const nextActiveConfig: ProgressBarTestConfig = {
      ...launchConfig,
      progress: launchProgress,
      startedAt,
      etaSeconds,
      persistenceKey,
      status: launchConfig.status,
    };
    setActiveConfig(nextActiveConfig);
    setManualProgressValue(String(Math.round(launchProgress * 100)));
    setManualEtaSeconds(typeof nextActiveConfig.etaSeconds === 'number' ? String(nextActiveConfig.etaSeconds) : '');
    setManualStatus(nextActiveConfig.status);
    setRenderToken(prev => prev + 1);
    pushLog(`Launched run from the current config using persistence key ${persistenceKey}`);
  };

  const resetPreview = () => {
    resetPredictiveProgressMemory();
    setLaunchConfig(DEFAULT_CONFIG);
    setActiveConfig(DEFAULT_CONFIG);
    setManualProgressValue(String(Math.round(DEFAULT_CONFIG.progress * 100)));
    setManualEtaSeconds(String(DEFAULT_CONFIG.etaSeconds ?? ''));
    setManualStatus(DEFAULT_CONFIG.status);
    setRenderToken(prev => prev + 1);
    pushLog('Reset preview to the default configuration.');
  };

  const nudgeProgress = (delta: number) => {
    setActiveConfig(prev => {
      const next = clamp01(prev.progress + delta);
      pushLog(`Progress nudged to ${Math.round(next * 100)}%`);
      setManualProgressValue(String(Math.round(next * 100)));
      return { ...prev, progress: next };
    });
  };

  const setStatus = (status: ProgressBarStatus) => {
    applyConfigPatch({ status }, `Status changed to ${status}.`);
  };

  const setConfigStartedAtToNow = () => {
    const value = nowUnixSeconds();
    applyConfigPatch({ startedAt: value }, `startedAt set to now (${value}).`);
  };

  React.useEffect(() => {
    if (!debugSnapshot) return;

    const timestamp = new Date().toLocaleTimeString();
    const historyLine = [
      timestamp,
      `v=${(debugSnapshot.displayProgress * 100).toFixed(3)}%`,
      `curr=${(debugSnapshot.currentLane?.startProgress ?? 0 * 100).toFixed(1)}%->${debugSnapshot.currentLane?.endAtMs ? new Date(debugSnapshot.currentLane.endAtMs).toLocaleTimeString() : 'n/a'}`,
      `des=${debugSnapshot.desiredLane ? `${(debugSnapshot.desiredLane.startProgress * 100).toFixed(1)}%->${debugSnapshot.desiredLane.endAtMs ? new Date(debugSnapshot.desiredLane.endAtMs).toLocaleTimeString() : 'n/a'}` : 'none'}`,
      `mig=${debugSnapshot.migrationProgress !== null ? `${(debugSnapshot.migrationProgress * 100).toFixed(0)}%` : 'none'}`,
      `eta=${debugSnapshot.displayedRemaining !== null && debugSnapshot.displayedRemaining !== undefined ? `${debugSnapshot.displayedRemaining}s` : 'n/a'}`,
    ].join(' | ');

    setDebugHistory(prev => {
      if (prev[0] === historyLine) return prev;
      return [historyLine, ...prev].slice(0, 24);
    });
  }, [debugSnapshot]);

  const debugDump = debugSnapshot
    ? JSON.stringify({
        config: activeConfig,
        snapshot: debugSnapshot,
      }, null, 2)
    : '{}';

  const historyDump = debugHistory.join('\n');

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <section style={{
        padding: '1.5rem',
        borderRadius: '20px',
        border: '1px solid var(--border)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(246,248,252,0.92))',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
          <Terminal size={18} color="var(--accent)" />
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Progress Bar Test</h1>
        </div>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          Tweak the same props the real progress bar receives, then push updates the way live websocket events would.
        </p>
      </section>

      <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'minmax(320px, 0.95fr) minmax(360px, 1.05fr)' }}>
        <section style={{
          padding: '1.25rem',
          borderRadius: '18px',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-sm)',
        }}>
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
        </section>

        <section style={{
          padding: '1.25rem',
          borderRadius: '18px',
          border: '1px solid var(--border)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,252,255,0.98))',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 style={{ marginTop: 0 }}>Live Preview</h2>
          <div style={{ padding: '1rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <PredictiveProgressBar
                key={renderToken}
                progress={activeConfig.progress}
                startedAt={activeConfig.startedAt}
                etaSeconds={activeConfig.etaSeconds}
                persistenceKey={activeConfig.persistenceKey}
                label={activeConfig.label}
                showEta={activeConfig.showEta}
                status={activeConfig.status}
                updatedAt={activeConfig.updatedAt}
                etaBasis={activeConfig.etaBasis}
                predictive={true}
                allowBackwardProgress={activeConfig.allowBackwardProgress}
                transitionTickCount={activeConfig.transitionTickCount}
                backwardTransitionTickCount={activeConfig.backwardTransitionTickCount}
                tickMs={activeConfig.tickMs}
                evidenceWeightFraction={activeConfig.evidenceWeightFraction}
                checkpointMode={activeConfig.checkpointMode}
                onDebugSnapshot={setDebugSnapshot}
            />
          </div>

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
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.color = 'var(--accent)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
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
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.color = 'var(--accent)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
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
        </section>
      </div>
    </div>
  );
};
