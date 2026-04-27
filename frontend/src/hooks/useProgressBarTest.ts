import React from 'react';
import { type ProgressBarTestConfig, type ProgressBarStatus, DEFAULT_CONFIG } from '../components/progressbar/ProgressBarTestTypes';
import { clamp01, nowUnixSeconds } from '../components/progressbar/ProgressBarTestHelpers';
import { resetPredictiveProgressMemory, type PredictiveProgressDebugSnapshot } from '../components/PredictiveProgressBar';

export function useProgressBarTest() {
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

  return {
    launchConfig, setLaunchConfig,
    activeConfig, setActiveConfig,
    renderToken, setRenderToken,
    eventLog, pushLog,
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
    setConfigStartedAtToNow
  };
}
