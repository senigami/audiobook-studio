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
            style={{
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: '1px solid',
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'white' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                minHeight: '32px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
            }}
        >
            {label}
            {required && !active && (
                <span style={{ color: 'var(--error)', fontSize: '0.6rem', fontWeight: 900 }}>*</span>
            )}
        </button>
    );
}
