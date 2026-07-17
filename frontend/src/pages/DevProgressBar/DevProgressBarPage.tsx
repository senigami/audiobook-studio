import React from 'react';
import { Terminal } from 'lucide-react';
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import { useProgressBarTest } from '@/hooks/useProgressBarTest';
import { ProgressBarLaunchPanel } from '@/pages/DevProgressBar/components/ProgressBarLaunchPanel';
import { ProgressBarUpdatePanel } from '@/pages/DevProgressBar/components/ProgressBarUpdatePanel';
import { ProgressBarDebugPanel } from '@/pages/DevProgressBar/components/ProgressBarDebugPanel';
import { SegmentContractDebugPanel } from '@/pages/DevProgressBar/components/SegmentContractDebugPanel';
import '@/pages/DevProgressBar/DevProgressBarPage.css';

export const ProgressBarTestPage: React.FC = () => {
  const {
    launchConfig,
    activeConfig,
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
    finishRun,
    setActiveAllowBackward,
    setStatus,
    setConfigStartedAtToNow,
    updateSource,
    lastSocketEnvelope,
    lastIgnoredEnvelope
  } = useProgressBarTest();

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <section style={{
        padding: '1.5rem',
        borderRadius: '20px',
        border: '1px solid var(--border)',
        background: 'linear-gradient(180deg, var(--surface-white), var(--surface))',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
          <Terminal size={18} color="var(--action-primary)" />
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Progress Bar Test</h1>
        </div>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          Tweak the same props the real progress bar receives, then push updates the way live websocket events would.
        </p>
      </section>

      <SegmentContractDebugPanel />

      <div className="dev-progress-bar-page__columns">
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
            manualProgressValue={manualProgressValue}
            setManualProgressValue={setManualProgressValue}
            manualEtaSeconds={manualEtaSeconds}
            setManualEtaSeconds={setManualEtaSeconds}
            manualStatus={manualStatus}
            setManualStatus={setManualStatus}
            nudgeProgress={nudgeProgress}
            finishRun={finishRun}
            setActiveAllowBackward={setActiveAllowBackward}
            applyManualUpdate={applyManualUpdate}
          />
        </section>

        <section style={{
          padding: '1.25rem',
          borderRadius: '18px',
          border: '1px solid var(--border)',
          background: 'linear-gradient(180deg, var(--surface-white), var(--surface-tinted-light))',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 style={{ marginTop: 0 }}>Live Preview</h2>
          <div style={{ padding: '1rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
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
                checkpointMode={activeConfig.checkpointMode}
                onDebugSnapshot={setDebugSnapshot}
              />
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
