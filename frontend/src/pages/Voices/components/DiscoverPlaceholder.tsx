/**
 * DiscoverPlaceholder.tsx — R5-T4
 *
 * Planned-chip placeholder panel for the 🤗 Discover tab.
 * NO Hugging Face integration is built here (contract: do NOT build HF).
 */
import React from 'react';

export const DiscoverPlaceholder: React.FC = () => (
    <div
        style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 2rem',
            textAlign: 'center',
            gap: '16px',
        }}
    >
        <div
            style={{
                fontSize: '2.5rem',
                lineHeight: 1,
                marginBottom: '4px',
            }}
        >
            🤗
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Community Voices</h3>
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
            >
                planned
            </span>
        </div>

        <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: '420px', fontSize: '0.875rem', lineHeight: 1.6 }}>
            Community voices from Hugging Face — planned.
            Until then, use <strong>Import plugin (.zip)</strong> to bring in voice bundles.
        </p>

        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.75rem' }}>
            No network calls are made from this tab.
        </p>
    </div>
);
