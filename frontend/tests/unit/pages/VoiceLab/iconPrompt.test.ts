/**
 * iconPrompt.test.ts — R5-T7
 *
 * Tests:
 * - Full metadata → includes all attribute fields in order
 * - Partial metadata → only includes present fields
 * - Untagged / no attributes → name-only fallback
 * - Unknown future field rendered as extended pill (dynamic walk)
 */
import { describe, it, expect } from 'vitest';
import { buildIconPrompt } from '@/pages/VoiceLab/iconPrompt';
import type { VoiceMetadata } from '@/types';

const fullMeta: VoiceMetadata = {
    id: 'abc',
    name: 'Aria Nova',
    description: 'Warm literary narrator.',
    attributes: {
        class: 'human',
        gender: 'feminine',
        age: 'adult',
        accent: 'british-rp',
        tone: ['warm', 'calm'],
        pace: 'measured',
    },
    tags: ['bright', 'clear'],
    is_untagged: false,
};

describe('buildIconPrompt', () => {
    it('includes core attribute values for full metadata', () => {
        const prompt = buildIconPrompt(fullMeta);
        expect(prompt).toContain('human');
        expect(prompt).toContain('feminine');
        expect(prompt).toContain('adult');
        expect(prompt).toContain('british-rp');
        expect(prompt).toContain('measured');
    });

    it('includes description in the prompt', () => {
        const prompt = buildIconPrompt(fullMeta);
        expect(prompt).toContain('Warm literary narrator.');
    });

    it('includes free tags', () => {
        const prompt = buildIconPrompt(fullMeta);
        expect(prompt).toContain('bright');
        expect(prompt).toContain('clear');
    });

    it('includes extended attributes dynamically (no hardcoded field set)', () => {
        const metaWithUnknown: VoiceMetadata = {
            id: 'xyz',
            name: 'Test Voice',
            attributes: {
                class: 'human',
                gender: 'neutral',
                age: 'adult',
                // timbre is a known-extended attr — just as a proxy for "any extra field"
                timbre: ['gravelly', 'deep'],
            },
            is_untagged: false,
        };
        const prompt = buildIconPrompt(metaWithUnknown);
        expect(prompt).toContain('gravelly');
        expect(prompt).toContain('deep');
    });

    it('handles partial metadata (only class present)', () => {
        const partial: VoiceMetadata = {
            id: '1',
            name: 'Partial',
            attributes: { class: 'creature' },
            is_untagged: false,
        };
        const prompt = buildIconPrompt(partial);
        expect(prompt).toContain('creature');
        // Should still have the boilerplate
        expect(prompt).toMatch(/Circular avatar portrait icon/);
    });

    it('falls back to name-only prompt for null input', () => {
        const prompt = buildIconPrompt(null);
        expect(prompt).toMatch(/Circular avatar portrait icon/);
        expect(prompt).not.toContain('undefined');
    });

    it('falls back to name-only prompt for untagged voice (no attributes)', () => {
        const untagged: VoiceMetadata = {
            id: '2',
            name: 'My Voice',
            is_untagged: true,
        };
        const prompt = buildIconPrompt(untagged);
        expect(prompt).toContain('My Voice');
        expect(prompt).toMatch(/Circular avatar portrait icon/);
    });

    it('is deterministic (same input → same output)', () => {
        expect(buildIconPrompt(fullMeta)).toBe(buildIconPrompt(fullMeta));
    });

    // -----------------------------------------------------------------------
    // Archetype match (user-reported gap, 2026-07-16): the icon prompt used to
    // ignore the 39-row voice archetype table entirely, even though it carries
    // a hand-authored appearance_description written specifically for visual
    // guidance. Close/exact matches should now lead with that description.
    // -----------------------------------------------------------------------

    it('leads with the matched archetype\'s appearance_description for a close match', () => {
        // class/gender/age/pace all match "Warm Storyteller" exactly, plus a
        // tone overlap -- scores well above CLOSE_THRESHOLD.
        const meta: VoiceMetadata = {
            id: 'w1',
            name: 'Story Voice',
            attributes: {
                class: 'human',
                gender: 'feminine',
                age: 'adult',
                tone: ['warm', 'friendly'],
                timbre: ['rich', 'velvety'],
                pace: 'measured',
            },
            is_untagged: false,
        };
        const prompt = buildIconPrompt(meta);
        expect(prompt).toContain('cozy fireside figure');
        expect(prompt).toContain('hand-knit cardigan');
    });

    it('still includes the voice\'s own tags/description as supporting detail alongside the archetype description', () => {
        const meta: VoiceMetadata = {
            ...fullMeta,
            attributes: { ...fullMeta.attributes, tone: ['warm', 'friendly'], timbre: ['rich', 'velvety'] },
        };
        const prompt = buildIconPrompt(meta);
        expect(prompt).toContain('cozy fireside figure');
        expect(prompt).toContain('Warm literary narrator.');
        expect(prompt).toContain('bright');
    });

    it('falls back to raw attribute keywords when no archetype scores a close match', () => {
        const meta: VoiceMetadata = {
            id: 'no-match',
            name: 'Odd Voice',
            attributes: { class: 'synthetic' },
            is_untagged: false,
        };
        const prompt = buildIconPrompt(meta);
        expect(prompt).toContain('synthetic');
        expect(prompt).not.toMatch(/cozy fireside figure|hand-knit cardigan/);
    });
});
