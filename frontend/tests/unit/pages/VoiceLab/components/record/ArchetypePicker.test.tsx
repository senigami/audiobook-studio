/**
 * ArchetypePicker.test.tsx — task 007 (voice-card-consolidation, P7)
 *
 * Verifies the picker exposes only the 6 matcher-relevant fields and that
 * selecting values updates the live cue card via onChange, plus that Skip
 * fires onSkip.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { ArchetypePicker, type ArchetypeAttrs } from '@/pages/VoiceLab/components/record/ArchetypePicker';
import { RecordingCueCard } from '@/pages/VoiceLab/components/record/RecordingCueCard';

function PickerWithCueCard() {
    const [attrs, setAttrs] = useState<ArchetypeAttrs>({});
    return (
        <>
            <ArchetypePicker value={attrs} onChange={setAttrs} onSkip={() => {}} />
            <RecordingCueCard attrs={attrs} />
        </>
    );
}

describe('ArchetypePicker', () => {
    it('exposes exactly the 6 matcher-relevant fields (class/gender/age/tone/timbre/pace)', () => {
        render(<ArchetypePicker value={{}} onChange={() => {}} onSkip={() => {}} />);

        expect(screen.getByText('CLASS')).toBeInTheDocument();
        expect(screen.getByText('GENDER')).toBeInTheDocument();
        expect(screen.getByText('AGE')).toBeInTheDocument();
        expect(screen.getByText('TONE')).toBeInTheDocument();
        expect(screen.getByText('TIMBRE')).toBeInTheDocument();
        expect(screen.getByText('PACE')).toBeInTheDocument();

        // The other 5 taxonomy sections must NOT appear in the reduced picker.
        expect(screen.queryByText('ACCENT')).not.toBeInTheDocument();
        expect(screen.queryByText('LANGUAGE')).not.toBeInTheDocument();
        expect(screen.queryByText('STYLE')).not.toBeInTheDocument();
        expect(screen.queryByText('USE CASE')).not.toBeInTheDocument();
        expect(screen.queryByText('QUALITY / TECHNICAL')).not.toBeInTheDocument();
    });

    it('calls onSkip when the Skip button is clicked', () => {
        const onSkip = vi.fn();
        render(<ArchetypePicker value={{}} onChange={() => {}} onSkip={onSkip} />);

        fireEvent.click(screen.getByText(/Skip/i));

        expect(onSkip).toHaveBeenCalledTimes(1);
    });

    it('picking an archetype from the quick-pick fills all 6 fields at once and updates the connected cue card (owner-requested, 2026-07-16)', async () => {
        render(<PickerWithCueCard />);

        fireEvent.click(screen.getByRole('button', { name: /Pick a voice archetype/i }));
        fireEvent.click(screen.getByText('Warm Storyteller'));

        expect(await screen.findByRole('button', { name: 'Human', pressed: true })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Feminine', pressed: true })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Adult', pressed: true })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Measured', pressed: true })).toBeInTheDocument();

        // The cue card should now show Warm Storyteller's own curated prompt,
        // not a generic/composed one.
        const prompt = document.querySelector('.recording-cue-card__prompt')?.textContent;
        expect(prompt).toContain('Come closer');
    });

    it('selecting a class updates the connected cue card away from the generic skip prompt', () => {
        render(<PickerWithCueCard />);

        // Before any selection, the cue card shows the generic skip prompt.
        const beforePrompt = document.querySelector('.recording-cue-card__prompt')?.textContent;
        expect(beforePrompt).toBeTruthy();

        fireEvent.click(screen.getByText('Human'));

        const afterPrompt = document.querySelector('.recording-cue-card__prompt')?.textContent;
        expect(afterPrompt).toBeTruthy();
        expect(afterPrompt).not.toBe(beforePrompt);
    });
});
