/**
 * ArchetypeQuickPick.tsx — owner-requested (2026-07-16)
 *
 * A character LIBRARY over the 39-row voice archetype table
 * (`recordingArchetypes.ts`, statically bundled from
 * design-docs/reference/voice-archetypes/voice_archetypes.json).
 * Picking an archetype fills class/gender/age/tone/timbre/pace at once,
 * instead of tagging each field by hand — a fast starting point for a new
 * voice's metadata (`OverviewTab.tsx`) or a Record-mode session
 * (`ArchetypePicker.tsx`), used in both places per the owner's explicit ask.
 *
 * Owner follow-up (2026-07-16): "a library of characters that could even be
 * filtered by selections made in the styles to narrow things down." When the
 * caller passes its current `attrs`, the library ranks all 39 archetypes by
 * the shared `scoreArchetype()` (recordingPromptSuggester.ts — the single
 * scoring implementation) and shows best matches first with a match badge.
 * Narrowing only reorders/sections — every archetype stays reachable under
 * "All characters". With no selections it's the plain alphabetical,
 * searchable list.
 *
 * Owner-confirmed behavior: picking an archetype OVERWRITES all six fields
 * unconditionally, even if some are already set — a deliberate reset, not a
 * merge. This is a bare picker with no local selection state of its own; the
 * caller's fields are the only source of truth (so re-rendering with a
 * different `value` — e.g. after a manual edit — doesn't fight the picker).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { VoiceAttributes } from '@/types';
import { recordingArchetypes, type RecordingArchetype } from './recordingArchetypes';
import { scoreArchetype, CLOSE_THRESHOLD, EXACT_THRESHOLD } from './recordingPromptSuggester';

export type ArchetypeQuickPickFields = Pick<VoiceAttributes, 'class' | 'gender' | 'age' | 'tone' | 'timbre' | 'pace'>;

function splitList(csv: string): string[] {
    return csv.split(',').map(s => s.trim()).filter(Boolean);
}

// --- Pure ranking helpers (unit-tested) -----------------------------------

export type ArchetypeMatchTier = 'exact' | 'close' | null;

export interface RankedArchetype {
    archetype: RecordingArchetype;
    /** scoreArchetype() result (0 when no attrs are set). */
    score: number;
    tier: ArchetypeMatchTier;
}

/** True if any of the caller's selections carry a value worth ranking by. */
export function hasMeaningfulAttrs(attrs: Partial<VoiceAttributes> | undefined): boolean {
    if (!attrs) return false;
    return Object.values(attrs).some(value => {
        if (Array.isArray(value)) return value.length > 0;
        return value !== undefined && value !== null && value !== '';
    });
}

/** Map a scoreArchetype() score to a badge tier using the suggester's shared thresholds. */
export function matchTier(score: number): ArchetypeMatchTier {
    if (score >= EXACT_THRESHOLD) return 'exact';
    if (score >= CLOSE_THRESHOLD) return 'close';
    return null;
}

/**
 * Rank the full archetype table against the caller's current selections.
 * No meaningful selections → alphabetical, all scores 0, no tiers.
 * Otherwise → scoreArchetype() descending, ties alphabetical. Always returns
 * every archetype — narrowing must never hide the library.
 */
export function rankArchetypes(attrs: Partial<VoiceAttributes> | undefined): RankedArchetype[] {
    const alphabetical = [...recordingArchetypes].sort(
        (a, b) => a.archetype_name.localeCompare(b.archetype_name),
    );
    if (!hasMeaningfulAttrs(attrs)) {
        return alphabetical.map(archetype => ({ archetype, score: 0, tier: null }));
    }
    return alphabetical
        .map(archetype => {
            const score = scoreArchetype(attrs as VoiceAttributes, archetype);
            return { archetype, score, tier: matchTier(score) };
        })
        .sort((a, b) => b.score - a.score || a.archetype.archetype_name.localeCompare(b.archetype.archetype_name));
}

// --- Library UI ------------------------------------------------------------

export interface ArchetypeQuickPickProps {
    onPick: (fields: ArchetypeQuickPickFields) => void;
    /** Caller's current selections — when set, the library ranks/sections by match. */
    attrs?: Partial<VoiceAttributes>;
    disabled?: boolean;
}

const TIER_LABEL: Record<Exclude<ArchetypeMatchTier, null>, string> = {
    exact: 'Match',
    close: 'Close match',
};

function sectionHeaderStyle(): CSSProperties {
    return {
        padding: '10px 12px 4px',
        fontSize: '0.7rem',
        fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    };
}

