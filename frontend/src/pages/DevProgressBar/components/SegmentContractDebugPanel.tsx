import React from 'react';
import { Play, Square, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { PredictiveProgressBar, resetPredictiveProgressMemory, type PredictiveProgressDebugSnapshot } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import { buildSegmentProgressBarProps } from '@/components/progress/progressBarContracts';
import { FieldLabel, MetricGrid } from '@tests/helpers/ProgressBarTestHelpers';

type SegmentDebugStatus = 'running' | 'done' | 'cancelled';

const DEBUG_JOB_ID = 'debug-job';

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

export const SegmentContractDebugPanel: React.FC = () => {
  const [segmentNumber, setSegmentNumber] = React.useState(0);
  const [targetProgress, setTargetProgress] = React.useState(0);
  const [status, setStatus] = React.useState<SegmentDebugStatus>('running');
  const [snapshot, setSnapshot] = React.useState<PredictiveProgressDebugSnapshot | null>(null);
  const [displayLog, setDisplayLog] = React.useState<string[]>([]);
  const [eventLog, setEventLog] = React.useState<string[]>(['Ready. Click Start Segment to create a segment-keyed run.']);

  const activeSegmentId = segmentNumber > 0 ? `debug-segment-${segmentNumber}` : 'debug-segment-0';

  const pushEvent = React.useCallback((line: string) => {
    setEventLog(prev => [line, ...prev].slice(0, 16));
  }, []);

  const startSegment = React.useCallback(() => {
    const nextSegmentNumber = segmentNumber + 1;
    const nextSegmentId = `debug-segment-${nextSegmentNumber}`;
    resetPredictiveProgressMemory(`${DEBUG_JOB_ID}:${nextSegmentId}`);
    setSegmentNumber(nextSegmentNumber);
    setTargetProgress(0);
    setStatus('running');
    setSnapshot(null);
    setDisplayLog([]);
    pushEvent(`START_SEGMENT ${nextSegmentId} progress=0%`);
  }, [pushEvent, segmentNumber]);

  const stopSegment = React.useCallback(() => {
    const stoppedSegmentId = segmentNumber > 0 ? activeSegmentId : 'debug-segment-1';
    if (segmentNumber === 0) {
      setSegmentNumber(1);
    }
    setTargetProgress(1);
    setStatus('done');
    pushEvent(`SEGMENT_SAVED ${stoppedSegmentId} progress=100%`);
  }, [activeSegmentId, pushEvent, segmentNumber]);

  const resetSegmentDebug = React.useCallback(() => {
    resetPredictiveProgressMemory(DEBUG_JOB_ID);
    setSegmentNumber(0);
    setTargetProgress(0);
    setStatus('running');
    setSnapshot(null);
    setDisplayLog([]);
    setEventLog(['Ready. Click Start Segment to create a segment-keyed run.']);
  }, []);

  const updateTargetProgress = React.useCallback((value: number) => {
    const nextProgress = Math.max(0, Math.min(1, value));
    const segmentId = segmentNumber > 0 ? activeSegmentId : 'debug-segment-1';
    if (segmentNumber === 0) {
      setSegmentNumber(1);
      pushEvent(`START_SEGMENT ${segmentId} progress=0%`);
    }
    setStatus('running');
    setTargetProgress(nextProgress);
    pushEvent(`SEGMENT_PROGRESS ${segmentId} progress=${formatPercent(nextProgress)}`);
  }, [activeSegmentId, pushEvent, segmentNumber]);

  const handleDisplayProgress = React.useCallback((displayProgress: number) => {
    const rounded = Math.round(displayProgress * 1000) / 1000;
    const line = `display=${formatPercent(rounded)}`;
    setDisplayLog(prev => {
      if (prev[0] === line) return prev;
      return [line, ...prev].slice(0, 16);
    });
  }, []);

  const progressBarConfig = buildSegmentProgressBarProps({
    jobId: DEBUG_JOB_ID,
    segmentId: activeSegmentId,
    progress: targetProgress,
    status,
    state: status === 'running' ? 'processing' : status,
    label: `Segment ${activeSegmentId}`,
    dataTestId: 'segment-debug-bar',
    onDisplayProgress: handleDisplayProgress,
    onDebugSnapshot: setSnapshot,
  });
  const { key, ...progressBarProps } = progressBarConfig;

  return (
    <section style={{
      padding: '1.25rem',
      borderRadius: '16px',
      border: '1px solid var(--border)',
      background: 'var(--surface)',
      boxShadow: 'var(--shadow-sm)',
      display: 'grid',
      gap: '1rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <SlidersHorizontal size={17} color="var(--accent)" />
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Segment Contract Debug</h2>
          </div>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Drives the same segment helper used by Chapter Header and records the rendered progress callbacks.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={startSegment}>
            <Play size={14} style={{ marginRight: '0.35rem' }} />
            Start Segment
          </button>
          <button className="btn-ghost" onClick={stopSegment}>
            <Square size={14} style={{ marginRight: '0.35rem' }} />
            Stop Segment
          </button>
          <button className="btn-ghost" onClick={resetSegmentDebug}>
            <RotateCcw size={14} style={{ marginRight: '0.35rem' }} />
            Reset
          </button>
        </div>
      </div>

      <div style={{ padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
        <PredictiveProgressBar key={key} {...progressBarProps} />
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(260px, 0.8fr) minmax(320px, 1.2fr)' }}>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <FieldLabel label="Segment target %" help="The activeSegmentProgress value from a segments.progress frame." />
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-secondary)' }}>{Math.round(targetProgress * 100)}%</span>
            </div>
            <input
              aria-label="Segment target %"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(targetProgress * 100)}
              onChange={event => updateTargetProgress(Number(event.target.value) / 100)}
            />
          </label>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {[0, 20, 40, 60, 80, 100].map(percent => (
              <button key={percent} className="btn-ghost" onClick={() => updateTargetProgress(percent / 100)}>
                {percent}%
              </button>
            ))}
          </div>
          <MetricGrid items={[
            ['Helper key', 'The exact React key returned by buildSegmentProgressBarProps.', key],
            ['Target progress', 'The raw target currently sent into the helper.', formatPercent(targetProgress)],
            ['Displayed progress', 'The current rendered value reported by PredictiveProgressBar.', snapshot?.localProgress != null ? formatPercent(snapshot.localProgress) : 'n/a'],
            ['Tick loop active', 'Whether the bar is ticking for an active segment state.', snapshot?.tickLoopActive ? 'yes' : 'no'],
            ['Migration', 'The current lane transition percent.', snapshot?.migrationProgress != null ? formatPercent(snapshot.migrationProgress) : 'none'],
          ]} />
          <div
            data-testid="segment-debug-helper-key"
            style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
          >
            {key}
          </div>
          <div
            data-testid="segment-debug-helper-contract"
            style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
          >
            predictive=false; allowBackwardProgress=true; transitionTicks=3; tickMs=250; showEta=false
          </div>
        </div>

        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <strong style={{ fontSize: '0.85rem' }}>Display callback log</strong>
            <textarea
              data-testid="segment-debug-display-log"
              readOnly
              value={displayLog.join('\n')}
              style={{
                width: '100%',
                minHeight: '150px',
                padding: '0.65rem',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--surface-light)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: '0.8rem',
                resize: 'vertical',
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <strong style={{ fontSize: '0.85rem' }}>Segment event log</strong>
            <textarea
              data-testid="segment-debug-event-log"
              readOnly
              value={eventLog.join('\n')}
              style={{
                width: '100%',
                minHeight: '150px',
                padding: '0.65rem',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--surface-light)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: '0.8rem',
                resize: 'vertical',
              }}
            />
          </label>
        </div>
      </div>
    </section>
  );
};
