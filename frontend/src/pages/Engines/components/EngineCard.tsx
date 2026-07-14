import React, { useState, useEffect } from 'react';
import { ChevronRight, Cloud, Play, ShieldCheck, Download, Trash2, ShieldAlert, Loader2 } from 'lucide-react';
import type { TtsEngine, Settings } from '@/types';
import { api } from '@/api';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { PluginTrustModal, type PluginPreviewInfo } from '@/components/overlays/PluginTrustModal';
import { ToggleButton, NumberStepper } from '@/pages/Settings/components/SettingsComponents';
import { getEngineStatusLabel, getBadgeStyles } from '@/pages/Settings/settingsRouteHelpers';
import { EngineDevPanel } from '@/pages/Engines/components/EngineDevPanel';
import { mergeScenarioEngine } from '@/pages/Engines/components/engineScenarioMerge';
import { EngineCalibrationChip, EngineCalibrationSection } from '@/pages/Engines/components/EngineCalibrationSection';
import { EngineSettingsForm } from '@/pages/Engines/components/EngineSettingsForm';
import { EngineTestSample } from '@/pages/Engines/components/EngineTestSample';
import '@/pages/Engines/components/EngineCard.css';

const getErrorMessage = (err: any): string => {
  if (typeof err === 'string') return err;
  return err.message || err.error || 'Unknown error';
};

// Fallback ceiling when a plugin's manifest doesn't declare
// behavior.max_concurrent_workers — matches the MAX_GLOBAL_CONCURRENT_SYNTHESIS
// backstop (app/orchestration/scheduler/resources.py:44-46).
const DEFAULT_ENGINE_CAP_CEILING = 8;

