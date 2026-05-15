import React, { useState, useEffect } from 'react';
import { ToggleButton } from '@/pages/Settings/components/SettingsComponents';

const formatReadOnlyValue = (value: any, prop: any): string => {
  const propUi = prop?.['x-ui'] || {};
  if (propUi.display === 'computer_speed_cps') {
    if (value === undefined || value === null || value === '') {
      return 'Not yet computed';
    }
    const rawMultiplier = Number(value);
    const multiplier = Number.isFinite(rawMultiplier) ? rawMultiplier : 1;
    const rawBaseline = Number(propUi.baseline_cps ?? 16.7);
    const baseline = Number.isFinite(rawBaseline) ? rawBaseline : 16.7;
    const cps = Math.max(0, multiplier * baseline);
    return `${cps.toFixed(1)} characters/sec`;
  }
  return String(value ?? prop.default ?? '');
};

export const JsonSchemaForm: React.FC<{
  schema: any;
  values: Record<string, any>;
  onSave: (values: Record<string, any>) => void;
  onReset?: (key: string) => Promise<void> | void;
  busy: boolean;
  engineVerified: boolean;
}> = ({ schema, values, onSave, onReset, busy, engineVerified }) => {
  const [localValues, setLocalValues] = useState<Record<string, any>>(values);
  const [resettingKey, setResettingKey] = useState<string | null>(null);

  useEffect(() => {
    setLocalValues(values);
  }, [values]);

  if (!schema || !schema.properties || Object.keys(schema.properties).length === 0) {
    return (
      <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        No configurable settings for this engine.
      </div>
    );
  }

  const handleChange = (key: string, value: any) => {
    setLocalValues((prev: Record<string, any>) => ({ ...prev, [key]: value }));
  };

  const handleReset = async (key: string) => {
    if (!onReset) {
      return;
    }
    setResettingKey(key);
    try {
      await onReset(key);
    } finally {
      setResettingKey((current) => (current === key ? null : current));
    }
  };

  const hasChanges = JSON.stringify(localValues) !== JSON.stringify(values);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.25rem' }}>
        {Object.entries(schema.properties)
          .filter(([key, prop]: [string, any]) => {
            const propUi = prop?.['x-ui'] || {};
            if (key === 'enabled') return false;
            if (propUi.hidden === true) return false;
            if (propUi.hide_when_unverified === true && !engineVerified) return false;
            return true;
          })
          .map(([key, prop]: [string, any]) => {
            const propUi = prop?.['x-ui'] || {};
            const isReadOnly = !!prop.readOnly;
            const isLocked = (!!propUi.requires_verification && !engineVerified) || isReadOnly;
            return (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                {prop.title || key}
              </label>
              {!isReadOnly && (prop.type === 'number' || prop.type === 'integer') && (
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--accent)' }}>
                  {localValues[key] ?? prop.default}
                </span>
              )}
            </div>
            {isReadOnly ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.65rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.025)',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                }}
              >
                <span>{formatReadOnlyValue(localValues[key], prop)}</span>
                {onReset && (
                  <button
                    type="button"
                    className="btn-glass"
                    disabled={busy || resettingKey === key}
                    onClick={() => handleReset(key)}
                    title="Reset this computed value and clear its matching render history so it will be recalculated from the next render."
                    style={{ padding: '0.35rem 0.65rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 900 }}
                  >
                    {resettingKey === key ? 'Resetting...' : 'Reset Baseline'}
                  </button>
                )}
              </div>
            ) : prop.type === 'boolean' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <ToggleButton
                  enabled={!!(localValues[key] ?? prop.default)}
                  busy={false}
                  disabled={isLocked}
                  onClick={() => handleChange(key, !(localValues[key] ?? prop.default))}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {isReadOnly ? 'Computed by Studio' : (isLocked ? (propUi.locked_message || 'Verification required before this setting can be enabled.') : ((localValues[key] ?? prop.default) ? 'Enabled' : 'Disabled'))}
                </span>
              </div>
            ) : prop.type === 'number' || prop.type === 'integer' ? (
              <input
                type="range"
                min={prop.minimum ?? 0}
                max={prop.maximum ?? 100}
                step={prop.type === 'integer' ? 1 : 0.01}
                value={localValues[key] ?? prop.default ?? 0}
                disabled={isLocked}
                onChange={(e) =>
                  handleChange(key, prop.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))
                }
                style={{ width: '100%', height: '6px', accentColor: 'var(--accent)', cursor: isLocked ? 'not-allowed' : 'pointer' }}
              />
            ) : prop.enum ? (
              <select
                value={localValues[key] ?? prop.default ?? ''}
                disabled={isLocked}
                onChange={(e) => handleChange(key, e.target.value)}
                style={{
                  padding: '0.65rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  fontSize: '0.85rem',
                  width: '100%',
                  cursor: isLocked ? 'not-allowed' : 'pointer'
                }}
              >
                {Array.from(new Set(prop.enum || [])).map((opt: any) => (
                  <option key={String(opt)} value={opt}>
                    {String(opt)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={prop.format === 'password' ? 'password' : 'text'}
                value={localValues[key] ?? prop.default ?? ''}
                disabled={isLocked}
                onChange={(e) => handleChange(key, e.target.value)}
                style={{
                  padding: '0.65rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  fontSize: '0.85rem',
                  width: '100%',
                }}
              />
            )}
            {prop.description && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {prop.description}
              </p>
            )}
            {isLocked && !isReadOnly && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#b45309', lineHeight: 1.4, fontWeight: 700 }}>
                {propUi.locked_message || 'Verification required before enabling this setting.'}
              </p>
            )}
            {isReadOnly && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4, fontWeight: 700 }}>
                This value is computed from completed renders and saved to this plugin.
              </p>
            )}
          </div>
          );
        })}
      </div>
      {hasChanges && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '0.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            className="btn-primary"
            disabled={busy}
            onClick={() => onSave(localValues)}
            style={{ padding: '0.6rem 1.25rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 900 }}
          >
            {busy ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
};
