import React from 'react';
import { KeyRound, CircleHelp, Cloud, TriangleAlert } from 'lucide-react';
import type { TtsEngine } from '@/types';
import { getEngineUi } from '@/pages/Settings/settingsRouteHelpers';

export const EngineMetadataPanel: React.FC<{
  engine: TtsEngine;
  schema: any;
  getBadgeStyles: (tone: 'blue' | 'yellow' | 'gray' | 'red') => React.CSSProperties;
  unframed?: boolean;
}> = ({ engine, schema, getBadgeStyles, unframed }) => {
  const ui = getEngineUi(schema);
  const helpUrl = ui?.help_url;
  const helpLabel = ui?.help_label || 'Open instructions';
  const panelTitle = ui?.panel_title || `${engine.display_name} Settings`;
  const summary = ui?.summary || schema?.description || engine.homepage || '';
  const privacyNotice = ui?.privacy_notice;
  const privacyTone = ui?.privacy_tone === 'warning' ? 'warning' : 'info';
  const showPanel = Boolean(summary || ui?.help_url || privacyNotice || !engine.verified)
    && ui?.hidden !== true
    && !(ui?.hide_metadata_when_verified === true && engine.verified)
    && !(ui?.hide_metadata_when_not_ready === true && engine.status !== 'ready')
    && !(ui?.hide_metadata_when_unverified === true && !engine.verified);

  if (!showPanel) {
    return null;
  }

  return (
    <div style={{
      marginBottom: unframed ? '0' : '1rem',
      padding: unframed ? '0' : '1rem',
      borderRadius: unframed ? '0' : '16px',
      border: unframed ? 'none' : '1px solid var(--accent-tint-border)',
      background: unframed ? 'transparent' : 'linear-gradient(180deg, var(--surface-tinted-light), var(--surface))'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.9rem' }}>
        <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}>
          <div style={{ width: 30, height: 30, borderRadius: '10px', display: 'grid', placeItems: 'center', color: 'var(--action-primary)', background: 'var(--accent-tint-bg)', flexShrink: 0 }}>
            <KeyRound size={16} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 900, color: 'var(--text-primary)' }}>{panelTitle}</h4>
            {summary && (
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.84rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                {summary}
              </p>
            )}
          </div>
        </div>
        {!engine.verified && (
          <span style={{ borderRadius: '999px', padding: '0.3rem 0.7rem', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.02em', ...getBadgeStyles('yellow') }}>
            Verification required
          </span>
        )}
      </div>

      {helpUrl && (
        <a
          href={helpUrl}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: 'var(--action-primary)', textDecoration: 'none', fontWeight: 900, fontSize: '0.83rem', marginBottom: '0.9rem', padding: '0.55rem 0.75rem', borderRadius: '999px', border: '1px solid var(--accent-focus-ring)', background: 'var(--surface-glass-white)', boxShadow: 'var(--shadow-sm)' }}
        >
          <CircleHelp size={14} />
          {helpLabel}
        </a>
      )}

      {privacyNotice && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '10px',
            border: privacyTone === 'warning' ? '1px solid var(--warning-tint-border)' : '1px solid var(--accent-tint-border)',
            background: privacyTone === 'warning' ? 'var(--warning-tint-bg)' : 'var(--surface-tinted-light)',
            color: privacyTone === 'warning' ? 'var(--warning-text)' : 'var(--text-secondary)',
            fontSize: '0.78rem',
            lineHeight: 1.5,
            marginBottom: '0.9rem',
          }}
        >
          {privacyTone === 'warning' ? <TriangleAlert size={14} style={{ marginTop: '2px', flexShrink: 0 }} /> : <Cloud size={14} style={{ marginTop: '2px', flexShrink: 0 }} />}
          <span>{privacyNotice}</span>
        </div>
      )}
    </div>
  );
};
