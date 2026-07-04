import React, { useState } from 'react';

// ---------------------------------------------------------------------------
// TagsInput — free-form lowercase-hyphenated tags
// ---------------------------------------------------------------------------
export function TagsInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
    const [draft, setDraft] = useState('');

    const commit = () => {
        const cleaned = draft.trim().toLowerCase().replace(/\s+/g, '-');
        if (cleaned && !tags.includes(cleaned)) {
            onChange([...tags, cleaned]);
        }
        setDraft('');
    };

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
        } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
            onChange(tags.slice(0, -1));
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                FREE TAGS
            </label>
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                padding: '8px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--surface-dim)',
                minHeight: '44px',
                alignItems: 'center',
            }}>
                {tags.map(t => (
                    <span
                        key={t}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 10px',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: 'var(--accent-tint-bg)',
                            color: 'var(--accent)',
                            border: '1px solid var(--accent)',
                        }}
                    >
                        {t}
                        <button
                            type="button"
                            onClick={() => onChange(tags.filter(x => x !== t))}
                            aria-label={`Remove tag ${t}`}
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontSize: '0.85rem' }}
                        >
                            ×
                        </button>
                    </span>
                ))}
                <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKey}
                    onBlur={commit}
                    placeholder={tags.length === 0 ? 'cowboy, wizard, grandmother...' : ''}
                    aria-label="Add free tag"
                    style={{
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '0.8rem',
                        color: 'var(--text-primary)',
                        minWidth: '120px',
                        flex: 1,
                    }}
                />
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                Enter or comma to add. Lowercase, hyphen-separated.
            </p>
        </div>
    );
}
