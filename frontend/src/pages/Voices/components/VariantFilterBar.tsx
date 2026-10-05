/**
 * VariantFilterBar.tsx — voice-variant-tagging-and-ia task 010
 *
 * Toggleable `performance_tags` filter-chip bar, rendered above
 * `VariantSwitcher` (task 008) only in rail mode (>4 variants) — this is
 * DC-003, the "find the sad, slow one" feature. Selecting multiple chips is
 * OR-within-facet (matches `app/domain/voices/metadata.py`'s existing
 * character-level filter convention), since this bar has only one facet.
 *
 * Reuses `chip()` (ManySelect's toggle-chip helper) rather than
 * `TagAutocompleteInput`'s type-to-add styling, since these chips are only
 * ever toggled, never typed into.
 */
import React from 'react';
import type { SpeakerProfile } from '@/types';
import { chip } from '@/pages/Voices/components/metadata/chip';

export interface VariantFilterBarProps {
    profiles: SpeakerProfile[];
    activeFilters: string[];
    onFilterChange: (filters: string[]) => void;
}

export const VariantFilterBar: React.FC<VariantFilterBarProps> = ({
    profiles,
    activeFilters,
    onFilterChange,
}) => {
    const allTags = Array.from(
        new Set(profiles.flatMap(p => p.performance_tags ?? []))
    ).sort();

    if (allTags.length === 0) return null;

    const toggle = (tag: string) => {
        if (activeFilters.includes(tag)) {
            onFilterChange(activeFilters.filter(t => t !== tag));
        } else {
            onFilterChange([...activeFilters, tag]);
        }
    };

    return (
        <div className="variant-filter-bar" data-testid="variant-filter-bar">
            <div className="metadata-chip-row">
                {allTags.map(tag => chip(tag, activeFilters.includes(tag), () => toggle(tag)))}
            </div>
        </div>
    );
};
