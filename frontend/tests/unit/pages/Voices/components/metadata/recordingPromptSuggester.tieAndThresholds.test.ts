/**
 * recordingPromptSuggester.tieAndThresholds.test.ts
 *
 * Companion to recordingPromptSuggester.test.ts, covering two behaviors that
 * were flagged as untested in an adversarial review of the "Suggest from
 * voice qualities" feature (design-docs/plans/active/dynamic_recording_guide/):
 *
 * (a) Tie-break: when two archetypes score identically, `suggestRecordingPrompt`
 *     must deterministically pick the first one in array order (the scoring
 *     loop in recordingPromptSuggester.ts uses a strict `score > bestScore`
 *     comparison, so a later archetype never displaces an earlier tie).
 * (b) Threshold boundaries: a score landing exactly at `CLOSE_THRESHOLD` (6)
 *     or exactly at `EXACT_THRESHOLD` (10) is handled by the actual `>=`
 *     comparisons in the source (`bestScore >= CLOSE_THRESHOLD` to use a
 *     curated archetype at all; `bestScore >= EXACT_THRESHOLD ? 'exact' : 'close'`
 *     for the confidence tier) — both are inclusive of the boundary value.
 *
 * The real 39-archetype catalog in recordingArchetypes.ts doesn't offer a
 * guaranteed, stable-forever tie or an exact round-number score for arbitrary
 * attrs, so this file mocks that module with a small, fully-controlled
 * fixture to pin the boundary behavior precisely (recordingArchetypes.ts
 * itself is out of scope for this pass — only mocked here, never edited).
 */
import { describe, it, expect, vi } from 'vitest';
import type { VoiceAttributes } from '@/types';
import type { RecordingArchetype } from '@/pages/Voices/components/metadata/recordingArchetypes';

// --- Fixture: two archetypes engineered to tie at MAX_SCORE (12) ----------
// class(3) + age(1) + tone-full-match(3) + timbre-full-match(3) + pace(1) = 11
// ...and adding gender(1) brings it to the full 12. Using only full/empty
// jaccard overlaps (never partial) keeps every contribution an exact integer
// in floating point, so the totals below are exact — no rounding risk.
const TIE_ARCHETYPE_A: RecordingArchetype = {
    archetype_name: 'Tie A (first in array)',
    class: 'human',
    gender: 'feminine',
    age: 'adult',
    dominant_tones: 'warm, friendly',
    dominant_timbres: 'rich, velvety',
    pace: 'measured',
    appearance_creature_type: '',
    appearance_description: '',
    recording_prompt: 'PROMPT FROM TIE A',
    direction_note: 'NOTE FROM TIE A',
};
const TIE_ARCHETYPE_B: RecordingArchetype = {
    ...TIE_ARCHETYPE_A,
    archetype_name: 'Tie B (second in array)',
    recording_prompt: 'PROMPT FROM TIE B',
    direction_note: 'NOTE FROM TIE B',
};
const TIE_ATTRS: VoiceAttributes = {
    class: 'human',
    gender: 'feminine',
    age: 'adult',
    tone: ['warm', 'friendly'],
    timbre: ['rich', 'velvety'],
    pace: 'measured',
};

// --- Fixture: a single archetype whose score for EXACT_ATTRS lands exactly
// on EXACT_THRESHOLD (10): class(3) + age(1) + tone-full(3) + timbre-full(3)
// = 10, with gender and pace deliberately mismatched (0 + 0) so nothing pushes
// the score past 10.
const EXACT_BOUNDARY_ARCHETYPE: RecordingArchetype = {
    archetype_name: 'Exact Boundary Archetype',
    class: 'human',
    gender: 'masculine',
    age: 'adult',
    dominant_tones: 'stoic, gravelly',
    dominant_timbres: 'deep, resonant',
    pace: 'brisk',
    appearance_creature_type: '',
    appearance_description: '',
    recording_prompt: 'PROMPT FROM EXACT BOUNDARY',
    direction_note: 'NOTE FROM EXACT BOUNDARY',
};
const EXACT_BOUNDARY_ATTRS: VoiceAttributes = {
    class: 'human',
    gender: 'feminine', // mismatch -> +0
    age: 'adult', // match -> +1
    tone: ['stoic', 'gravelly'], // full jaccard -> +3
    timbre: ['deep', 'resonant'], // full jaccard -> +3
    pace: 'measured', // mismatch -> +0
    // class match -> +3 ; total = 3 + 0 + 1 + 3 + 3 + 0 = 10
};

// --- Fixture: a single archetype whose score for CLOSE_ATTRS lands exactly
// on CLOSE_THRESHOLD (6): class(3) + gender(1) + age(1) + pace(1) = 6, with
// tone/timbre deliberately non-overlapping (0 + 0).
const CLOSE_BOUNDARY_ARCHETYPE: RecordingArchetype = {
    archetype_name: 'Close Boundary Archetype',
    class: 'human',
    gender: 'feminine',
    age: 'adult',
    dominant_tones: 'warm, friendly',
    dominant_timbres: 'rich, velvety',
    pace: 'measured',
    appearance_creature_type: '',
    appearance_description: '',
    recording_prompt: 'PROMPT FROM CLOSE BOUNDARY',
    direction_note: 'NOTE FROM CLOSE BOUNDARY',
};
const CLOSE_BOUNDARY_ATTRS: VoiceAttributes = {
    class: 'human', // match -> +3
    gender: 'feminine', // match -> +1
    age: 'adult', // match -> +1
    tone: ['icy', 'clipped'], // no overlap with 'warm, friendly' -> +0
    timbre: ['thin', 'nasal'], // no overlap with 'rich, velvety' -> +0
    pace: 'measured', // match -> +1
    // total = 3 + 1 + 1 + 0 + 0 + 1 = 6
};

