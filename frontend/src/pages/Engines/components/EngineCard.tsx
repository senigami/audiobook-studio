import React, { useState } from 'react';
import { ChevronDown, Cloud, Play, ShieldCheck, Download, Trash2, ShieldAlert, Loader2 } from 'lucide-react';
import type { TtsEngine } from '@/types';
import { api } from '@/api';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { PluginTrustModal, type PluginPreviewInfo } from '@/components/overlays/PluginTrustModal';
import { ToggleButton } from '@/pages/Settings/components/SettingsComponents';
import { getEngineStatusLabel, getBadgeStyles } from '@/pages/Settings/settingsRouteHelpers';
import { EngineDevPanel } from '@/pages/Engines/components/EngineDevPanel';
import { mergeScenarioEngine } from '@/pages/Engines/components/engineScenarioMerge';
import { EngineCalibrationChip, EngineCalibrationSection } from '@/pages/Engines/components/EngineCalibrationSection';
import { EngineSettingsForm } from '@/pages/Engines/components/EngineSettingsForm';
import { EngineTestSample } from '@/pages/Engines/components/EngineTestSample';

const getErrorMessage = (err: any): string => {
  if (typeof err === 'string') return err;
  return err.message || err.error || 'Unknown error';
};

export const EngineCard: React.FC<{
  engine: TtsEngine;
  onUpdate: () => void;
  onShowNotification?: (message: string) => void;
}> = ({ engine, onUpdate, onShowNotification }) => {
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

  const addDevLog = (msg: string) => {
    setDevLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  React.useEffect(() => {
    setTestResult(engine.last_test);
    // Clear scenario and logs if engine ID changes
    setActiveScenario(null);
    setDevLogs([]);
  }, [engine.last_test, engine.engine_id]);

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

  return (
    <details
      style={{
        border: '1px solid var(--border)',
        borderRadius: '16px',
        background: 'var(--surface-light)',
        overflow: 'hidden',
      }}
    >
      <summary
        style={{
          listStyle: 'none',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem',
          alignItems: 'center',
          padding: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <ChevronDown size={17} color="var(--text-muted)" className="details-chevron" />
          {engine.logo_url && (
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
              <img
                src={engine.logo_url}
                alt={`${engine.display_name} logo`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                   // Fallback for broken images
                   (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{displayEngine.display_name}</h3>
              {displayEngine.dev?.enabled && (
                <span style={{
                  fontSize: '0.62rem',
                  fontWeight: 900,
                  background: 'var(--accent-glow)',
                  color: 'var(--accent)',
                  padding: '1px 4px',
                  borderRadius: '4px',
                  border: '1px solid var(--accent-tint-border)',
                  letterSpacing: '0.05em'
                }}>
                  DEV
                </span>
              )}
            </div>
            <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600 }}>
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
            style={{
              borderRadius: '999px',
              padding: '0.28rem 0.6rem',
              fontSize: '0.7rem',
              fontWeight: 900,
              letterSpacing: '0.02em',
              ...getBadgeStyles(tone),
            }}
          >
            {statusLabel}
          </span>
          <span
            style={{
              borderRadius: '999px',
              padding: '0.28rem 0.6rem',
              fontSize: '0.7rem',
              fontWeight: 900,
              letterSpacing: '0.02em',
              ...getBadgeStyles(displayEngine.verified ? 'blue' : 'gray'),
            }}
          >
            {verificationLabel}
          </span>
        </div>

      </summary>
      <div style={{ padding: '0 1rem 1.25rem 2.95rem', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.55 }}>
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
          <div
            style={{
              marginBottom: '1.1rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.9rem',
              borderRadius: '12px',
              border: '1px solid var(--warning-tint-border)',
              background: 'var(--warning-tint-bg)',
              color: 'var(--warning-text)',
              fontSize: '0.82rem',
              lineHeight: 1.55,
            }}
          >
            <ShieldAlert size={16} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <strong style={{ fontSize: '0.86rem' }}>Setup required</strong>
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


        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-glass"
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
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, opacity: displayEngine.status !== 'ready' ? 0.5 : 1 }}
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {testing ? 'Running...' : 'Run Test'}
            </button>
            <button
              type="button"
              className="btn-glass"
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
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, opacity: (displayEngine.verified || verifying) ? 0.7 : 1 }}
            >
              {verifying ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} {verifying ? 'Verifying…' : (displayEngine.verified ? 'Verified' : 'Verify')}
            </button>
            {needsDependencyInstall && (
              <button
                type="button"
                className="btn-glass"
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.8rem',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  fontWeight: 800,
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
                className="btn-glass"
                disabled={removing || saving || installing}
                title="Uninstall this plugin"
                onClick={() => setRemoveConfirmOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.8rem',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  fontWeight: 800,
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
