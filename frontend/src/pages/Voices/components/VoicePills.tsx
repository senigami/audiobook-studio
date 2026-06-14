/**
 * VoicePills.tsx — R5-T1
 *
 * Reusable pill system for voice attribute display.
 * Renders whatever attribute fields VoiceMetadata carries — no hardcoded field universe.
 * Fixed display order: class → gender → age → extended (alpha) → tags.
 * Apple-style tinted fill pills using design-system tokens.
 */
import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { VoiceMetadata } from '@/types';

// ---------------------------------------------------------------------------
// Pill category types
// ---------------------------------------------------------------------------

export type PillCategory = 'class' | 'gender' | 'age' | 'extended' | 'tag';

export interface PillSpec {
    label: string;
    category: PillCategory;
    /** Original metadata key, for testing/debugging */
    key: string;
}

// ---------------------------------------------------------------------------
// Token mapping per category
// ---------------------------------------------------------------------------

const CATEGORY_STYLE: Record<PillCategory, { bg: string; border: string; text: string }> = {
    class:    { bg: 'var(--pill-class-bg)',    border: 'var(--pill-class-border)',    text: 'var(--pill-class-text)' },
    gender:   { bg: 'var(--pill-gender-bg)',   border: 'var(--pill-gender-border)',   text: 'var(--pill-gender-text)' },
    age:      { bg: 'var(--pill-age-bg)',      border: 'var(--pill-age-border)',      text: 'var(--pill-age-text)' },
    extended: { bg: 'var(--pill-extended-bg)', border: 'var(--pill-extended-border)', text: 'var(--pill-extended-text)' },
    tag:      { bg: 'var(--pill-tag-bg)',      border: 'var(--pill-tag-border)',      text: 'var(--pill-tag-text)' },
};

// Core keys that map to their own hue
const CORE_KEYS: Record<string, PillCategory> = {
    class: 'class',
    voice_class: 'class',
    gender: 'gender',
    age: 'age',
    age_range: 'age',
};

// Keys that are not attribute scalar fields (skip them)
const SKIP_KEYS = new Set(['id', 'name', 'description', 'image', 'languages', 'tags', 'is_untagged']);

/**
 * Walk a VoiceMetadata object dynamically:
 * - known core keys → their category hue
 * - any other scalar attribute field → extended hue
 * - entries of tags array → ghost style
 * Fixed order: class → gender → age → extended (alpha by key) → tags
 */
export function voicePillsFromMetadata(meta: VoiceMetadata): PillSpec[] {
    const classPills: PillSpec[] = [];
    const genderPills: PillSpec[] = [];
    const agePills: PillSpec[] = [];
    const extendedMap: Map<string, PillSpec> = new Map();
    const tagPills: PillSpec[] = [];

    // Walk the attributes sub-object if present
    const attrs = meta.attributes as Record<string, unknown> | undefined;
    if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
            if (SKIP_KEYS.has(key)) continue;
            const category = CORE_KEYS[key] ?? 'extended';

            // Arrays (e.g. tone[], timbre[]) — emit one pill per item
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (typeof item === 'string' && item.trim()) {
                        const pill: PillSpec = { label: item, category, key };
                        if (category === 'class') classPills.push(pill);
                        else if (category === 'gender') genderPills.push(pill);
                        else if (category === 'age') agePills.push(pill);
                        else extendedMap.set(`${key}::${item}`, pill);
                    }
                }
            } else if (typeof value === 'string' && value.trim()) {
                const label = value;
                const pill: PillSpec = { label, category, key };
                if (category === 'class') classPills.push(pill);
                else if (category === 'gender') genderPills.push(pill);
                else if (category === 'age') agePills.push(pill);
                else extendedMap.set(key, pill);
            }
        }
    }

    // tags array at the top level of VoiceMetadata
    if (Array.isArray(meta.tags)) {
        for (const tag of meta.tags) {
            if (typeof tag === 'string' && tag.trim()) {
                tagPills.push({ label: tag, category: 'tag', key: 'tags' });
            }
        }
    }

    // Extended: sorted alphabetically by key
    const extendedPills = Array.from(extendedMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, pill]) => pill);

    return [...classPills, ...genderPills, ...agePills, ...extendedPills, ...tagPills];
}

// ---------------------------------------------------------------------------
// VoicePill — single chip
// ---------------------------------------------------------------------------

interface VoicePillProps {
    spec: PillSpec;
}

export const VoicePill: React.FC<VoicePillProps> = ({ spec }) => {
    const style = CATEGORY_STYLE[spec.category];
    return (
        <span
            className="voice-pill"
            data-category={spec.category}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: 'var(--radius-round)',
                border: `1px solid ${style.border}`,
                background: style.bg,
                color: style.text,
                fontSize: '0.6875rem',
                fontWeight: 600,
                letterSpacing: '0.01em',
                whiteSpace: 'nowrap',
                lineHeight: 1.5,
                userSelect: 'none',
            }}
        >
            {spec.label}
        </span>
    );
};

// ---------------------------------------------------------------------------
// VoicePillRow — renders up to `max` pills + overflow +N chip
// ---------------------------------------------------------------------------

interface VoicePillRowProps {
    pills: PillSpec[];
    /** Maximum pills to show before collapsing into +N. 0 = no cap. */
    max?: number;
}

export const VoicePillRow: React.FC<VoicePillRowProps> = ({ pills, max = 0 }) => {
    const [expanded, setExpanded] = useState(false);

    if (pills.length === 0) return null;

    const capped = max > 0 && !expanded && pills.length > max;
    const visible = capped ? pills.slice(0, max) : pills;
    const overflow = capped ? pills.length - max : 0;

    return (
        <div
            className="voice-pill-row"
            style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                alignItems: 'center',
            }}
        >
            {visible.map((p, i) => (
                <VoicePill key={`${p.key}-${p.label}-${i}`} spec={p} />
            ))}
            {overflow > 0 && (
                <button
                    type="button"
                    aria-label={`Show ${overflow} more attributes`}
                    aria-expanded={false}
                    onClick={() => setExpanded(true)}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-round)',
                        border: '1px solid var(--pill-tag-border)',
                        background: 'var(--pill-tag-bg)',
                        color: 'var(--text-muted)',
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        lineHeight: 1.5,
                        whiteSpace: 'nowrap',
                    }}
                >
                    +{overflow}
                </button>
            )}
            {expanded && max > 0 && pills.length > max && (
                <button
                    type="button"
                    aria-label="Show fewer attributes"
                    onClick={() => setExpanded(false)}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-round)',
                        border: '1px solid var(--pill-tag-border)',
                        background: 'var(--pill-tag-bg)',
                        color: 'var(--text-muted)',
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        lineHeight: 1.5,
                        whiteSpace: 'nowrap',
                    }}
                >
                    −
                </button>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// UntaggedBadge
// ---------------------------------------------------------------------------

export const UntaggedBadge: React.FC<{ onClick?: () => void }> = ({ onClick }) => (
    <button
        type="button"
        title="This voice has no metadata tags. Click to add tags and improve voice search and casting."
        aria-label="Voice missing attributes — click to add metadata"
        onClick={onClick}
        style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: 'var(--radius-round)',
            border: '1px solid var(--warning-tint-border)',
            background: 'var(--warning-tint-bg)',
            color: 'var(--warning-text)',
            fontSize: '0.6875rem',
            fontWeight: 600,
            cursor: onClick ? 'pointer' : 'default',
            lineHeight: 1.5,
            whiteSpace: 'nowrap',
        }}
    >
        <AlertTriangle size={10} />
        missing attributes
    </button>
);
