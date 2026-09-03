import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { VoicePillRow, type PillSpec } from '../VoicePills';

// ---------------------------------------------------------------------------
// TagAutocompleteInput — label + pills + a "+" trigger that opens a compact
// search popover (owner-requested, 2026-07-16: MUI-style "click the plus,
// search/pick from a dropdown, get a pill" rather than a permanently-open
// text box sitting next to the pills). The popover opens with the full
// suggestion list already visible (no typing required to see options) and
// closes itself the moment a value commits, whether picked from the list or
// typed free text — there is never a leftover empty input on screen.
// ---------------------------------------------------------------------------

export interface TagAutocompleteInputProps {
    tags: string[];
    onChange: (tags: string[]) => void;
    /** Existing values to suggest as the user types — e.g. tags already used
     *  elsewhere in the library, plus a small starter vocabulary. */
    suggestions: string[];
    placeholder?: string;
    /** Optional field label, rendered above the pill/input row (F3.1-style
     *  tinted via `labelColor` when supplied) — omit for the tags-row usage
     *  in VariantEditor, which has no standalone label of its own. */
    label?: string;
    labelColor?: string;
}

export function TagAutocompleteInput({ tags, onChange, suggestions, placeholder, label, labelColor }: TagAutocompleteInputProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    // -1 means "no suggestion highlighted" (Enter commits the typed draft).
    const [highlighted, setHighlighted] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    useEffect(() => {
        if (open) {
            inputRef.current?.focus();
        } else {
            setDraft('');
            setHighlighted(-1);
        }
    }, [open]);

    const commitValue = (raw: string) => {
        const cleaned = raw.trim().toLowerCase().replace(/\s+/g, '-');
        if (cleaned && !tags.includes(cleaned)) {
            onChange([...tags, cleaned]);
        }
        setOpen(false);
    };

    // Suggestions show in full as soon as the popover opens; typing narrows
    // the list rather than being required to populate it.
    const filtered = useMemo(() => {
        const lower = draft.trim().toLowerCase();
        return suggestions.filter(s => !tags.includes(s) && (!lower || s.toLowerCase().includes(lower)));
    }, [draft, suggestions, tags]);

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlighted(h => Math.min(h + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted(h => Math.max(h - 1, -1));
        } else if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            if (highlighted >= 0 && filtered[highlighted]) {
                commitValue(filtered[highlighted]);
            } else if (draft.trim()) {
                commitValue(draft);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
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

    const fieldName = label ? label.toLowerCase() : 'tag';
    const addLabel = `Add ${fieldName}`;

    return (
        <div className="metadata-field">
            {label && (
                <label className="metadata-field-label" style={labelColor ? { color: labelColor } : undefined}>
                    {label}
                </label>
            )}
            <div className="tag-multiselect__row">
                <VoicePillRow pills={pills} />
                <div className="tag-multiselect__control" ref={containerRef}>
                    <button
                        type="button"
                        className="tag-multiselect__add-btn"
                        onClick={() => setOpen(o => !o)}
                        aria-label={addLabel}
                        aria-expanded={open}
                    >
                        <Plus size={14} />
                    </button>
                    {open && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -6 }}
                            animate={{ opacity: 1, scale: 1, y: 4 }}
                            transition={{ duration: 0.12 }}
                            className="tag-multiselect__popover"
                        >
                            <input
                                ref={inputRef}
                                value={draft}
                                onChange={e => {
                                    setDraft(e.target.value);
                                    setHighlighted(-1);
                                }}
                                onKeyDown={handleKey}
                                placeholder={placeholder ?? `Search ${fieldName}...`}
                                aria-label={`Search ${fieldName}`}
                                className="tag-multiselect__search"
                            />
                            <div className="tag-multiselect__options" role="listbox" aria-label={`${label ?? 'Tag'} suggestions`}>
                                {filtered.map((s, i) => (
                                    <button
                                        key={s}
                                        type="button"
                                        role="option"
                                        aria-selected={i === highlighted}
                                        className="tag-multiselect__option"
                                        data-highlighted={i === highlighted ? '' : undefined}
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => commitValue(s)}
                                    >
                                        {s}
                                    </button>
                                ))}
                                {filtered.length === 0 && draft.trim() && (
                                    <button
                                        type="button"
                                        className="tag-multiselect__option tag-multiselect__option--create"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => commitValue(draft)}
                                    >
                                        Add &ldquo;{draft.trim()}&rdquo;
                                    </button>
                                )}
                                {filtered.length === 0 && !draft.trim() && (
                                    <div className="tag-multiselect__empty">No suggestions</div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
}
