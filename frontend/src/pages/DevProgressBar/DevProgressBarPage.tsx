import React from 'react';
import { Terminal } from 'lucide-react';
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import { buildSegmentProgressBarProps } from '@/components/progress/progressBarContracts';
import { useProgressBarTest } from '@/hooks/useProgressBarTest';
import { ProgressBarLaunchPanel } from '@/pages/DevProgressBar/components/ProgressBarLaunchPanel';
import { ProgressBarUpdatePanel } from '@/pages/DevProgressBar/components/ProgressBarUpdatePanel';
import { ProgressBarDebugPanel } from '@/pages/DevProgressBar/components/ProgressBarDebugPanel';
import { SegmentContractDebugPanel } from '@/pages/DevProgressBar/components/SegmentContractDebugPanel';

export const ProgressBarTestPage: React.FC = () => {
  const {
    launchConfig,
    activeConfig, setActiveConfig,
    renderToken,
    eventLog,
    manualStatus, setManualStatus,
    manualProgressValue, setManualProgressValue,
    manualEtaSeconds, setManualEtaSeconds,
    debugSnapshot, setDebugSnapshot,
    debugHistory,
    applyConfigPatch,
    applyManualUpdate,
    launchSampleRun,
    resetPreview,
    nudgeProgress,
    setStatus,
    setConfigStartedAtToNow,
    updateSource,
    lastSocketEnvelope,
    lastIgnoredEnvelope
  } = useProgressBarTest();
  const isSegmentCheckpoint = activeConfig.checkpointMode === 'segment';
  const segmentProgressBarProps = isSegmentCheckpoint
    ? buildSegmentProgressBarProps({
        jobId: activeConfig.persistenceKey ?? 'progress-test-run',
        segmentId: activeConfig.persistenceKey ?? 'progress-test-segment',
        progress: activeConfig.progress,
        status: activeConfig.status,
        evidenceWeightFraction: activeConfig.evidenceWeightFraction,
        state: activeConfig.status === 'running' ? 'processing' : activeConfig.status,
        label: activeConfig.label,
        dataTestId: 'dev-progress-bar-preview',
        onDebugSnapshot: setDebugSnapshot,
      })
    : null;

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

      <SegmentContractDebugPanel />

      <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'minmax(320px, 0.95fr) minmax(360px, 1.05fr)' }}>
        <section style={{
          padding: '1.25rem',
          borderRadius: '18px',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <ProgressBarLaunchPanel
            launchConfig={launchConfig}
            applyConfigPatch={applyConfigPatch}
            setConfigStartedAtToNow={setConfigStartedAtToNow}
            setStatus={setStatus}
            launchSampleRun={launchSampleRun}
            resetPreview={resetPreview}
          />
          
          <ProgressBarUpdatePanel
            activeConfig={activeConfig}
            setActiveConfig={setActiveConfig}
            manualProgressValue={manualProgressValue}
            setManualProgressValue={setManualProgressValue}
            manualEtaSeconds={manualEtaSeconds}
            setManualEtaSeconds={setManualEtaSeconds}
            manualStatus={manualStatus}
            setManualStatus={setManualStatus}
            nudgeProgress={nudgeProgress}
            applyManualUpdate={applyManualUpdate}
          />
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
              {segmentProgressBarProps ? (() => {
                const { key, ...progressBarProps } = segmentProgressBarProps;
                return <PredictiveProgressBar key={`${renderToken}:${key}`} {...progressBarProps} />;
              })() : (
                <PredictiveProgressBar
                  key={renderToken}
                  dataTestId="dev-progress-bar-preview"
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
              )}
          </div>

          <ProgressBarDebugPanel
            activeConfig={activeConfig}
            launchConfig={launchConfig}
            debugSnapshot={debugSnapshot}
            debugHistory={debugHistory}
            eventLog={eventLog}
            updateSource={updateSource}
            lastSocketEnvelope={lastSocketEnvelope}
            lastIgnoredEnvelope={lastIgnoredEnvelope}
          />
        </section>
      </div>
    </div>
  );
};
