/**
 * imagePromptComposer.test.ts — mad-lib image-description composer, 2026-07-17.
 *
 * Mirrors the structural-difference assertions in cueComposer.test.ts: tone
 * and timbre counts must visibly change SENTENCE STRUCTURE, not just swap
 * words inside one fixed shape.
 */
import { describe, it, expect } from 'vitest';
import { composeImageDescription } from '@/pages/VoiceLab/imagePromptComposer';
import { buildIconPrompt } from '@/pages/VoiceLab/iconPrompt';
import { TONE_VISUALS, TIMBRE_VISUALS } from '@/pages/VoiceLab/iconPromptFragments';
import type { VoiceAttributes, VoiceMetadata } from '@/types';

// Same portrait-safety denylist enforced in iconPromptFragments.test.ts — the
// composer only pulls from already-checked vocab, but sentence assembly
// could in principle juxtapose words in a new way, so re-check defensively.
const OUT_OF_FRAME = /\b(hands?|knuckles?|fingers?|fingernails?|fists?|palms?|wrists?|forearms?|arms?|elbows?|chest(ed)?|torso|waist|hips?|legs?|knees?|shins?|ankles?|feet|foot|toes?|boots?|shoes?|heels?|posture|standing|stands|kneeling|crouch(ed|ing)?|sitting|seated|perched|strid(e|ing)|gait|handshake|full[- ]body)\b/i;

function sentenceCount(text: string): number {
    return text.split(/[.!?]/).filter(s => s.trim()).length;
}

