import React from 'react';
import { Info, RefreshCw, Play, SkipForward, RotateCcw, Terminal } from 'lucide-react';
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
  predictive: boolean;
  indeterminateRunning: boolean;
  authoritativeFloor: boolean;
  evidenceWeightFraction: number;
  checkpointMode: ProgressBarCheckpointMode;
}

const DEFAULT_CONFIG: ProgressBarTestConfig = {
  progress: 0.25,
  startedAt: Math.floor(Date.now() / 1000) - 35,
  etaSeconds: 120,
  persistenceKey: 'progress-test-run',
  label: 'Progress Test',
  showEta: true,
  status: 'running',
  predictive: true,
  indeterminateRunning: false,
  authoritativeFloor: true,
  evidenceWeightFraction: 0.8,
  checkpointMode: 'segment',
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

const MetricCard: React.FC<{ label: string; help: string; value: string }> = ({ label, help, value }) => (
  <div style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(255,255,255,0.6)', border: '1px solid var(--border)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>
      <span>{label}</span>
      <HelpHint help={help} />
    </div>
    <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '0.25rem', wordBreak: 'break-word' }}>{value}</div>
  </div>
);

export const ProgressBarTestPage: React.FC = () => {
  const [config, setConfig] = React.useState<ProgressBarTestConfig>(DEFAULT_CONFIG);
  const [renderToken, setRenderToken] = React.useState(0);
  const [eventLog, setEventLog] = React.useState<string[]>([
    'Initialized with a live segment-style checkpoint mode.'
  ]);
  const [manualStatus, setManualStatus] = React.useState<ProgressBarStatus>('running');
  const [manualProgressValue, setManualProgressValue] = React.useState(String(Math.round(DEFAULT_CONFIG.progress * 100)));
  const [manualEtaSeconds, setManualEtaSeconds] = React.useState(String(DEFAULT_CONFIG.etaSeconds ?? ''));
  const [debugSnapshot, setDebugSnapshot] = React.useState<PredictiveProgressDebugSnapshot | null>(null);

  const pushLog = (message: string) => {
    setEventLog(prev => [`${new Date().toLocaleTimeString()} ${message}`, ...prev].slice(0, 20));
  };

  const applyConfigPatch = (patch: Partial<ProgressBarTestConfig>, message: string) => {
    setConfig(prev => ({ ...prev, ...patch }));
    if (Object.prototype.hasOwnProperty.call(patch, 'progress') && typeof patch.progress === 'number') {
      setManualProgressValue(String(Math.round(clamp01(patch.progress) * 100)));
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'etaSeconds')) {
      setManualEtaSeconds(typeof patch.etaSeconds === 'number' ? String(patch.etaSeconds) : '');
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'status') && typeof patch.status === 'string') {
      setManualStatus(patch.status as ProgressBarStatus);
    }
    pushLog(message);
  };

  const applyManualUpdate = () => {
    const nextProgressValue = manualProgressValue.trim() === '' ? undefined : clamp01(Number(manualProgressValue) / 100);
    const nextEtaValue = manualEtaSeconds.trim() === '' ? undefined : Math.max(1, Math.round(Number(manualEtaSeconds)));

    setConfig(prev => {
      const next: ProgressBarTestConfig = {
        ...prev,
        progress: typeof nextProgressValue === 'number' ? nextProgressValue : prev.progress,
        etaSeconds: typeof nextEtaValue === 'number' ? nextEtaValue : prev.etaSeconds,
        status: manualStatus,
      };
      return next;
    });

    pushLog(
      `Applied live update: progress ${manualProgressValue.trim() || 'unchanged'}%, eta_seconds ${manualEtaSeconds.trim() || 'unchanged'}, status ${manualStatus}`
    );
  };

  const launchSampleRun = () => {
    const isLiveStatus = config.status === 'running' || config.status === 'finalizing';
    const startedAt = isLiveStatus ? (config.startedAt ?? nowUnixSeconds()) : undefined;
    const launchProgress = isLiveStatus ? config.progress : 0;
    const persistenceKey = config.persistenceKey || `progress-test-${Date.now()}`;
    resetPredictiveProgressMemory(persistenceKey);
    setConfig(prev => ({
      ...prev,
      progress: launchProgress,
      startedAt,
      etaSeconds: isLiveStatus ? prev.etaSeconds : undefined,
      persistenceKey,
      status: prev.status,
      predictive: true,
      indeterminateRunning: false,
    }));
    setManualProgressValue(String(Math.round(launchProgress * 100)));
    setManualEtaSeconds(typeof config.etaSeconds === 'number' ? String(config.etaSeconds) : '');
    setManualStatus(config.status);
    setRenderToken(prev => prev + 1);
    pushLog(`Launched run from the current config using persistence key ${persistenceKey}`);
  };

  const resetPreview = () => {
    resetPredictiveProgressMemory();
    setConfig(DEFAULT_CONFIG);
    setManualProgressValue(String(Math.round(DEFAULT_CONFIG.progress * 100)));
    setManualEtaSeconds(String(DEFAULT_CONFIG.etaSeconds ?? ''));
    setRenderToken(prev => prev + 1);
    pushLog('Reset preview to the default configuration.');
  };

  const nudgeProgress = (delta: number) => {
    setConfig(prev => {
      const next = clamp01(prev.progress + delta);
      pushLog(`Progress nudged to ${Math.round(next * 100)}%`);
      setManualProgressValue(String(Math.round(next * 100)));
      return { ...prev, progress: next };
    });
  };

  const setStatus = (status: ProgressBarStatus) => {
    setManualStatus(status);
    applyConfigPatch({ status }, `Status changed to ${status}.`);
  };

  const setConfigStartedAtToNow = () => {
    const value = nowUnixSeconds();
    applyConfigPatch({ startedAt: value }, `startedAt set to now (${value}).`);
  };

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
                <input type="range" min={0} max={1} step={0.01} value={config.progress} onChange={e => applyConfigPatch({ progress: clamp01(Number(e.target.value)) }, `Progress set to ${Math.round(Number(e.target.value) * 100)}%.`)} />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <FieldLabel label="Label" help="The visible title shown beside the bar." />
                <input value={config.label} onChange={e => applyConfigPatch({ label: e.target.value }, `Label changed to "${e.target.value}".`)} />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <FieldLabel label="Started At" help="Unix timestamp in seconds. This is the launch-time anchor for a run. In live updates, the backend normally keeps this stable instead of re-sending a new value each tick." />
                <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    value={config.startedAt ?? ''}
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
                <input type="number" min={1} value={config.etaSeconds ?? ''} onChange={e => applyConfigPatch({ etaSeconds: e.target.value === '' ? undefined : Number(e.target.value) }, `etaSeconds updated to ${e.target.value || 'unset'}.`)} />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <FieldLabel label="Persistence Key" help="A stable identifier used to remember progress and ETA across remounts and reloads." />
                <input value={config.persistenceKey ?? ''} onChange={e => applyConfigPatch({ persistenceKey: e.target.value || undefined }, `persistenceKey updated.`)} />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <FieldLabel label="Status" help="The lifecycle state being simulated. Running and processing animate; queued and preparing stay idle unless a live run is explicitly started." />
                <select value={config.status} onChange={e => setStatus(e.target.value as ProgressBarStatus)}>
                  {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <FieldLabel label="Checkpoint Mode" help="Changes how strongly the bar trusts incoming updates. Segment mode is more responsive, queue mode is more conservative, and default sits in between." />
                <select value={config.checkpointMode} onChange={e => applyConfigPatch({ checkpointMode: e.target.value as ProgressBarCheckpointMode }, `checkpointMode set to ${e.target.value}.`)}>
                  {CHECKPOINT_MODES.map(mode => <option key={mode} value={mode}>{mode}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <label title="Show or hide the ETA readout next to the percent value." style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><input type="checkbox" checked={config.showEta} onChange={e => applyConfigPatch({ showEta: e.target.checked }, `showEta ${e.target.checked ? 'enabled' : 'disabled'}.`)} /> Show ETA</label>
              <label title="Enable predictive smoothing so the bar animates between websocket updates instead of only jumping on new events." style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><input type="checkbox" checked={config.predictive} onChange={e => applyConfigPatch({ predictive: e.target.checked }, `predictive ${e.target.checked ? 'enabled' : 'disabled'}.`)} /> Predictive</label>
              <label title="Force the bar into the generic working animation when exact progress is not trustworthy." style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><input type="checkbox" checked={config.indeterminateRunning} onChange={e => applyConfigPatch({ indeterminateRunning: e.target.checked }, `indeterminateRunning ${e.target.checked ? 'enabled' : 'disabled'}.`)} /> Indeterminate</label>
              <label title="Keep the visible bar from moving backward when a newer backend update reports a lower value." style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><input type="checkbox" checked={config.authoritativeFloor} onChange={e => applyConfigPatch({ authoritativeFloor: e.target.checked }, `authoritativeFloor ${e.target.checked ? 'enabled' : 'disabled'}.`)} /> Authoritative floor</label>
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
              <button className="btn-ghost" onClick={() => applyConfigPatch({ progress: 1, status: 'finalizing' }, 'Marked as finalizing at 100%.')}>
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
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{Math.round(config.evidenceWeightFraction * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(config.evidenceWeightFraction * 100)}
                  onChange={e => applyConfigPatch({ evidenceWeightFraction: Number(e.target.value) / 100 }, `evidenceWeightFraction set to ${e.target.value}%.`)}
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
              progress={config.progress}
              startedAt={config.startedAt}
              etaSeconds={config.etaSeconds}
              persistenceKey={config.persistenceKey}
              label={config.label}
              showEta={config.showEta}
              status={config.status}
              predictive={config.predictive}
              indeterminateRunning={config.indeterminateRunning}
              authoritativeFloor={config.authoritativeFloor}
              evidenceWeightFraction={config.evidenceWeightFraction}
              checkpointMode={config.checkpointMode}
              onDebugSnapshot={setDebugSnapshot}
            />
          </div>

          <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
            <section style={{ padding: '1rem', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem' }}>Rendered Display Data</h3>
              <p style={{ marginTop: 0, marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                These are the values the bar is actually using for its visible render.
              </p>
              <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <MetricCard label="Bar status" help="The status currently being rendered by the bar." value={debugSnapshot?.status ?? config.status} />
                <MetricCard label="Displayed progress" help="The width actually being shown on screen right now." value={debugSnapshot ? `${Math.round(debugSnapshot.displayProgress * 100)}%` : 'n/a'} />
                <MetricCard label="Local progress" help="The rendered percent used for the visible label and width after smoothing and floors are applied." value={debugSnapshot ? `${Math.round(debugSnapshot.localProgress * 100)}%` : 'n/a'} />
                <MetricCard label="ETA remaining" help="The countdown currently being displayed beside the bar." value={debugSnapshot?.syncedDisplayedRemaining !== null && debugSnapshot?.syncedDisplayedRemaining !== undefined ? `${debugSnapshot.syncedDisplayedRemaining}s` : 'n/a'} />
              </div>
            </section>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <RefreshCw size={16} color="var(--accent)" />
              <strong>Tick Debug</strong>
            </div>
            <p style={{ marginTop: 0, marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              This is the low-level timing and smoothing math behind the displayed values above.
            </p>
            <div style={{
              display: 'grid',
              gap: '0.6rem',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'
            }}>
              {[
                ['memoryFloor', 'The remembered floor carried over from the last known live run.', debugSnapshot ? `${Math.round(debugSnapshot.memoryFloor * 100)}%` : 'n/a'],
                ['targetFloor', 'The highest authoritative minimum percent the bar should not fall below.', debugSnapshot?.targetFloor !== null && debugSnapshot?.targetFloor !== undefined ? `${Math.round(debugSnapshot.targetFloor * 100)}%` : 'n/a'],
                ['nextProgress', 'The next eased progress value the bar will move toward on the next tick.', debugSnapshot?.nextProgress !== null && debugSnapshot?.nextProgress !== undefined ? `${Math.round(debugSnapshot.nextProgress * 100)}%` : 'n/a'],
                ['targetEndTime', 'The target end time the component is easing toward from the live ETA model.', debugSnapshot?.targetEndTime ? new Date(debugSnapshot.targetEndTime).toLocaleTimeString() : 'n/a'],
                ['currentEndTime', 'The smoothed end time currently used to pace the visible countdown.', debugSnapshot?.currentEndTime ? new Date(debugSnapshot.currentEndTime).toLocaleTimeString() : 'n/a'],
                ['displayedRemaining', 'The countdown value derived directly from the current smoothed end time.', debugSnapshot?.displayedRemaining !== null && debugSnapshot?.displayedRemaining !== undefined ? `${debugSnapshot.displayedRemaining}s` : 'n/a'],
                ['syncedDisplayedRemaining', 'The countdown after queue-floor syncing is applied.', debugSnapshot?.syncedDisplayedRemaining !== null && debugSnapshot?.syncedDisplayedRemaining !== undefined ? `${debugSnapshot.syncedDisplayedRemaining}s` : 'n/a'],
                ['remainingTicks', 'How many 250ms ticks remain before the current end time is reached.', debugSnapshot?.remainingTicks !== null && debugSnapshot?.remainingTicks !== undefined ? `${debugSnapshot.remainingTicks}` : 'n/a'],
                ['effectiveEtaSeconds', 'The live ETA after smoothing and elapsed-time recalculation.', debugSnapshot?.effectiveEtaSeconds !== null && debugSnapshot?.effectiveEtaSeconds !== undefined ? `${Math.round(debugSnapshot.effectiveEtaSeconds)}s` : 'n/a'],
                ['dtSeconds', 'How many seconds elapsed since the previous tick.', debugSnapshot?.dtSeconds !== null && debugSnapshot?.dtSeconds !== undefined ? debugSnapshot.dtSeconds.toFixed(3) : 'n/a'],
                ['tickElapsedSeconds', 'How long the current run has been active according to the current anchor.', debugSnapshot?.tickElapsedSeconds !== null && debugSnapshot?.tickElapsedSeconds !== undefined ? debugSnapshot.tickElapsedSeconds.toFixed(3) : 'n/a'],
                ['smoothingTicks', 'How many ticks the current correction is being spread across.', debugSnapshot?.smoothingTicks ?? 'n/a'],
                ['maxVisualStep', 'The per-tick visual cap applied to avoid sudden jumps.', debugSnapshot?.maxVisualStep !== null && debugSnapshot?.maxVisualStep !== undefined ? debugSnapshot.maxVisualStep.toFixed(4) : 'n/a'],
                ['checkpointMode', 'The checkpoint policy currently in effect for the progress engine.', debugSnapshot?.resolvedCheckpointMode ?? 'n/a'],
                ['correctionMode', 'The correction weighting mode used to build the current predictive model.', debugSnapshot?.correctionWeightMode ?? 'n/a'],
              ].map(([label, help, value]) => (
                <MetricCard key={String(label)} label={String(label)} help={String(help)} value={String(value)} />
              ))}
            </div>
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
