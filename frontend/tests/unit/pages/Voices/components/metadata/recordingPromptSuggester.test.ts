/**
 * recordingPromptSuggester.test.ts — Task 002
 *
 * Note on file location: the task spec (design-docs/plans/active/dynamic_recording_guide/
 * tasks/002-suggester-function.md) names `frontend/src/pages/Voices/components/metadata/
 * recordingPromptSuggester.test.ts` as the exact file, but `frontend/vitest.config.ts`'s
 * `include` only globs `tests/unit/**\/*.test.{ts,tsx}` (no test file anywhere in this repo
 * is colocated under `src/`) — a test placed under `src/` would silently never run. This
 * file lives here instead, mirroring the source path per CLAUDE.md's stated frontend test
 * convention, and covers the same cases the spec calls for.
 *
 * Covers:
 * - null/undefined/empty attrs -> null (INV-4)
 * - an attrs combination matching an archetype closely -> 'exact' confidence
 * - a partial-match combination -> 'close' confidence
 * - an unusual tag combo -> 'composed' confidence, prompt contains recognizable fragments
 * - one composed-path test per each of the 5 Class values
 */
import { describe, it, expect } from 'vitest';
import { suggestRecordingPrompt } from '@/pages/Voices/components/metadata/recordingPromptSuggester';
import type { VoiceAttributes } from '@/types';

describe('suggestRecordingPrompt', () => {
    describe('guard (INV-4)', () => {
        it('returns null for undefined attrs', () => {
            expect(suggestRecordingPrompt(undefined)).toBeNull();
        });

        it('returns null for null attrs', () => {
            expect(suggestRecordingPrompt(null)).toBeNull();
        });

        it('returns null for an attrs object with no meaningful fields', () => {
            const empty: VoiceAttributes = {};
            expect(suggestRecordingPrompt(empty)).toBeNull();
        });

        it('returns null when every field present is an empty array/string', () => {
            const emptyish: VoiceAttributes = { tone: [], timbre: [], style: [], accent: '' };
            expect(suggestRecordingPrompt(emptyish)).toBeNull();
        });
    });

    describe('confidence: exact', () => {
        it('matches "Warm Storyteller" verbatim when attrs mirror it closely', () => {
            const attrs: VoiceAttributes = {
                class: 'human',
                gender: 'feminine',
                age: 'adult',
                tone: ['warm', 'friendly', 'gentle'],
                timbre: ['rich', 'velvety', 'smooth'],
                pace: 'measured',
            };
            const result = suggestRecordingPrompt(attrs);
            expect(result).not.toBeNull();
            expect(result!.confidence).toBe('exact');
            expect(result!.matchedArchetype).toBe('Warm Storyteller');
            expect(result!.prompt).toContain('Come closer, and let me tell you how it really happened');
            expect(result!.directionNote).toContain('Let warmth bloom on the open vowels');
            expect(result!.sampleText).toContain('Come sit by the fire a while');
        });
    });

    describe('confidence: close', () => {
        it('matches "Heroic Protagonist" with a partial tag overlap', () => {
            const attrs: VoiceAttributes = {
                class: 'human',
                gender: 'masculine',
                age: 'young-adult',
                tone: ['heroic', 'confident'],
            };
            const result = suggestRecordingPrompt(attrs);
            expect(result).not.toBeNull();
            expect(result!.confidence).toBe('close');
            expect(result!.matchedArchetype).toBe('Heroic Protagonist');
            expect(result!.prompt).toContain("We didn't come this far to fail now");
            expect(result!.sampleText).toContain('This is the line we hold');
        });
    });

    describe('confidence: composed', () => {
        it('falls back to composition for an unusual tag combo unlikely to match any archetype closely', () => {
            const attrs: VoiceAttributes = {
                class: 'human',
                tone: ['playful'],
                timbre: ['thin'],
            };
            const result = suggestRecordingPrompt(attrs);
            expect(result).not.toBeNull();
            expect(result!.confidence).toBe('composed');
            expect(result!.matchedArchetype).toBeNull();
            // The composed prompt is now a real read-aloud passage (cueComposer.ts);
            // the tone/timbre performer fragments live in the direction note instead.
            expect(result!.directionNote).toContain('Let mischief bubble under the surface');
            expect(result!.directionNote).toContain('eep the tone narrow and light');
            expect(result!.prompt).not.toContain('undefined');
            expect(result!.prompt.length).toBeGreaterThan(100);
            // The composed path now also supplies a theme-matched TTS showcase line.
            expect(result!.sampleText).not.toBeNull();
            expect(result!.sampleText!.length).toBeGreaterThan(0);
        });

        it('skips class/pace pieces gracefully when absent, without emitting "undefined"', () => {
            const attrs: VoiceAttributes = { tone: ['calm'] };
            const result = suggestRecordingPrompt(attrs);
            expect(result).not.toBeNull();
            expect(result!.confidence).toBe('composed');
            expect(result!.prompt).not.toContain('undefined');
            expect(result!.prompt).not.toMatch(/^\s|\s{2,}/);
        });

        // One composed-path test per Class value — confirms every CLASS_FRAMES
        // opener (cueComposer.ts) is reachable and produces non-empty output.
        it.each([
            ['human', 'I come up the path'],
            ['synthetic', 'My systems come online'],
            ['creature', 'I drag my claws'],
            ['character', 'I sweep into'],
            ['deity', 'Before the first stone was laid'],
        ] as const)('composes a non-empty prompt with the %s opening line', (cls, expectedOpening) => {
            const attrs: VoiceAttributes = { class: cls, tone: ['playful'], timbre: ['thin'] };
            const result = suggestRecordingPrompt(attrs);
            expect(result).not.toBeNull();
            expect(result!.confidence).toBe('composed');
            expect(result!.prompt.length).toBeGreaterThan(0);
            expect(result!.prompt).toContain(expectedOpening);
            expect(result!.directionNote.length).toBeGreaterThan(0);
        });
    });

    it('is deterministic (same input -> same output)', () => {
        const attrs: VoiceAttributes = { class: 'creature', tone: ['menacing'], timbre: ['gravelly'] };
        expect(suggestRecordingPrompt(attrs)).toEqual(suggestRecordingPrompt(attrs));
    });
});
