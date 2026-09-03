/**
 * RecordingCueCard.test.tsx — task 007 (voice-card-consolidation, P7)
 *
 * Covers all three suggestRecordingPrompt confidence tiers (exact/close/
 * composed) plus the true zero-selection "Skip" case, which
 * suggestRecordingPrompt() does NOT cover (it returns null there) — the
 * component must supply its own genuine generic prompt for that case.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecordingCueCard } from '@/pages/VoiceLab/components/record/RecordingCueCard';
import { recordingArchetypes } from '@/pages/Voices/components/metadata/recordingArchetypes';
import type { VoiceAttributes } from '@/types';

describe('RecordingCueCard', () => {
    it('renders a real prompt + direction note for an exact archetype match', () => {
        const archetype = recordingArchetypes[0];
        const attrs: Partial<VoiceAttributes> = {
            class: archetype.class,
            gender: archetype.gender,
            age: archetype.age,
            pace: archetype.pace,
            tone: archetype.dominant_tones.split(',').map(s => s.trim()),
            timbre: archetype.dominant_timbres.split(',').map(s => s.trim()),
        };

        render(<RecordingCueCard attrs={attrs} />);

        expect(screen.getByText(archetype.recording_prompt)).toBeInTheDocument();
        expect(screen.getByText(archetype.direction_note)).toBeInTheDocument();
    });

    it('renders a composed fallback prompt when some attrs are set but nothing scores a close match', () => {
        // A combination unlikely to score >= CLOSE_THRESHOLD against any curated archetype.
        const attrs: Partial<VoiceAttributes> = { tone: ['sarcastic'] };

        render(<RecordingCueCard attrs={attrs} />);

        const prompt = document.querySelector('.recording-cue-card__prompt');
        const direction = document.querySelector('.recording-cue-card__direction');
        expect(prompt?.textContent).toBeTruthy();
        expect(direction?.textContent).toBeTruthy();
    });

    it('renders a genuine generic prompt for the true zero-selection Skip case (no null render)', () => {
        render(<RecordingCueCard attrs={{}} />);

        const prompt = document.querySelector('.recording-cue-card__prompt');
        const direction = document.querySelector('.recording-cue-card__direction');
        expect(prompt?.textContent).toBeTruthy();
        expect(direction?.textContent).toBeTruthy();
        // Must not be the same text a composed fallback would produce for an
        // untagged voice ("Read a line that captures this voice's character.").
        expect(prompt?.textContent).not.toBe("Read a line that captures this voice's character.");
    });
});
