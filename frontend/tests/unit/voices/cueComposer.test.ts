import { describe, it, expect } from 'vitest';
import { composeCuePassage } from '@/pages/Voices/components/metadata/cueComposer';
import { suggestRecordingPrompt } from '@/pages/Voices/components/metadata/recordingPromptSuggester';
import type { VoiceAttributes } from '@/types';

const creatureAttrs: VoiceAttributes = {
    class: 'creature',
    tone: ['menacing'],
    timbre: ['gravelly'],
    pace: 'slow',
};

const humanAttrs: VoiceAttributes = {
    class: 'human',
    tone: ['cheerful'],
    timbre: ['bright'],
    pace: 'fast',
};

describe('composeCuePassage', () => {
    it('is deterministic — same attrs produce identical output', () => {
        const a = composeCuePassage(creatureAttrs);
        const b = composeCuePassage({ ...creatureAttrs, tone: ['menacing'], timbre: ['gravelly'] });
        expect(a).toEqual(b);
    });

    it('produces a multi-sentence read-aloud passage even for near-empty attrs', () => {
        const result = composeCuePassage({ accent: 'british' });
        const sentenceCount = result.passage.split(/[.!?]/).filter(s => s.trim()).length;
        expect(sentenceCount).toBeGreaterThanOrEqual(3);
        expect(result.sampleText.length).toBeGreaterThan(10);
        expect(result.directionNote.length).toBeGreaterThan(0);
    });

    it('class changes the framing of the passage', () => {
        const creature = composeCuePassage({ class: 'creature', tone: ['menacing'] });
        const synthetic = composeCuePassage({ class: 'synthetic', tone: ['menacing'] });
        const deity = composeCuePassage({ class: 'deity', tone: ['menacing'] });
        expect(creature.passage).toContain('claws');
        expect(synthetic.passage.toLowerCase()).toMatch(/system|signal/);
        expect(deity.passage.toLowerCase()).toMatch(/stone|watching/);
        expect(creature.passage).not.toEqual(synthetic.passage);
        expect(creature.passage).not.toEqual(deity.passage);
    });

    it('tone selections swap the theme family', () => {
        const shadow = composeCuePassage({ class: 'human', tone: ['menacing'] });
        const delight = composeCuePassage({ class: 'human', tone: ['cheerful'] });
        expect(shadow.passage).not.toEqual(delight.passage);
        expect(shadow.passage.toLowerCase()).toContain('smoke');
        expect(delight.passage.toLowerCase()).toMatch(/sparkling|bounce/);
        expect(delight.sampleText).not.toEqual(shadow.sampleText);
    });

    it('majority tone family wins when tones span families', () => {
        // two comfort tones vs one shadow tone -> comfort wins
        const mostlyComfort = composeCuePassage({ tone: ['warm', 'gentle', 'menacing'] });
        const pureComfort = composeCuePassage({ tone: ['warm'] });
        expect(mostlyComfort.passage).toEqual(pureComfort.passage);
    });

    it('timbre words appear in the passage', () => {
        const gravelly = composeCuePassage({ class: 'creature', tone: ['menacing'], timbre: ['gravelly'] });
        expect(gravelly.passage.toLowerCase()).toMatch(/grinding|gravel/);
        const silky = composeCuePassage({ class: 'creature', tone: ['menacing'], timbre: ['silky'] });
        expect(silky.passage.toLowerCase()).toMatch(/unbroken|gliding/);
        expect(gravelly.passage).not.toEqual(silky.passage);
    });

    it('pace changes sentence structure', () => {
        const base: VoiceAttributes = { class: 'human', tone: ['warm'], timbre: ['smooth'] };
        const slow = composeCuePassage({ ...base, pace: 'slow' });
        const fast = composeCuePassage({ ...base, pace: 'fast' });
        const slowSentences = slow.passage.split(/[.!?]/).filter(s => s.trim());
        const fastSentences = fast.passage.split(/[.!?]/).filter(s => s.trim());
        expect(fastSentences.length).toBeGreaterThan(slowSentences.length);
        const avg = (arr: string[]) => arr.reduce((n, s) => n + s.length, 0) / arr.length;
        expect(avg(fastSentences)).toBeLessThan(avg(slowSentences));
    });

    it('age lightly tints the passage', () => {
        const child = composeCuePassage({ class: 'human', tone: ['cheerful'], age: 'child' });
        const adult = composeCuePassage({ class: 'human', tone: ['cheerful'], age: 'adult' });
        expect(child.passage).not.toEqual(adult.passage);
    });

    it('gender has no effect on the composed text', () => {
        const fem = composeCuePassage({ class: 'human', tone: ['warm'], gender: 'feminine' });
        const masc = composeCuePassage({ class: 'human', tone: ['warm'], gender: 'masculine' });
        expect(fem).toEqual(masc);
    });
});

describe('suggestRecordingPrompt composed path', () => {
    it('returns null for empty attrs', () => {
        expect(suggestRecordingPrompt(undefined)).toBeNull();
        expect(suggestRecordingPrompt({})).toBeNull();
        expect(suggestRecordingPrompt({ tone: [], timbre: [] })).toBeNull();
    });

    it('populates sampleText and a rich passage on the composed path', () => {
        // accent alone can't match any archetype (needs >= CLOSE_THRESHOLD)
        const result = suggestRecordingPrompt({ accent: 'british', tone: ['deadpan'], timbre: ['nasal'] });
        expect(result).not.toBeNull();
        expect(result!.confidence).toBe('composed');
        expect(result!.matchedArchetype).toBeNull();
        expect(result!.sampleText).toBeTruthy();
        expect(result!.prompt.split(/[.!?]/).filter(s => s.trim()).length).toBeGreaterThanOrEqual(3);
        expect(result!.directionNote.length).toBeGreaterThan(0);
    });
});