function LibraryRow({ entry, onSelect }: { entry: RankedArchetype; onSelect: (a: RecordingArchetype) => void }) {
    const { archetype, tier } = entry;
    return (
        <button
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => onSelect(archetype)}
            className="dropdown-item-hover"
            style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: '2px',
                background: 'transparent',
                textAlign: 'left',
            }}
        >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 500 }}>
                    {archetype.archetype_name}
                </span>
                {tier && (
                    <span
                        style={{
                            flexShrink: 0,
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: 'var(--accent-glow)',
                            color: 'var(--action-primary)',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {TIER_LABEL[tier]}
                    </span>
                )}
            </span>
            <span
                style={{
                    color: 'var(--text-muted)',
                    fontSize: '0.75rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}
            >
                {archetype.class} · {archetype.dominant_tones} · {archetype.dominant_timbres}
            </span>
        </button>
    );
}

export function ArchetypeQuickPick({ onPick, attrs, disabled }: ArchetypeQuickPickProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const ranked = useMemo(() => rankArchetypes(attrs), [attrs]);
    const narrowed = hasMeaningfulAttrs(attrs);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && inputRef.current) inputRef.current.focus();
        if (!isOpen) setSearch('');
    }, [isOpen]);

    const query = search.trim().toLowerCase();
    const visible = query
        ? ranked.filter(r =>
            r.archetype.archetype_name.toLowerCase().includes(query) ||
            r.archetype.class.toLowerCase().includes(query))
        : ranked;

    // Sectioning only applies while narrowed by selections (and not mid-search,
    // where split headers over a filtered list read as noise).
    const matches = narrowed && !query ? visible.filter(r => r.tier !== null) : [];
    const rest = narrowed && !query ? visible.filter(r => r.tier === null) : visible;
    const showSections = matches.length > 0;

    const handleSelect = (archetype: RecordingArchetype) => {
        setIsOpen(false);
        onPick({
            class: archetype.class,
            gender: archetype.gender,
            age: archetype.age,
            tone: splitList(archetype.dominant_tones),
            timbre: splitList(archetype.dominant_timbres),
            pace: archetype.pace,
        });
    };

    return (
        <div className="metadata-field">
            <label className="metadata-field-label">Character library (optional)</label>
            <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
                <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    onClick={() => !disabled && setIsOpen(open => !open)}
                    disabled={disabled}
                    className="form-input"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        background: 'var(--surface-light)',
                        padding: '10px 14px',
                        borderColor: isOpen ? 'var(--action-primary)' : 'var(--border)',
                        boxShadow: isOpen ? '0 0 0 2px var(--accent-glow)' : 'none',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        width: '100%',
                        textAlign: 'left',
                    }}
                >
                    <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {narrowed
                            ? 'Browse the character library — narrowed by your selections…'
                            : 'Pick a voice archetype to fill class/gender/age/tone/timbre/pace…'}
                    </span>
                    <ChevronDown
                        size={16}
                        style={{
                            color: 'var(--text-muted)',
                            transform: isOpen ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.2s ease',
                            flexShrink: 0,
                        }}
                    />
                </button>

                {isOpen && (
                    <div
                        style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-card)',
                            boxShadow: 'var(--shadow-lg)',
                            zIndex: 1000,
                            overflow: 'hidden',
                            marginTop: '4px',
                        }}
                    >
                        <div style={{ padding: '8px', borderBottom: '1px solid var(--border-light)' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    ref={inputRef}
                                    type="search"
                                    role="searchbox"
                                    aria-label="Search characters"
                                    placeholder="Search characters…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Escape') setIsOpen(false); }}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px 8px 32px',
                                        fontSize: 'var(--type-callout)',
                                        background: 'var(--surface-alt)',
                                        border: '1px solid var(--border-light)',
                                        borderRadius: 'var(--radius-button)',
                                        color: 'var(--text-primary)',
                                        outline: 'none',
                                    }}
                                />
                            </div>
                        </div>

                        <div role="listbox" aria-label="Character library" style={{ maxHeight: '280px', overflowY: 'auto', padding: '4px' }}>
                            {showSections && <div style={sectionHeaderStyle()}>Best matches</div>}
                            {matches.map(entry => (
                                <LibraryRow key={entry.archetype.archetype_name} entry={entry} onSelect={handleSelect} />
                            ))}
                            {showSections && rest.length > 0 && <div style={sectionHeaderStyle()}>All characters</div>}
                            {rest.map(entry => (
                                <LibraryRow key={entry.archetype.archetype_name} entry={entry} onSelect={handleSelect} />
                            ))}
                            {visible.length === 0 && (
                                <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    No characters match "{search}"
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
