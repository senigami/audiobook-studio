import React from 'react';
import { Info } from 'lucide-react';

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const nowUnixSeconds = () => Math.floor(Date.now() / 1000);

export const HelpHint: React.FC<{ help: string }> = ({ help }) => (
  <span
    title={help}
    aria-label={help}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      cursor: 'help',
      flexShrink: 0,
    }}
  >
    <Info size={13} />
  </span>
);

export const FieldLabel: React.FC<{ label: string; help: string }> = ({ label, help }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700 }}>
    {label}
    <HelpHint help={help} />
  </span>
);

export const MetricRow: React.FC<{ label: string; help: string; value: string }> = ({ label, help, value }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)',
    gap: '0.75rem',
    alignItems: 'center',
    padding: '0.35rem 0.5rem',
    borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
  }}>
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <HelpHint help={help} />
    </div>
    <div style={{
      fontSize: '0.82rem',
      fontWeight: 700,
      color: 'var(--text-primary)',
      fontVariantNumeric: 'tabular-nums',
      wordBreak: 'break-word',
      textAlign: 'right',
    }}>
      {value}
    </div>
  </div>
);

export const MetricGrid: React.FC<{ items: Array<[string, string, string | number]> }> = ({ items }) => (
  <div style={{
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderRadius: '12px',
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.55)',
  }}>
    {items.map(([label, help, value]) => (
      <MetricRow
        key={String(label)}
        label={String(label)}
        help={String(help)}
        value={String(value)}
      />
    ))}
  </div>
);
