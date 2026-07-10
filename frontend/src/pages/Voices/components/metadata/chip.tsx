import React from 'react';

export function chip(
    label: string,
    active: boolean,
    onClick: () => void,
    required?: boolean
): React.ReactNode {
    return (
        <button
            key={label}
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className="metadata-chip"
            style={{
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
            }}
        >
            {label}
            {required && !active && (
                <span style={{ color: 'var(--error)', fontSize: '0.6rem', fontWeight: 900 }}>*</span>
            )}
        </button>
    );
}
