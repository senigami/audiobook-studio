/**
 * ArchetypeQuickPick library ranking/narrowing tests (owner ask 2026-07-16:
 * "library of characters ... filtered by selections made in the styles").
 *
 * Covers the pure ranking helpers (attrs -> order, thresholds -> tier labels,
 * empty attrs -> full alphabetical list) plus a render pass over the ranked
 * library UI.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
    ArchetypeQuickPick,
    rankArchetypes,
    matchTier,
    hasMeaningfulAttrs,
} from '@/pages/Voices/components/metadata/ArchetypeQuickPick';
import { recordingArchetypes } from '@/pages/Voices/components/metadata/recordingArchetypes';
import {
    scoreArchetype,
    CLOSE_THRESHOLD,
    EXACT_THRESHOLD,
} from '@/pages/Voices/components/metadata/recordingPromptSuggester';
import type { VoiceAttributes } from '@/types';

/** Attrs copied verbatim from the 'Warm Storyteller' archetype — a guaranteed exact match. */
const WARM_STORYTELLER_ATTRS: VoiceAttributes = {
    class: 'human',
    gender: 'feminine',
    age: 'adult',
    tone: ['warm', 'friendly', 'gentle'],
    timbre: ['rich', 'velvety', 'smooth'],
    pace: 'measured',
};

describe('hasMeaningfulAttrs', () => {
    it('is false for undefined / empty / empty-array attrs', () => {
        expect(hasMeaningfulAttrs(undefined)).toBe(false);
        expect(hasMeaningfulAttrs({})).toBe(false);
        expect(hasMeaningfulAttrs({ tone: [], timbre: [], class: '' })).toBe(false);
    });

    it('is true when any field is set', () => {
        expect(hasMeaningfulAttrs({ class: 'human' })).toBe(true);
        expect(hasMeaningfulAttrs({ tone: ['warm'] })).toBe(true);
    });
});

describe('matchTier', () => {
    it('maps scores to tiers using the suggester thresholds', () => {
        expect(matchTier(EXACT_THRESHOLD)).toBe('exact');
        expect(matchTier(12)).toBe('exact');
        expect(matchTier(CLOSE_THRESHOLD)).toBe('close');
        expect(matchTier(EXACT_THRESHOLD - 0.01)).toBe('close');
        expect(matchTier(CLOSE_THRESHOLD - 0.01)).toBe(null);
        expect(matchTier(0)).toBe(null);
    });
});

describe('rankArchetypes', () => {
    it('with no meaningful attrs returns the full list alphabetically, all untiered', () => {
        const ranked = rankArchetypes(undefined);
        expect(ranked).toHaveLength(recordingArchetypes.length);
        const names = ranked.map(r => r.archetype.archetype_name);
        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
        expect(ranked.every(r => r.tier === null)).toBe(true);

        // Same behavior for attrs that are set-but-empty.
        expect(rankArchetypes({ tone: [] }).map(r => r.archetype.archetype_name)).toEqual(names);
    });

    it('with attrs sorts by scoreArchetype descending and never drops entries', () => {
        const ranked = rankArchetypes(WARM_STORYTELLER_ATTRS);
        expect(ranked).toHaveLength(recordingArchetypes.length);
        for (let i = 1; i < ranked.length; i++) {
            expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
        }
        expect(ranked[0].archetype.archetype_name).toBe('Warm Storyteller');
        expect(ranked[0].tier).toBe('exact');
        // Scores agree with the shared scorer — no reimplementation drift.
        for (const r of ranked) {
            expect(r.score).toBe(scoreArchetype(WARM_STORYTELLER_ATTRS, r.archetype));
        }
    });

    it('breaks score ties alphabetically', () => {
        const ranked = rankArchetypes({ class: 'human' });
        const humanNames = ranked.filter(r => r.archetype.class === 'human').map(r => r.archetype.archetype_name);
        expect(humanNames).toEqual([...humanNames].sort((a, b) => a.localeCompare(b)));
        // All class matches score above all non-matches.
        const firstNonHuman = ranked.findIndex(r => r.archetype.class !== 'human');
        expect(ranked.slice(0, firstNonHuman).every(r => r.archetype.class === 'human')).toBe(true);
    });
});

describe('<ArchetypeQuickPick /> library UI', () => {
    const openLibrary = () => {
        fireEvent.click(screen.getByRole('button', { name: /pick a voice archetype|browse the character library/i }));
    };

    it('with attrs shows a ranked library with match badges and an "All characters" section', () => {
        render(<ArchetypeQuickPick onPick={() => {}} attrs={WARM_STORYTELLER_ATTRS} />);
        openLibrary();

        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(recordingArchetypes.length);
        expect(options[0]).toHaveTextContent('Warm Storyteller');
        expect(options[0]).toHaveTextContent(/^|match/i);
        expect(screen.getByText(/best matches/i)).toBeInTheDocument();
        expect(screen.getByText(/all characters/i)).toBeInTheDocument();
    });

    it('with no attrs shows the full alphabetical library with no match sections', () => {
        render(<ArchetypeQuickPick onPick={() => {}} />);
        openLibrary();

        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(recordingArchetypes.length);
        const names = rankArchetypes(undefined).map(r => r.archetype.archetype_name);
        expect(options[0]).toHaveTextContent(names[0]);
        expect(screen.queryByText(/best matches/i)).not.toBeInTheDocument();
    });

    it('search narrows the list and picking fires onPick with all 6 fields', () => {
        const onPick = vi.fn();
        render(<ArchetypeQuickPick onPick={onPick} attrs={WARM_STORYTELLER_ATTRS} />);
        openLibrary();

        fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'newsreader' } });
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(1);
        fireEvent.click(options[0]);

        expect(onPick).toHaveBeenCalledWith({
            class: 'human',
            gender: 'masculine',
            age: 'middle-aged',
            tone: ['authoritative', 'serious', 'professional'],
            timbre: ['crisp', 'clear', 'resonant'],
            pace: 'brisk',
        });
    });
});