describe('composeImageDescription', () => {
    it('is deterministic — same attrs produce identical output', () => {
        const attrs: VoiceAttributes = { class: 'creature', tone: ['menacing'], timbre: ['gravelly'] };
        expect(composeImageDescription(attrs)).toBe(composeImageDescription({ ...attrs }));
    });

    it('returns an empty string for empty attributes (no undefined, no dangling punctuation)', () => {
        const result = composeImageDescription({});
        expect(result).toBe('');
        expect(result).not.toContain('undefined');
    });

    it('never emits "undefined" or a dangling ", ." even for sparse attribute combos', () => {
        const combos: VoiceAttributes[] = [
            { gender: 'not-applicable' },
            { age: 'ageless', gender: 'not-applicable', class: 'synthetic' },
            { class: 'deity' },
            { tone: [] },
            { timbre: [] },
        ];
        for (const attrs of combos) {
            const result = composeImageDescription(attrs);
            expect(result).not.toContain('undefined');
            expect(result).not.toMatch(/,\s*\./);
            expect(result).not.toMatch(/\s{2,}/);
        }
    });

    it('never emits denylisted below-the-shoulders anatomy', () => {
        const attrs: VoiceAttributes = {
            class: 'human',
            age: 'senior',
            gender: 'masculine',
            tone: ['confident', 'authoritative', 'wise'],
            timbre: ['deep', 'gravelly', 'booming'],
        };
        expect(composeImageDescription(attrs)).not.toMatch(OUT_OF_FRAME);
    });

    describe('CLASS changes the opening sentence shape', () => {
        const shared = { tone: ['calm'] as string[] };

        it('varies sentence framing across classes, not just the noun', () => {
            const human = composeImageDescription({ ...shared, class: 'human' });
            const synthetic = composeImageDescription({ ...shared, class: 'synthetic' });
            const creature = composeImageDescription({ ...shared, class: 'creature' });
            const character = composeImageDescription({ ...shared, class: 'character' });
            const deity = composeImageDescription({ ...shared, class: 'deity' });

            expect(human).toContain('A human subject');
            expect(synthetic).toContain('This is a synthetic android subject');
            expect(character).toContain('Picture a stylized fictional character subject');
            expect(creature.startsWith('A fantastical creature subject')).toBe(true);
            expect(deity.startsWith('An otherworldly divine being')).toBe(true);

            const all = [human, synthetic, creature, character, deity];
            expect(new Set(all).size).toBe(all.length); // all five distinct
        });

        it('degrades gracefully when age/gender do not apply (synthetic/deity-typical)', () => {
            const result = composeImageDescription({ class: 'synthetic', age: 'ageless', gender: 'not-applicable' });
            expect(result).not.toContain('undefined');
            expect(result).not.toMatch(/,\s*\./);
            expect(result).not.toMatch(/\s{2,}/);
            expect(result).toContain('ageless');
        });

        it('omits the opening sentence entirely when there is no class/age/gender data', () => {
            const result = composeImageDescription({ tone: ['calm'] });
            expect(result.startsWith('Their expression')).toBe(true);
        });
    });

    describe('TONE count changes sentence structure (mad-lib property)', () => {
        const base = { class: 'human' as const, timbre: ['deep'] as string[] };

        it('0 tones -> no expression sentence at all', () => {
            const result = composeImageDescription({ ...base, tone: [] });
            expect(result).not.toContain('Their expression');
        });

        it('1 tone -> a direct "shows" clause', () => {
            const result = composeImageDescription({ ...base, tone: ['warm'] });
            expect(result).toContain(`Their expression shows ${TONE_VISUALS.warm}.`);
            expect(result).not.toContain('blends');
            expect(result).not.toContain('besides');
        });

        it('2 tones -> a "blends X with Y" clause', () => {
            const result = composeImageDescription({ ...base, tone: ['warm', 'calm'] });
            expect(result).toContain(`Their expression blends ${TONE_VISUALS.warm} with ${TONE_VISUALS.calm}.`);
            expect(result).not.toContain('besides');
        });

        it('3+ tones -> names the first two and folds the remainder into a "besides" clause', () => {
            const result = composeImageDescription({ ...base, tone: ['warm', 'calm', 'cheerful'] });
            expect(result).toContain(
                `Their expression shows ${TONE_VISUALS.warm} and ${TONE_VISUALS.calm}, with a touch of ${TONE_VISUALS.cheerful} besides.`,
            );
        });

        it('structural marker (blends/besides presence) differs across 0/1/2/3 tone counts', () => {
            const zero = composeImageDescription({ ...base, tone: [] });
            const one = composeImageDescription({ ...base, tone: ['warm'] });
            const two = composeImageDescription({ ...base, tone: ['warm', 'calm'] });
            const three = composeImageDescription({ ...base, tone: ['warm', 'calm', 'cheerful'] });

            expect(zero.includes('Their expression')).toBe(false);
            expect(one.includes('blends') || one.includes('besides')).toBe(false);
            expect(two.includes('blends')).toBe(true);
            expect(two.includes('besides')).toBe(false);
            expect(three.includes('besides')).toBe(true);

            expect(new Set([zero, one, two, three]).size).toBe(4); // all four distinct
        });
    });

    describe('TIMBRE count changes sentence structure independently of tone wording', () => {
        const base = { class: 'human' as const, tone: ['warm'] as string[] };

        it('0 timbres -> no texture sentence at all', () => {
            const result = composeImageDescription({ ...base, timbre: [] });
            expect(result).not.toContain('surface and lighting');
        });

        it('1 timbre -> a "carry" clause', () => {
            const result = composeImageDescription({ ...base, timbre: ['smooth'] });
            expect(result).toContain(`The surface and lighting carry ${TIMBRE_VISUALS.smooth}.`);
        });

        it('2 timbres -> a "meets … in the surface and lighting" clause', () => {
            const result = composeImageDescription({ ...base, timbre: ['smooth', 'velvety'] });
            const smoothCap = TIMBRE_VISUALS.smooth.charAt(0).toUpperCase() + TIMBRE_VISUALS.smooth.slice(1);
            expect(result).toContain(`${smoothCap} meets ${TIMBRE_VISUALS.velvety} in the surface and lighting.`);
        });

        it('3+ timbres -> a "meets …, rounded out by …" clause', () => {
            const result = composeImageDescription({ ...base, timbre: ['smooth', 'velvety', 'silky'] });
            expect(result).toContain('rounded out by');
            expect(result).not.toContain('in the surface and lighting.');
        });

        it("timbre's structural wording differs from tone's structural wording at each count", () => {
            const oneTone = composeImageDescription({ class: 'human', tone: ['warm'], timbre: [] });
            const oneTimbre = composeImageDescription({ class: 'human', tone: [], timbre: ['smooth'] });
            expect(oneTone).toContain('shows');
            expect(oneTimbre).toContain('carry');
            expect(oneTone).not.toContain('carry');
            expect(oneTimbre).not.toContain('shows');
        });
    });

    it('composes class + tone + timbre into one coherent multi-sentence paragraph', () => {
        const result = composeImageDescription({
            class: 'creature',
            tone: ['menacing', 'sinister'],
            timbre: ['gravelly', 'rough'],
        });
        expect(sentenceCount(result)).toBe(3);
        expect(result).not.toMatch(/\s{2,}/);
        expect(result).not.toMatch(/;/); // no bare fragment-join punctuation
    });
});

describe('buildIconPrompt — composed path uses the mad-lib composer', () => {
    it('produces real sentences, not a semicolon-joined fragment list', () => {
        const meta: VoiceMetadata = {
            id: 'mad-lib',
            name: 'Mad Lib Voice',
            attributes: { class: 'human', tone: ['warm', 'calm'], timbre: ['smooth', 'velvety'] },
            is_untagged: false,
        };
        const prompt = buildIconPrompt(meta);
        expect(prompt).toContain('Their expression blends');
        expect(prompt).toContain('in the surface and lighting');
        expect(prompt).not.toContain(`${TONE_VISUALS.warm}; `);
        expect(prompt).not.toContain(`${TONE_VISUALS.calm}; ${TIMBRE_VISUALS.smooth}`);
    });

    it('shows visible structural variation between 0-tone, 1-tone, and 3-tone composed voices', () => {
        const promptFor = (tone: string[]) =>
            buildIconPrompt({
                id: 'v',
                name: 'V',
                attributes: { class: 'human', tone, timbre: ['deep'] },
                is_untagged: false,
            });
        const zero = promptFor([]);
        const one = promptFor(['warm']);
        const three = promptFor(['warm', 'calm', 'cheerful']);
        expect(zero).not.toContain('Their expression');
        expect(one).toContain('Their expression shows');
        expect(three).toContain('besides');
        expect(new Set([zero, one, three]).size).toBe(3);
    });
});
