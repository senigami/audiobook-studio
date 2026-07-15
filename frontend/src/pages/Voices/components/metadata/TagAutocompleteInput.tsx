import React, { useMemo, useRef, useState } from 'react';
import { chip } from './chip';
import { VoicePillRow, type PillSpec } from '../VoicePills';

// ---------------------------------------------------------------------------
// TagAutocompleteInput — free-text tag entry with a suggestions dropdown.
//
// Merges TagsInput.tsx's commit/normalize/backspace mechanics with
// ManySelect.tsx's suggestion-chip styling. Selecting a suggestion or typing
// something new both commit through the same commitValue() path. User-
// extensible — suggestions are a hint, not a closed list.
// ---------------------------------------------------------------------------

export interface TagAutocompleteInputProps {
    tags: string[];
    onChange: (tags: string[]) => void;
    /** Existing values to suggest as the user types — e.g. tags already used
     *  elsewhere in the library, plus a small starter vocabulary. */
    suggestions: string[];
    placeholder?: string;
}

export function TagAutocompleteInput({ tags, onChange, suggestions, placeholder }: TagAutocompleteInputProps) {
    const [draft, setDraft] = useState('');
    const [focused, setFocused] = useState(false);
    // -1 means "no suggestion highlighted" (Enter commits the typed draft).
    const [highlighted, setHighlighted] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);

    const commitValue = (raw: string) => {
        const cleaned = raw.trim().toLowerCase().replace(/\s+/g, '-');
        if (cleaned && !tags.includes(cleaned)) {
            onChange([...tags, cleaned]);
        }
        setDraft('');
        setHighlighted(-1);
    };

    const commit = () => commitValue(draft);

    const filtered = useMemo(() => {
        if (!draft.trim()) return [];
        const lower = draft.toLowerCase();
        return suggestions.filter(s => s.toLowerCase().includes(lower) && !tags.includes(s));
    }, [draft, suggestions, tags]);

    const showDropdown = focused && draft.trim() !== '' && filtered.length > 0;

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown' && showDropdown) {
            e.preventDefault();
            setHighlighted(h => Math.min(h + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp' && showDropdown) {
            e.preventDefault();
            setHighlighted(h => Math.max(h - 1, -1));
        } else if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            if (showDropdown && highlighted >= 0 && filtered[highlighted]) {
                commitValue(filtered[highlighted]);
            } else {
                commit();
            }
        } else if (e.key === 'Escape') {
            if (showDropdown) {
                e.preventDefault();
                setFocused(false);
                setHighlighted(-1);
            }
        } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
            onChange(tags.slice(0, -1));
        }
    };

    const pills: PillSpec[] = tags.map(t => ({
        label: t,
        category: 'tag',
        key: t,
        onRemove: () => onChange(tags.filter(x => x !== t)),
    }));

    return (
        <div className="metadata-field">
            <div className="metadata-tags-input__container">
                <VoicePillRow pills={pills} />
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={e => {
                        setDraft(e.target.value);
                        setHighlighted(-1);
                    }}
                    onKeyDown={handleKey}
                    onFocus={() => setFocused(true)}
                    onBlur={() => {
                        commit();
                        setFocused(false);
                    }}
                    placeholder={tags.length === 0 ? (placeholder ?? 'Add a tag...') : ''}
                    aria-label="Add tag"
                    className="metadata-tags-input__draft"
                    style={{ flex: 1 }}
                />
            </div>
            {showDropdown && (
                // Prevent the dropdown click from blurring the input first — a
                // blur-triggered commit() would otherwise fire before the
                // suggestion's onClick, double-committing draft + suggestion.
                <div
                    className="metadata-chip-row"
                    role="listbox"
                    aria-label="Tag suggestions"
                    onMouseDown={e => e.preventDefault()}
                >
                    {filtered.map((s, i) => chip(s, i === highlighted, () => commitValue(s)))}
                </div>
            )}
        </div>
    );
}
