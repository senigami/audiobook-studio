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
        <div className="metadata-field">
            <label className="metadata-field-label">
                FREE TAGS
            </label>
            <div className="metadata-tags-input__container">
                {tags.map(t => (
                    <span
                        key={t}
                        className="metadata-tag-pill"
                    >
                        {t}
                        <button
                            type="button"
                            onClick={() => onChange(tags.filter(x => x !== t))}
                            aria-label={`Remove tag ${t}`}
                            className="metadata-tag-pill__remove"
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
                    className="metadata-tags-input__draft"
                    style={{ flex: 1 }}
                />
            </div>
            <p className="metadata-field-hint">
                Enter or comma to add. Lowercase, hyphen-separated.
            </p>
        </div>
    );
}
