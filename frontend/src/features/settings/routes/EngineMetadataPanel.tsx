import React from 'react';
import { KeyRound, CircleHelp, Cloud, TriangleAlert } from 'lucide-react';
import type { TtsEngine } from '../../../types';
import { getEngineUi } from './settingsRouteHelpers';

export const EngineMetadataPanel: React.FC<{
  engine: TtsEngine;
  schema: any;
  getBadgeStyles: (tone: 'blue' | 'yellow' | 'gray' | 'red') => React.CSSProperties;
}> = ({ engine, schema, getBadgeStyles }) => {
  const ui = getEngineUi(schema);
  const panelTitle = ui?.panel_title || `${engine.display_name} Settings`;
  const summary = ui?.summary || schema?.description || engine.homepage || '';
  const privacyNotice = ui?.privacy_notice;
  const privacyTone = ui?.privacy_tone === 'warning' ? 'warning' : 'info';
  const showPanel = Boolean(summary || ui?.help_url || privacyNotice || !engine.verified);

  if (!showPanel) {
    return null;
  }

  return (
    <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(43, 110, 255, 0.2)', background: 'linear-gradient(180deg, rgba(240, 247, 255, 0.9), rgba(245, 250, 255, 0.72))' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.9rem' }}>
        <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}>
          <div style={{ width: 30, height: 30, borderRadius: '10px', display: 'grid', placeItems: 'center', color: 'var(--accent)', background: 'rgba(43, 110, 255, 0.12)', flexShrink: 0 }}>
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

      {ui?.help_url && (
        <a
          href={ui.help_url}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 900, fontSize: '0.83rem', marginBottom: '0.9rem', padding: '0.55rem 0.75rem', borderRadius: '999px', border: '1px solid rgba(43, 110, 255, 0.15)', background: 'rgba(255,255,255,0.8)', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' }}
        >
          <CircleHelp size={14} />
          {ui.help_label || 'Open instructions'}
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
            border: privacyTone === 'warning' ? '1px solid rgba(217, 119, 6, 0.28)' : '1px solid rgba(43, 110, 255, 0.18)',
            background: privacyTone === 'warning' ? 'rgba(245, 158, 11, 0.09)' : 'rgba(239, 246, 255, 0.72)',
            color: privacyTone === 'warning' ? '#92400e' : 'var(--text-secondary)',
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
