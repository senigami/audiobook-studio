/**
 * simpleArchetypeIcon.test.ts — owner ask (2026-07-17): a flat/generic
 * picker-list icon prompt, distinct from the detailed buildIconPrompt().
 *
 * Covers: determinism, all 103 archetypes produce sensible non-empty output,
 * subject derivation across the dataset's real appearance_creature_type
 * formats (Human/Creature/Character/Deity/Alien/Synthetic dash-prefixed vs.
 * bare nouns vs. "X / Y" alt-label nouns), and that the fixed flat-icon
 * framing language is verbatim/consistent across every character.
 */
import { describe, it, expect } from 'vitest';
import {
    buildSimpleArchetypeIconPrompt,
    deriveSubjectPhrase,
    slugifyArchetypeName,
    defaultPortraitPath,
    SIMPLE_TONE_MOOD,
} from '@/pages/Voices/components/metadata/simpleArchetypeIcon';
import { recordingArchetypes } from '@/pages/Voices/components/metadata/recordingArchetypes';
import taxonomy from '../../../../design-docs/specs/voice-taxonomy.json';

const FIXED_OPEN = 'Flat vector character icon:';
const FIXED_CLOSE =
    'Simple flat shapes, minimal line detail, solid plain-color background, centered, no text, no shading gradients, no photorealism.';

function findArchetype(name: string) {
    const found = recordingArchetypes.find(a => a.archetype_name === name);
    if (!found) throw new Error(`Fixture archetype not found: ${name}`);
    return found;
}

describe('SIMPLE_TONE_MOOD', () => {
    it('covers every taxonomy tone value with a short 2-4 word phrase', () => {
        const toneSection = (taxonomy as any).sections.find((s: any) => s.key === 'tone');
        const toneIds: string[] = toneSection.values.map((v: any) => v.id);
        expect(toneIds.length).toBe(28);
        for (const id of toneIds) {
            expect(SIMPLE_TONE_MOOD[id], `missing mood for tone "${id}"`).toBeTruthy();
            const wordCount = SIMPLE_TONE_MOOD[id].split(/\s+/).length;
            expect(wordCount).toBeGreaterThanOrEqual(2);
            expect(wordCount).toBeLessThanOrEqual(4);
        }
    });

    it('is noticeably terser than the rich cinematic tone vocabulary', () => {
        // menacing's rich fragment ("a hard-set jaw and narrowed eyes, shadowed
        // low-key lighting") is a full cinematic clause; ours must stay short.
        expect(SIMPLE_TONE_MOOD.menacing).toBe('dark, brooding mood');
        expect(SIMPLE_TONE_MOOD.menacing.length).toBeLessThan(40);
    });
});

describe('deriveSubjectPhrase', () => {
    it('strips the "Human — X" prefix pattern and prepends "a"', () => {
        expect(deriveSubjectPhrase('Human — fireside storyteller')).toBe('a fireside storyteller');
    });

    it('strips "Creature — X" / "Synthetic — X" prefixes and picks "a"/"an" correctly', () => {
        expect(deriveSubjectPhrase('Creature — vampire aristocrat')).toBe('a vampire aristocrat');
        expect(deriveSubjectPhrase('Synthetic — rogue AI')).toBe('a rogue AI');
        expect(deriveSubjectPhrase('Character — animate scarecrow')).toBe('an animate scarecrow');
        expect(deriveSubjectPhrase('Deity — death itself')).toBe('a death itself');
        expect(deriveSubjectPhrase('Alien — first-contact envoy')).toBe('a first-contact envoy');
    });

    it('handles bare nouns with no "X — Y" prefix at all', () => {
        expect(deriveSubjectPhrase('Griffin')).toBe('a griffin');
        expect(deriveSubjectPhrase('Kraken')).toBe('a kraken');
        expect(deriveSubjectPhrase('Djinn')).toBe('a djinn');
        expect(deriveSubjectPhrase('Minotaur')).toBe('a minotaur');
        expect(deriveSubjectPhrase('Angel')).toBe('an angel');
        expect(deriveSubjectPhrase('Elf')).toBe('an elf');
    });

    it('takes the primary noun from an "X / Y" bare-noun alt-label', () => {
        expect(deriveSubjectPhrase('Zombie / undead')).toBe('a zombie');
        expect(deriveSubjectPhrase('Robot / AI assistant')).toBe('a robot');
        expect(deriveSubjectPhrase('Android / robot')).toBe('an android');
    });
});

