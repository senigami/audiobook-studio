/**
 * iconPrompt.test.ts — R5-T7 (+ square-portrait reframe, 2026-07-17)
 *
 * Tests:
 * - Square 1:1 head-and-shoulders framing on every path (no "circular")
 * - Manual attributes render as VISUAL descriptors (iconPromptFragments), not bare keywords
 * - Non-fragment attributes (accent/pace/…) + tags/description still included as keywords
 * - Untagged / no attributes → name-only fallback
 * - Archetype match leads with appearance_description AND still appends
 *   manual-attribute visual detail that differs from the archetype
 */
import { describe, it, expect } from 'vitest';
import { buildIconPrompt } from '@/pages/VoiceLab/iconPrompt';
import { TONE_VISUALS, TIMBRE_VISUALS, CLASS_VISUALS } from '@/pages/VoiceLab/iconPromptFragments';
import type { VoiceMetadata } from '@/types';

const SQUARE_FRAME = 'Square 1:1 head-and-shoulders portrait';

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

describe('buildIconPrompt — framing', () => {
    it('uses square head-and-shoulders framing on every path, never circular', () => {
        const inputs: Array<VoiceMetadata | null> = [
            null,
            { id: '2', name: 'My Voice', is_untagged: true },
            { id: '1', name: 'Partial', attributes: { class: 'creature' }, is_untagged: false },
            fullMeta,
        ];
        for (const meta of inputs) {
            const prompt = buildIconPrompt(meta);
            expect(prompt).toContain(SQUARE_FRAME);
            expect(prompt).not.toMatch(/circular/i);
            expect(prompt).toContain('no text');
        }
    });
});

describe('buildIconPrompt — composed (non-archetype) path', () => {
    // class alone scores 3 < CLOSE_THRESHOLD 6 → no archetype match
    const synthMeta: VoiceMetadata = {
        id: 'no-match',
        name: 'Odd Voice',
        attributes: { class: 'synthetic', tone: ['menacing'], timbre: ['robotic'], accent: 'american' },
        is_untagged: false,
    };

    it('translates manual attributes into visual descriptors, not bare keyword joins', () => {
        const prompt = buildIconPrompt(synthMeta);
        expect(prompt).toContain(CLASS_VISUALS.synthetic); // "a synthetic android subject…"
        expect(prompt).toContain(TONE_VISUALS.menacing); // "a hard-set jaw and narrowed eyes…"
        expect(prompt).toContain(TIMBRE_VISUALS.robotic); // "sleek synthetic surfaces…"
        expect(prompt).not.toMatch(/cozy fireside|chunky knit cardigan/);
    });

    it('keeps non-fragment attributes as keywords', () => {
        const prompt = buildIconPrompt(synthMeta);
        expect(prompt).toContain('american');
    });

    it('passes unknown taxonomy values through as keywords', () => {
        const prompt = buildIconPrompt({
            id: 'u',
            name: 'U',
            attributes: { class: 'hologram' as string },
            is_untagged: false,
        });
        expect(prompt).toContain('hologram');
    });

    it('includes description and free tags', () => {
        const prompt = buildIconPrompt({ ...synthMeta, description: 'Ship computer.', tags: ['glitchy'] });
        expect(prompt).toContain('described as: Ship computer.');
        expect(prompt).toContain('glitchy');
    });

    it('is deterministic (same input → same output)', () => {
        expect(buildIconPrompt(synthMeta)).toBe(buildIconPrompt(synthMeta));
    });
});

describe('buildIconPrompt — fallbacks', () => {
    it('falls back to a generic square-portrait prompt for null input', () => {
        const prompt = buildIconPrompt(null);
        expect(prompt).toContain(SQUARE_FRAME);
        expect(prompt).not.toContain('undefined');
    });

    it('falls back to name-only prompt for untagged voice (no attributes)', () => {
        const prompt = buildIconPrompt({ id: '2', name: 'My Voice', is_untagged: true });
        expect(prompt).toContain('"My Voice"');
    });
});

describe('buildIconPrompt — archetype match path', () => {
    // class/gender/age/pace all match "Warm Storyteller" exactly, plus tone
    // overlap — scores well above CLOSE_THRESHOLD.
    const storytellerMeta: VoiceMetadata = {
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

    it('leads with the matched archetype\'s (portrait-safe) appearance_description', () => {
        const prompt = buildIconPrompt(storytellerMeta);
        expect(prompt).toContain('cozy fireside presence');
        expect(prompt).toContain('chunky knit cardigan');
    });

    it('still appends manual-attribute visual detail that DIFFERS from the archetype', () => {
        const meta: VoiceMetadata = {
            ...storytellerMeta,
            attributes: { ...storytellerMeta.attributes, tone: ['warm', 'friendly', 'menacing'] },
        };
        const prompt = buildIconPrompt(meta);
        expect(prompt).toContain('cozy fireside presence');
        // 'menacing' is NOT one of Warm Storyteller's dominant tones → visual fragment appended
        expect(prompt).toContain(TONE_VISUALS.menacing);
        // 'warm' IS a dominant tone of the archetype → its fragment is NOT duplicated
        expect(prompt).not.toContain(TONE_VISUALS.warm);
    });

    it('still includes the voice\'s own tags/description as supporting detail', () => {
        const meta: VoiceMetadata = { ...fullMeta, attributes: { ...fullMeta.attributes, tone: ['warm', 'friendly'], timbre: ['rich', 'velvety'] } };
        const prompt = buildIconPrompt(meta);
        expect(prompt).toContain('cozy fireside presence');
        expect(prompt).toContain('Warm literary narrator.');
        expect(prompt).toContain('bright');
    });

    it('does not use an archetype description when nothing scores a close match', () => {
        const prompt = buildIconPrompt({
            id: 'no-match',
            name: 'Odd Voice',
            attributes: { class: 'synthetic' },
            is_untagged: false,
        });
        expect(prompt).not.toMatch(/cozy fireside|chunky knit cardigan/);
    });
});