describe('suggestRecordingPrompt — tie-break and threshold boundaries', () => {
    describe('tie-break (equal scores -> first-in-array wins, per strict `score > bestScore`)', () => {
        it('deterministically returns the first archetype in array order when two archetypes score identically', async () => {
            vi.resetModules();
            vi.doMock('@/pages/Voices/components/metadata/recordingArchetypes', () => ({
                recordingArchetypes: [TIE_ARCHETYPE_A, TIE_ARCHETYPE_B],
            }));
            const { suggestRecordingPrompt } = await import('@/pages/Voices/components/metadata/recordingPromptSuggester');

            const result = suggestRecordingPrompt(TIE_ATTRS);

            expect(result).not.toBeNull();
            expect(result!.matchedArchetype).toBe('Tie A (first in array)');
            expect(result!.prompt).toBe('PROMPT FROM TIE A');

            vi.doUnmock('@/pages/Voices/components/metadata/recordingArchetypes');
            vi.resetModules();
        });

        it('still picks the first archetype when the tied pair is reordered (confirms it is array-order, not archetype identity)', async () => {
            vi.resetModules();
            vi.doMock('@/pages/Voices/components/metadata/recordingArchetypes', () => ({
                recordingArchetypes: [TIE_ARCHETYPE_B, TIE_ARCHETYPE_A],
            }));
            const { suggestRecordingPrompt } = await import('@/pages/Voices/components/metadata/recordingPromptSuggester');

            const result = suggestRecordingPrompt(TIE_ATTRS);

            expect(result).not.toBeNull();
            expect(result!.matchedArchetype).toBe('Tie B (second in array)');

            vi.doUnmock('@/pages/Voices/components/metadata/recordingArchetypes');
            vi.resetModules();
        });
    });

    describe('threshold boundaries (as actually coded: both comparisons are `>=`, inclusive of the boundary)', () => {
        it('treats a score of exactly EXACT_THRESHOLD (10) as "exact" confidence, reusing the curated prompt verbatim', async () => {
            vi.resetModules();
            vi.doMock('@/pages/Voices/components/metadata/recordingArchetypes', () => ({
                recordingArchetypes: [EXACT_BOUNDARY_ARCHETYPE],
            }));
            const { suggestRecordingPrompt, EXACT_THRESHOLD } = await import('@/pages/Voices/components/metadata/recordingPromptSuggester');
            expect(EXACT_THRESHOLD).toBe(10);

            const result = suggestRecordingPrompt(EXACT_BOUNDARY_ATTRS);

            expect(result).not.toBeNull();
            expect(result!.matchedArchetype).toBe('Exact Boundary Archetype');
            expect(result!.confidence).toBe('exact');
            expect(result!.prompt).toBe('PROMPT FROM EXACT BOUNDARY');

            vi.doUnmock('@/pages/Voices/components/metadata/recordingArchetypes');
            vi.resetModules();
        });

        it('treats a score of exactly CLOSE_THRESHOLD (6) as a "close" match, not a fallback to composition', async () => {
            vi.resetModules();
            vi.doMock('@/pages/Voices/components/metadata/recordingArchetypes', () => ({
                recordingArchetypes: [CLOSE_BOUNDARY_ARCHETYPE],
            }));
            const { suggestRecordingPrompt, CLOSE_THRESHOLD } = await import('@/pages/Voices/components/metadata/recordingPromptSuggester');
            expect(CLOSE_THRESHOLD).toBe(6);

            const result = suggestRecordingPrompt(CLOSE_BOUNDARY_ATTRS);

            expect(result).not.toBeNull();
            expect(result!.matchedArchetype).toBe('Close Boundary Archetype');
            expect(result!.confidence).toBe('close');
            expect(result!.prompt).toBe('PROMPT FROM CLOSE BOUNDARY');

            vi.doUnmock('@/pages/Voices/components/metadata/recordingArchetypes');
            vi.resetModules();
        });

        it('falls back to composition just below CLOSE_THRESHOLD (score 5), confirming 6 really is the inclusive cutoff', async () => {
            vi.resetModules();
            vi.doMock('@/pages/Voices/components/metadata/recordingArchetypes', () => ({
                // Same archetype as the CLOSE_THRESHOLD case, but drop the pace match
                // (class 3 + gender 1 + age 1 = 5, one point short of 6).
                recordingArchetypes: [CLOSE_BOUNDARY_ARCHETYPE],
            }));
            const { suggestRecordingPrompt } = await import('@/pages/Voices/components/metadata/recordingPromptSuggester');

            const belowThresholdAttrs: VoiceAttributes = {
                ...CLOSE_BOUNDARY_ATTRS,
                pace: 'brisk', // mismatch -> score drops from 6 to 5
            };
            const result = suggestRecordingPrompt(belowThresholdAttrs);

            expect(result).not.toBeNull();
            expect(result!.confidence).toBe('composed');
            expect(result!.matchedArchetype).toBeNull();

            vi.doUnmock('@/pages/Voices/components/metadata/recordingArchetypes');
            vi.resetModules();
        });
    });
});