export const EngineCard: React.FC<{
  engine: TtsEngine;
  onUpdate: () => void;
  onShowNotification?: (message: string) => void;
  settings?: Settings;
}> = ({ engine, onUpdate, onShowNotification, settings }) => {
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [testResult, setTestResult] = useState(engine.last_test);
  const [removing, setRemoving] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [depsModal, setDepsModal] = useState<{ open: boolean; preview: PluginPreviewInfo | null }>({
    open: false,
    preview: null,
  });
  const [activeScenario, setActiveScenario] = useState<any | null>(null);
  const [devLogs, setDevLogs] = useState<string[]>([]);
  const [savingCap, setSavingCap] = useState(false);
  const engineCapCeiling: number =
    typeof engine.behavior?.max_concurrent_workers === 'number'
      ? engine.behavior.max_concurrent_workers
      : DEFAULT_ENGINE_CAP_CEILING;
  const currentEngineCap = settings?.tts_engine_caps?.[engine.engine_id];
  const [engineCapInput, setEngineCapInput] = useState<string>(
    currentEngineCap != null ? String(currentEngineCap) : ''
  );

  const addDevLog = (msg: string) => {
    setDevLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  React.useEffect(() => {
    setTestResult(engine.last_test);
    // Clear scenario and logs if engine ID changes
    setActiveScenario(null);
    setDevLogs([]);
  }, [engine.last_test, engine.engine_id]);

  useEffect(() => {
    setEngineCapInput(currentEngineCap != null ? String(currentEngineCap) : '');
  }, [currentEngineCap, engine.engine_id]);

  const displayEngine = activeScenario
    ? mergeScenarioEngine(engine, activeScenario.engine_detail)
    : engine;

  const uiMetadata = displayEngine.settings_schema?.['x-ui'];
  const tone = displayEngine.status === 'ready'
    ? 'blue'
    : displayEngine.status === 'needs_setup' || displayEngine.status === 'unverified'
      ? 'yellow'
      : displayEngine.status === 'invalid_config'
        ? 'red'
        : 'gray';
  const statusLabel = getEngineStatusLabel(displayEngine.status);
  const verificationLabel = displayEngine.verified ? 'VERIFIED' : (displayEngine.status === 'not_loaded' ? 'NOT LOADED' : 'UNVERIFIED');
  const canEnable = displayEngine.can_enable ?? (displayEngine.status === 'ready' || displayEngine.enabled);
  const missingDependencies = Array.isArray(displayEngine.missing_dependencies)
    ? displayEngine.missing_dependencies.filter((dep): dep is string => Boolean(dep && String(dep).trim()))
    : [];
  const needsDependencyInstall = displayEngine.dependencies_satisfied === false;
  const dependencyMessage = needsDependencyInstall && missingDependencies.length > 0
    ? `Missing dependencies: ${missingDependencies.join(', ')}.`
    : '';
  const setupMessage = displayEngine.setup_message || displayEngine.health_message || '';
  const enablementMessage = displayEngine.enablement_message || setupMessage || dependencyMessage || (!displayEngine.enabled && !canEnable ? 'Resolve engine setup before enabling this plugin.' : '');

  const handleResetCalibration = async () => {
    if (activeScenario) {
      addDevLog(`Simulated: Reset calibration requested for ${displayEngine.display_name}.`);
      return;
    }
    setSaving(true);
    try {
      await api.resetEngineCalibration(displayEngine.engine_id);
      onShowNotification?.(`${displayEngine.display_name} calibration history reset.`);
      await onUpdate();
    } catch (err: any) {
      const msg = getErrorMessage(err);
      if (engine.dev?.enabled) addDevLog(`Error: ${msg}`);
      onShowNotification?.(`Reset calibration failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (settings: Record<string, any>) => {
    if (activeScenario) {
      addDevLog(`Simulated: Settings saved for ${displayEngine.display_name}.`);
      return;
    }
    setSaving(true);
    try {
      await api.updateEngineSettings(engine.engine_id, settings);
      await onUpdate();
      onShowNotification?.(`${engine.display_name} settings saved.`);
    } catch (err) {
      console.error('Failed to save settings', err);
      const msg = getErrorMessage(err);
      if (engine.dev?.enabled) addDevLog(`Error: ${msg}`);
      onShowNotification?.('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetSetting = async (settingKey: string) => {
    if (activeScenario) {
      addDevLog(`Simulated: Reset setting '${settingKey}' for ${displayEngine.display_name}.`);
      return;
    }
    setSaving(true);
    try {
      await api.clearEngineSetting(engine.engine_id, settingKey);
      await onUpdate();
      const label = settingKey === 'computer_speed_multiplier'
        ? 'baseline'
        : settingKey.replace(/_/g, ' ');
      onShowNotification?.(`${engine.display_name} ${label} reset.`);
    } catch (err) {
      console.error('Failed to reset engine setting', err);
      const msg = getErrorMessage(err);
      if (engine.dev?.enabled) addDevLog(`Error: ${msg}`);
      onShowNotification?.('Failed to reset engine setting.');
    } finally {
      setSaving(false);
    }
  };

  // tts_engine_caps is only read from the JSON body on the backend
  // (app/api/routers/system.py's form branch doesn't parse it), so this
  // posts JSON directly rather than going through api.updateEngineSettings
  // (which writes to the engine's own manifest-declared settings_schema, a
  // different store — see task 012 findings).
  const handleSaveEngineCap = async (rawValue: string) => {
    if (activeScenario) {
      addDevLog(`Simulated: Concurrency cap saved for ${displayEngine.display_name}.`);
      return;
    }
    const parsed = parseInt(rawValue, 10);
    if (rawValue.trim() === '' || Number.isNaN(parsed) || parsed < 1) return;
    const clamped = Math.min(parsed, engineCapCeiling);
    setEngineCapInput(String(clamped));
    setSavingCap(true);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tts_engine_caps: { ...(settings?.tts_engine_caps || {}), [engine.engine_id]: clamped },
        }),
      });
      await onUpdate();
      onShowNotification?.(`${engine.display_name} concurrency cap saved.`);
    } catch (err) {
      console.error('Failed to save engine concurrency cap', err);
      onShowNotification?.('Failed to save concurrency cap.');
    } finally {
      setSavingCap(false);
    }
  };

  return (
    <details className="engine-card">
      <summary className="engine-card__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <ChevronRight size={17} color="var(--text-muted)" className="details-chevron" />
          {engine.logo_url && (
            <div className="engine-card__logo">
              <img
                src={engine.logo_url}
                alt={`${engine.display_name} logo`}
                onError={(e) => {
                   // Fallback for broken images
                   (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 className="engine-card__title">{displayEngine.display_name}</h3>
              {displayEngine.dev?.enabled && (
                <span className="engine-card__dev-badge">
                  DEV
                </span>
              )}
            </div>
            <p className="engine-card__subtitle">
              {displayEngine.engine_id} {displayEngine.version ? `• v${displayEngine.version}` : ''}
            </p>
            {/* Calibration chip row — visible in collapsed header */}
            <EngineCalibrationChip
              engine={displayEngine}
              saving={saving}
              onResetCalibration={handleResetCalibration}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          {displayEngine.cloud && <Cloud size={15} color="var(--warning-text)" />}
          <div style={{ marginRight: '0.5rem' }}>
            <ToggleButton
              enabled={displayEngine.enabled}
              busy={saving}
              disabled={saving || (!displayEngine.enabled && !canEnable)}
              title={displayEngine.enabled ? 'Disable plugin' : enablementMessage || (displayEngine.verified ? 'Enable plugin' : 'Verify this engine before enabling it.')}
              onClick={async (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                if (!displayEngine.enabled && !canEnable) return;
                if (activeScenario) {
                  addDevLog(`Simulated: ${displayEngine.display_name} ${!displayEngine.enabled ? 'enabled' : 'disabled'}.`);
                  return;
                }
                setSaving(true);
                try {
                  await api.updateEngineSettings(displayEngine.engine_id, { enabled: !displayEngine.enabled });
                  await onUpdate();
                  onShowNotification?.(`${displayEngine.display_name} ${!displayEngine.enabled ? 'enabled' : 'disabled'}.`);
                } catch (err) {
                  const msg = getErrorMessage(err);
                  if (engine.dev?.enabled) addDevLog(`Error: ${msg}`);
                  onShowNotification?.(`Failed to ${!displayEngine.enabled ? 'enable' : 'disable'} ${displayEngine.display_name}.`);
                } finally {
                  setSaving(false);
                }
              }}
            />
          </div>
          <span
            className="engine-status-badge"
            style={getBadgeStyles(tone)}
          >
            {statusLabel}
          </span>
          <span
            className="engine-status-badge"
            style={getBadgeStyles(displayEngine.verified ? 'blue' : 'gray')}
          >
            {verificationLabel}
          </span>
        </div>

      </summary>
      <div className="engine-card__body">
        <EngineCalibrationSection
          engine={displayEngine}
          saving={saving}
          onResetCalibration={handleResetCalibration}
        />

        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.85rem' }}>
          {displayEngine.author ? `Engine by ${displayEngine.author}. ` : ''}
          {displayEngine.homepage && (
            <a href={displayEngine.homepage} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              View Documentation
            </a>
          )}
        </p>

        {displayEngine.cloud && (
          <div
            style={{
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
              padding: '0.85rem',
              borderRadius: '12px',
              border: `1px solid ${uiMetadata?.privacy_tone === 'warning' ? 'var(--warning-tint-border)' : 'var(--border)'}`,
              background: uiMetadata?.privacy_tone === 'warning' ? 'var(--warning-tint-bg)' : 'var(--surface-dim)',
              color: uiMetadata?.privacy_tone === 'warning' ? 'var(--warning-text)' : 'var(--text-secondary)',
              fontSize: '0.82rem',
            }}
          >
            <Cloud size={16} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
            <span>Privacy: cloud engines may send text and optional reference audio to external servers.</span>
          </div>
        )}

        {(setupMessage || dependencyMessage || displayEngine.status === 'needs_setup') && (
          <div className="engine-setup-notice">
            <ShieldAlert size={16} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <strong className="engine-setup-notice__title">Setup required</strong>
              <span>
                {setupMessage || 'This engine is waiting on a setup step before it can be used.'}
              </span>
              {dependencyMessage && (
                <div style={{ marginTop: '0.2rem', padding: '0.4rem 0.6rem', background: 'var(--surface-dim)', borderRadius: '6px', fontSize: '0.78rem', fontStyle: 'italic' }}>
                  Missing: {dependencyMessage}
                </div>
              )}
              {needsDependencyInstall && (
                <span style={{ marginTop: '0.4rem' }}>
                  Install Deps installs the Python packages listed for this engine in the same environment Studio is running in.
                </span>
              )}
              {displayEngine.verified === false && !displayEngine.settings_schema?.['x-ui']?.hide_verification_guidance && (
                <span>
                  {displayEngine.display_name} verification uses your Default Voice from General settings as the reference sample.
                </span>
              )}
            </div>
          </div>
        )}

        <EngineSettingsForm
          engine={displayEngine}
          saving={saving}
          onSave={handleSaveSettings}
          onReset={handleResetSetting}
        />

        <EngineTestSample engine={displayEngine} testResult={testResult} />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '0.85rem 1rem',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--surface-light)',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <label htmlFor={`engine-cap-${engine.engine_id}`} style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', display: 'block' }}>
              Concurrent Renders
            </label>
            <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.4 }}>
              Override how many segments this engine may render at once (up to {engineCapCeiling} — engine limit). Takes effect on next app restart.
            </p>
          </div>
          <NumberStepper
            id={`engine-cap-${engine.engine_id}`}
            ariaLabel={`${engine.display_name} concurrent render cap`}
            value={Number(engineCapInput) || 1}
            displayValue={engineCapInput}
            min={1}
            max={engineCapCeiling}
            disabled={savingCap}
            onStep={(next) => {
              setEngineCapInput(String(next));
              handleSaveEngineCap(String(next));
            }}
            onInputChange={(raw) => setEngineCapInput(raw)}
            onInputBlur={(raw) => handleSaveEngineCap(raw)}
          />
        </div>

        <div className="engine-card__footer">
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-glass engine-icon-btn"
              title="Run a real sample render using the Studio default voice reference."
              disabled={saving || testing || displayEngine.status !== 'ready'}
              onClick={async () => {
                if (activeScenario) {
                  addDevLog(activeScenario.dev_logs?.test || `Simulated: Synthesis requested for ${displayEngine.display_name}.`);
                  return;
                }
                setTesting(true);
                try {
                  const res = await api.testEngine(displayEngine.engine_id);
                  setTestResult(res);
                  onShowNotification?.(`Test sample generated for ${displayEngine.display_name}.`);
                } catch (err: any) {
                  const msg = getErrorMessage(err);
                  if (engine.dev?.enabled) addDevLog(`Error: ${msg}`);
                  onShowNotification?.(`Test failed: ${msg}`);
                } finally {
                  setTesting(false);
                }
              }}
              style={{ opacity: displayEngine.status !== 'ready' ? 0.5 : 1 }}
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {testing ? 'Running...' : 'Run Test'}
            </button>
            <button
              type="button"
              className="btn-glass engine-icon-btn"
              title="Verify this engine using the Studio default voice reference sample. A cold engine may take up to a minute to load its model."
              disabled={saving || verifying || displayEngine.verified}
              onClick={async () => {
                if (activeScenario) {
                  addDevLog(activeScenario.dev_logs?.verify || `Simulated: Verification requested for ${displayEngine.display_name}.`);
                  return;
                }
                setVerifying(true);
                try {
                  const res = await api.verifyEngine(displayEngine.engine_id);
                  if (res.ok) {
                    onShowNotification?.(`${displayEngine.display_name} verified successfully.`);
                    await onUpdate();
                  } else {
                    const msg = res.error || res.message || 'Unknown error';
                    if (engine.dev?.enabled) addDevLog(`Error: Verification failed: ${msg}`);
                    onShowNotification?.(`Verification failed: ${msg}`);
                  }
                } catch (err) {
                  const msg = getErrorMessage(err);
                  if (engine.dev?.enabled) addDevLog(`Error: ${msg}`);
                  onShowNotification?.(`Verification failed for ${displayEngine.display_name}.`);
                } finally {
                  setVerifying(false);
                }
              }}
              style={{ opacity: (displayEngine.verified || verifying) ? 0.7 : 1 }}
            >
              {verifying ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} {verifying ? 'Verifying…' : (displayEngine.verified ? 'Verified' : 'Verify')}
            </button>
            {needsDependencyInstall && (
              <button
                type="button"
                className="btn-glass engine-icon-btn"
                title="Install the Python packages required by this engine."
                disabled={saving || installing}
                onClick={async () => {
                  if (activeScenario) {
                    addDevLog(activeScenario.dev_logs?.install || `Simulated: Installing dependencies for ${displayEngine.display_name}.`);
                    return;
                  }
                  // Fetch requirements and show trust modal before installing.
                  setInstalling(true);
                  try {
                    const reqRes = await api.fetchEngineRequirements(displayEngine.engine_id);
                    const requirements: string[] = Array.isArray(reqRes.requirements) ? reqRes.requirements : [];
                    setDepsModal({
                      open: true,
                      preview: {
                        engine_id: displayEngine.engine_id,
                        display_name: displayEngine.display_name,
                        version: displayEngine.version ?? null,
                        requirements,
                      },
                    });
                  } catch (err: any) {
                    const msg = getErrorMessage(err);
                    if (engine.dev?.enabled) addDevLog(`Error fetching requirements: ${msg}`);
                    // Fallback: proceed without requirements list if fetch failed.
                    setDepsModal({
                      open: true,
                      preview: {
                        engine_id: displayEngine.engine_id,
                        display_name: displayEngine.display_name,
                        version: displayEngine.version ?? null,
                        requirements: [],
                      },
                    });
                  } finally {
                    setInstalling(false);
                  }
                }}
                style={{
                  color: 'var(--warning-text)',
                  background: 'var(--warning-tint-bg)',
                  border: '1px solid var(--warning-tint-border)',
                  opacity: (saving || installing) ? 0.5 : 1
                }}
              >
                {installing ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {installing ? 'Installing...' : 'Install Deps'}
              </button>
            )}
          </div>

            {!displayEngine.built_in && (
              <button
                type="button"
                className="btn-glass engine-icon-btn"
                disabled={removing || saving || installing}
                title="Uninstall this plugin"
                onClick={() => setRemoveConfirmOpen(true)}
                style={{
                  color: 'var(--error-text-strong)',
                  opacity: removing ? 0.5 : 1
                }}
              >
                {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {removing ? 'Uninstalling...' : 'Uninstall'}
              </button>
            )}
        </div>
        <ConfirmModal
          isOpen={removeConfirmOpen}
          onCancel={() => setRemoveConfirmOpen(false)}
          onConfirm={async () => {
            setRemoveConfirmOpen(false);
            if (activeScenario) {
              addDevLog(`Simulated: Uninstall requested for ${displayEngine.display_name}.`);
              return;
            }
            try {
              setRemoving(true);
              const res = await api.removeEnginePlugin(displayEngine.engine_id);
              if (res.ok) {
                onShowNotification?.('Plugin uninstalled successfully.');
                await onUpdate();
              } else {
                onShowNotification?.(res.message || 'Uninstall failed.');
              }
            } catch (err) {
              const msg = getErrorMessage(err);
              if (engine.dev?.enabled) addDevLog(`Error: ${msg}`);
              onShowNotification?.('Failed to uninstall plugin.');
            } finally {
              setRemoving(false);
            }
          }}
          title="Uninstall Plugin"
          message={`Are you sure you want to uninstall the ${displayEngine.display_name} plugin? This will delete its folder and all associated data.`}
          confirmText="Uninstall Plugin"
          isDestructive={true}
        />

        {/* Plugin Developer Panel */}
        {engine.dev?.enabled && (
          <EngineDevPanel
            engine={displayEngine}
            activeScenario={activeScenario}
            onScenarioSelect={setActiveScenario}
            logs={devLogs}
            onAddLog={addDevLog}
          />
        )}

        <PluginTrustModal
          isOpen={depsModal.open}
          preview={depsModal.preview}
          mode="install-deps"
          onCancel={() => setDepsModal({ open: false, preview: null })}
          onConfirm={async () => {
            setDepsModal({ open: false, preview: null });
            setInstalling(true);
            try {
              const res = await api.installEngineDependencies(displayEngine.engine_id);
              onShowNotification?.(res.message || 'Dependency installation completed.');
            } catch (err: any) {
              const msg = getErrorMessage(err);
              if (engine.dev?.enabled) addDevLog(`Error: ${msg}`);
              onShowNotification?.(`Installation failed: ${msg}`);
            } finally {
              await onUpdate();
              setInstalling(false);
            }
          }}
        />
      </div>
    </details>
  );
};
