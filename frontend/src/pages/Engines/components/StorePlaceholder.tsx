/**
 * StorePlaceholder.tsx — R5-T11
 *
 * "Browse store" section — a planned placeholder only. No fake store entries
 * (unlike the mock) because install buttons on placeholder cards would look
 * functional while doing nothing (intentional deviation, logged in 99_progress_log.md).
 * No GitHub discovery API is called.
 */
import React from 'react';
import { Upload } from 'lucide-react';

export const StorePlaceholder: React.FC = () => (
  <section aria-labelledby="store-section-label" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
      <h2
        id="store-section-label"
        style={{
          margin: 0,
          fontSize: '0.82rem',
          fontWeight: 900,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        Browse store
      </h2>
      {/* Planned chip */}
      <span
        style={{
          fontSize: '0.6rem',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 'var(--radius-round)',
          background: 'var(--warning-tint-bg)',
          color: 'var(--warning-text)',
          border: '1px solid var(--warning-tint-border)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
        aria-label="Planned feature"
        data-testid="store-planned-chip"
      >
        planned
      </span>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
        plugin store — GitHub discovery
      </span>
    </div>

    <div
      style={{
        padding: '1.25rem',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        background: 'var(--surface-light)',
        color: 'var(--text-secondary)',
        fontSize: '0.85rem',
        lineHeight: 1.6,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <p style={{ margin: 0 }}>
        Discover and install engine plugins from GitHub — planned. Until then, use{' '}
        <strong>Import plugin (.zip)</strong> to add engine plugins from a local file.
      </p>
      <div
        style={{
          padding: '0.65rem 0.85rem',
          borderRadius: '10px',
          border: '1px solid var(--warning-tint-border)',
          background: 'var(--warning-tint-bg)',
          color: 'var(--warning-text)',
          fontSize: '0.78rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
        }}
      >
        <Upload size={14} style={{ marginTop: '0.15rem', flexShrink: 0 }} />
        <span>
          Plugins run unsandboxed — install only from sources you trust. Review dependencies
          before confirming any install.
        </span>
      </div>
    </div>
  </section>
);
