import React, { useState } from 'react';
import { ChevronDown, Cloud, Play, ShieldCheck, FileText, Download, Trash2 } from 'lucide-react';
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
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
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
  const enablementMessage = engine.enablement_message || (!engine.enabled && !canEnable ? 'Resolve engine setup before enabling this plugin.' : '');

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

        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-glass"
            title="Run a test synthesis to verify engine output"
            onClick={() => onShowNotification?.(`Test synthesis for ${engine.display_name} is available in the Voices tab. Global verification tests from this card are coming soon.`)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800 }}
          >
            <Play size={14} /> Test
          </button>
          
          <button
            type="button"
            className="btn-glass"
            title="Force a re-verification of the engine"
            disabled={saving}
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
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800 }}
          >
            <ShieldCheck size={14} /> Verify
          </button>

          <button
            type="button"
            className="btn-glass"
            title="View recent logs for this engine"
            onClick={async () => {
              try {
                const res = await api.fetchEngineLogs(engine.engine_id);
                onShowNotification?.(res.logs || 'No logs available.');
              } catch (err) {
                onShowNotification?.('Failed to fetch logs.');
              }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800 }}
          >
            <FileText size={14} /> Logs
          </button>

          {engine.status === 'needs_setup' && (
            <button
              type="button"
              className="btn-glass"
              title="Install missing dependencies"
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