describe('buildSimpleArchetypeIconPrompt', () => {
    it('is deterministic — same archetype produces the same output every call', () => {
        const archetype = findArchetype('Warm Storyteller');
        const first = buildSimpleArchetypeIconPrompt(archetype);
        const second = buildSimpleArchetypeIconPrompt(archetype);
        expect(first).toBe(second);
    });

    it('builds a flat prompt for a human archetype without touching appearance_description', () => {
        const archetype = findArchetype('Warm Storyteller');
        const prompt = buildSimpleArchetypeIconPrompt(archetype);
        expect(prompt).toBe(
            'Flat vector character icon: a fireside storyteller, warm, cozy mood. ' +
            'Simple flat shapes, minimal line detail, solid plain-color background, centered, no text, no shading gradients, no photorealism.',
        );
        expect(prompt).not.toContain(archetype.appearance_description);
    });

    it('builds a flat prompt for a creature archetype', () => {
        const archetype = findArchetype('Vampire Aristocrat');
        const prompt = buildSimpleArchetypeIconPrompt(archetype);
        expect(prompt).toBe(
            'Flat vector character icon: a vampire aristocrat, cold, sinister mood. ' +
            'Simple flat shapes, minimal line detail, solid plain-color background, centered, no text, no shading gradients, no photorealism.',
        );
    });

    it('builds a flat prompt for a synthetic archetype', () => {
        const archetype = findArchetype('Rogue Hacker AI');
        const prompt = buildSimpleArchetypeIconPrompt(archetype);
        expect(prompt).toBe(
            'Flat vector character icon: a rogue AI, wry, sly mood. ' +
            'Simple flat shapes, minimal line detail, solid plain-color background, centered, no text, no shading gradients, no photorealism.',
        );
    });

    it('every one of the 103 archetypes produces non-empty, sensible output with the fixed framing verbatim', () => {
        expect(recordingArchetypes.length).toBe(103);
        for (const archetype of recordingArchetypes) {
            const prompt = buildSimpleArchetypeIconPrompt(archetype);
            expect(prompt.length).toBeGreaterThan(0);
            expect(prompt).not.toMatch(/undefined/);
            expect(prompt).not.toMatch(/NaN/);
            expect(prompt.startsWith(FIXED_OPEN)).toBe(true);
            expect(prompt.endsWith(FIXED_CLOSE)).toBe(true);
            // Never leaks the rich/detailed appearance_description text.
            expect(prompt).not.toContain(archetype.appearance_description);
        }
    });
});

describe('slugifyArchetypeName', () => {
    it('lowercases and hyphenates', () => {
        expect(slugifyArchetypeName('Warm Storyteller')).toBe('warm-storyteller');
        expect(slugifyArchetypeName('Ancient Athenian Philosopher')).toBe('ancient-athenian-philosopher');
    });

    it('drops apostrophes rather than turning them into hyphens', () => {
        expect(slugifyArchetypeName("Will-o'-the-Wisp")).toBe('will-o-the-wisp');
    });

    it('collapses any other punctuation into a single hyphen with no leading/trailing hyphens', () => {
        expect(slugifyArchetypeName('Cloak-and-Dagger Assassin')).toBe('cloak-and-dagger-assassin');
    });

    it('produces a unique slug for every one of the 103 archetypes', () => {
        const slugs = recordingArchetypes.map(a => slugifyArchetypeName(a.archetype_name));
        expect(new Set(slugs).size).toBe(recordingArchetypes.length);
        for (const slug of slugs) {
            expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        }
    });
});

describe('defaultPortraitPath', () => {
    it('builds the public/archetype-portraits lookup path from the slug', () => {
        const archetype = findArchetype('Warm Storyteller');
        expect(defaultPortraitPath(archetype)).toBe('/archetype-portraits/warm-storyteller.png');
    });
});
