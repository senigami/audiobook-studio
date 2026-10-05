import React from 'react';
import type { PillCategory } from '../VoicePills';

/**
 * F3.2 (design-critique/voices-variants-round2): the active/selected chip
 * state must match its facet's `--pill-*` hue (same tokens `VoicePill`
 * renders that facet with), not a single generic `--accent` for every
 * field. Callers that don't carry a taxonomy facet (e.g. free-form tag
 * suggestions) omit `category` and keep the prior accent-fill styling.
 */
export function chip(
    label: string,
    active: boolean,
    onClick: () => void,
    required?: boolean,
    category?: PillCategory
): React.ReactNode {
    const activeBorder = category ? `var(--pill-${category}-border)` : 'var(--action-primary)';
    const activeBg = category ? `var(--pill-${category}-bg)` : 'var(--action-primary)';
    const activeColor = category ? `var(--pill-${category}-text)` : 'var(--text-on-accent)';
    return (
        <button
            key={label}
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className="metadata-chip"
            data-category={active ? category : undefined}
            style={{
                borderColor: active ? activeBorder : 'var(--border)',
                background: active ? activeBg : 'transparent',
                color: active ? activeColor : 'var(--text-muted)',
            }}
        >
            {label}
            {required && !active && (
                <span style={{ color: 'var(--error)', fontSize: '0.6rem', fontWeight: 900 }}>*</span>
            )}
        </button>
    );
}
