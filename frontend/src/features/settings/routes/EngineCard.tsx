import React, { useState } from 'react';
import { ChevronDown, Cloud, Play, ShieldCheck, FileText, Download, Trash2, ShieldAlert, Loader2 } from 'lucide-react';
import type { TtsEngine } from '../../../types';
import { api } from '../../../api';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { ToggleButton } from './SettingsComponents';
import { getEngineUi, getEngineStatusLabel, getBadgeStyles } from './settingsRouteHelpers';
import { EngineMetadataPanel } from './EngineMetadataPanel';
import { JsonSchemaForm } from './JsonSchemaForm';

export const EngineCard: React.FC<{
  engine: TtsEngine;
  onUpdate: () => void;
  onShowNotification?: (message: string) => void;
}> = ({ engine, onUpdate, onShowNotification }) => {
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(engine.last_test);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

  React.useEffect(() => {
    setTestResult(engine.last_test);
  }, [engine.last_test]);
  const engineUi = getEngineUi(engine.settings_schema);
  const tone = engine.status === 'ready'
    ? 'blue'
    : engine.status === 'needs_setup'
      ? 'yellow'
      : engine.status === 'invalid_config'
        ? 'red'
        : 'gray';
  const statusLabel = getEngineStatusLabel(engine.status);
  const verificationLabel = engine.verified ? 'VERIFIED' : (engine.status === 'not_loaded' ? 'NOT LOADED' : 'UNVERIFIED');
  const canEnable = engine.can_enable ?? (engine.status === 'ready' || engine.enabled);
  const missingDependencies = Array.isArray(engine.missing_dependencies)
    ? engine.missing_dependencies.filter((dep): dep is string => Boolean(dep && String(dep).trim()))
    : [];
  const dependencyMessage = !engine.dependencies_satisfied && missingDependencies.length > 0
    ? `Missing dependencies: ${missingDependencies.join(', ')}.`
    : '';
  const setupMessage = engine.setup_message || engine.health_message || '';
  const enablementMessage = engine.enablement_message || setupMessage || dependencyMessage || (!engine.enabled && !canEnable ? 'Resolve engine setup before enabling this plugin.' : '');

  const handleSaveSettings = async (settings: Record<string, any>) => {
    setSaving(true);
    try {
      await api.updateEngineSettings(engine.engine_id, settings);
      await onUpdate();
      onShowNotification?.(`${engine.display_name} settings saved.`);
    } catch (err) {
      console.error('Failed to save settings', err);
      onShowNotification?.('Failed to save settings.');
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
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{engine.display_name}</h3>
            <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600 }}>
              {engine.engine_id} {engine.version ? `• v${engine.version}` : ''}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div style={{ marginRight: '0.5rem' }}>
            <ToggleButton
              enabled={engine.enabled}
              busy={saving}
              disabled={saving || (!engine.enabled && !canEnable)}
              title={engine.enabled ? 'Disable plugin' : enablementMessage || (engine.verified ? 'Enable plugin' : 'Verify this engine before enabling it.')}
              onClick={async (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                if (!engine.enabled && !canEnable) return;
                setSaving(true);
                try {
                  await api.updateEngineSettings(engine.engine_id, { enabled: !engine.enabled });
                  await onUpdate();
                  onShowNotification?.(`${engine.display_name} ${!engine.enabled ? 'enabled' : 'disabled'}.`);
                } catch (err) {
                  onShowNotification?.(`Failed to ${!engine.enabled ? 'enable' : 'disable'} ${engine.display_name}.`);
                } finally {
                  setSaving(false);
                }
              }}
            />
          </div>
          {engine.cloud && <Cloud size={15} color="#92400e" />}
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
          {engine.status !== 'not_loaded' && (
            <span
              style={{
                borderRadius: '999px',
                padding: '0.28rem 0.6rem',
                fontSize: '0.7rem',
                fontWeight: 900,
                letterSpacing: '0.02em',
                ...getBadgeStyles(engine.verified ? 'blue' : 'gray'),
              }}
            >
              {verificationLabel}
            </span>
          )}
        </div>
      </summary>
      <div style={{ padding: '0 1rem 1.25rem 2.95rem', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.55 }}>
        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.85rem' }}>
          {engine.author ? `Engine by ${engine.author}. ` : ''}
          {engine.homepage && (
            <a href={engine.homepage} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              View Documentation
            </a>
          )}
        </p>

        {engine.cloud && (
          <div
            style={{
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
              padding: '0.85rem',
              borderRadius: '12px',
              border: '1px solid rgba(217, 119, 6, 0.25)',
              background: 'rgba(245, 158, 11, 0.08)',
              color: '#92400e',
              fontSize: '0.82rem',
            }}
          >
            <Cloud size={16} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
            <span>Privacy: cloud engines may send text and optional reference audio to external servers.</span>
          </div>
        )}

        {(setupMessage || dependencyMessage || engine.status === 'needs_setup') && (
          <div
            style={{
              marginBottom: '1.1rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.9rem',
              borderRadius: '12px',
              border: '1px solid rgba(245, 158, 11, 0.24)',
              background: 'rgba(245, 158, 11, 0.08)',
              color: '#92400e',
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
                <div style={{ marginTop: '0.2rem', padding: '0.4rem 0.6rem', background: 'rgba(0,0,0,0.04)', borderRadius: '6px', fontSize: '0.78rem', fontStyle: 'italic' }}>
                  Missing: {dependencyMessage}
                </div>
              )}
              <span style={{ marginTop: '0.4rem' }}>
                Install Deps installs the Python packages listed for this engine in the same environment Studio is running in.
              </span>
              {engine.engine_id.toLowerCase().includes('xtts') && (
                <span>
                  XTTS verification uses your Default Voice from General settings as the reference sample.
                </span>
              )}
            </div>
          </div>
        )}

        {(engineUi || engine.settings_schema?.description) && (
          <EngineMetadataPanel engine={engine} schema={engine.settings_schema} getBadgeStyles={getBadgeStyles} />
        )}

        <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <JsonSchemaForm
            schema={engine.settings_schema}
            values={engine.current_settings || {}}
            onSave={handleSaveSettings}
            busy={saving}
            engineVerified={engine.verified}
          />
        </div>

        {testResult && testResult.ok && (
          <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '12px', border: '1px solid var(--border)', animation: 'fade-in 0.3s ease-out' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
               <span style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                 Latest Test Sample
               </span>
               <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                 Generated at: {new Date(testResult.generated_at * 1000).toLocaleString()}
               </span>
             </div>
             <audio controls src={testResult.audio_url} style={{ width: '100%', height: '36px' }} />
          </div>
        )}


        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-glass"
            title="Run a real sample render using the Studio default voice reference."
            disabled={saving || testing || engine.status !== 'ready'}
            onClick={async () => {
              setTesting(true);
              try {
                const res = await api.testEngine(engine.engine_id);
                setTestResult(res);
                onShowNotification?.(`Test sample generated for ${engine.display_name}.`);
              } catch (err: any) {
                onShowNotification?.(`Test failed: ${err.message || 'Unknown error'}`);
              } finally {
                setTesting(false);
              }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, opacity: engine.status !== 'ready' ? 0.5 : 1 }}
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {testing ? 'Running...' : 'Run Test'}
          </button>
          
          <button
            type="button"
            className="btn-glass"
            title="Verify this engine using the Studio default voice reference sample."
            disabled={saving || engine.verified}
            onClick={async () => {
              setSaving(true);
              try {
                const res = await api.verifyEngine(engine.engine_id);
                if (res.ok) {
                  onShowNotification?.(`${engine.display_name} verified successfully.`);
                  await onUpdate();
                } else {
                  onShowNotification?.(`Verification failed: ${res.error || res.message || 'Unknown error'}`);
                }
              } catch (err) {
                onShowNotification?.(`Verification failed for ${engine.display_name}.`);
              } finally {
                setSaving(false);
              }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, opacity: engine.verified ? 0.5 : 1 }}
          >
            <ShieldCheck size={14} /> {engine.verified ? 'Verified' : 'Verify'}
          </button>


          {engine.status === 'needs_setup' && (
            <button
              type="button"
              className="btn-glass"
              title="Install the Python packages required by this engine."
            onClick={async () => {
              try {
                const res = await api.installEngineDependencies(engine.engine_id);
                onShowNotification?.(res.message || 'Dependency installation triggered.');
                } catch (err) {
                  onShowNotification?.('Failed to trigger installation.');
                }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, color: '#92400e', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}
          >
            <Download size={14} /> Install Deps
            </button>
          )}

          {!engine.verified && engine.status !== 'ready' && (
            <button
              type="button"
              className="btn-glass"
              title="Remove this plugin"
              onClick={() => setRemoveConfirmOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, color: '#b91c1c' }}
            >
              <Trash2 size={14} /> Remove
            </button>
          )}
        </div>
        <ConfirmModal
          isOpen={removeConfirmOpen}
          onCancel={() => setRemoveConfirmOpen(false)}
          onConfirm={async () => {
            setRemoveConfirmOpen(false);
            try {
              const res = await api.removeEnginePlugin(engine.engine_id);
              if (res.ok) {
                onShowNotification?.('Plugin removed successfully.');
                await onUpdate();
              } else {
                onShowNotification?.(res.message || 'Removal failed.');
              }
            } catch (err) {
              onShowNotification?.('Failed to remove plugin.');
            }
          }}
          title="Remove Plugin"
          message={`Are you sure you want to remove the ${engine.display_name} plugin? This will delete its folder.`}
          confirmText="Remove Plugin"
          isDestructive={true}
        />
      </div>
    </details>
  );
};
