/**
 * OverviewTab.test.tsx
 *
 * The icon upload section (and its DC-013 "copy icon prompt" regression
 * test) moved off this tab and onto the avatar in VoiceDetailHeader.tsx by
 * task 003 (voice-variants round 2, icon-upload consolidation) -- see
 * VoiceDetailHeader.test.tsx for that coverage now.
 *
 * This file covers task 006 (voice-variants round 2): class/gender/age are
 * rendered as SearchableSelect comboboxes (not OneSelect chip rows), and
 * the required-field save-blocking behavior for those three attributes
 * still holds.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OverviewTab } from '@/pages/VoiceLab/components/OverviewTab';
import type { VoiceMetadata } from '@/types';

vi.mock('@/api', () => ({
    api: {
        patchVoiceMetadata: vi.fn(),
    },
}));

const mockVoice: VoiceMetadata = {
    id: 'voice-abc',
    name: 'Aria Nova',
    description: 'A calm narrator.',
    attributes: { class: 'human', gender: 'feminine', age: 'adult' },
    tags: [],
    is_untagged: false,
};

describe('OverviewTab', () => {
    it('renders class/gender/age as searchable-select comboboxes showing the current value', () => {
        render(<OverviewTab voice={mockVoice} onSaved={vi.fn()} />);

        // SearchableSelect renders a trigger <button> whose accessible name is
        // the selected option's label (taxonomy "label", not raw id).
        expect(screen.getByRole('button', { name: 'Human' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Feminine' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Adult' })).toBeInTheDocument();
    });

    it('picking an archetype from the quick-pick overwrites class/gender/age even when different values were already set (owner-requested, 2026-07-16)', () => {
        const differentlyTagged: VoiceMetadata = {
            ...mockVoice,
            attributes: { class: 'creature', gender: 'ambiguous', age: 'ageless' },
        };
        render(<OverviewTab voice={differentlyTagged} onSaved={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Pick a voice archetype/i }));
        fireEvent.click(screen.getByText('Warm Storyteller'));

        // Warm Storyteller is class=human/gender=feminine/age=adult -- the
        // comboboxes must now show that, not the original creature/ambiguous/
        // ageless values (a real overwrite, not a no-op or a merge-only-blanks).
        expect(screen.getByRole('button', { name: 'Human' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Feminine' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Adult' })).toBeInTheDocument();
    });

    it('does not offer a "Create New" action on the closed-vocabulary comboboxes', () => {
        render(<OverviewTab voice={mockVoice} onSaved={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Human' }));
        expect(screen.queryByRole('button', { name: /Create New/i })).not.toBeInTheDocument();
    });

    it('blocks Save while a required attribute (class/gender/age) is missing', () => {
        const incompleteVoice: VoiceMetadata = {
            ...mockVoice,
            attributes: { gender: 'feminine', age: 'adult' },
        };
        render(<OverviewTab voice={incompleteVoice} onSaved={vi.fn()} />);

        expect(screen.getByRole('button', { name: /Saving|Save/ })).toBeDisabled();
        expect(screen.getByText('Class, Gender, and Age are required to save.')).toBeInTheDocument();
    });

    it('unblocks Save once a required combobox value is picked', () => {
        const incompleteVoice: VoiceMetadata = {
            ...mockVoice,
            attributes: { gender: 'feminine', age: 'adult' },
        };
        render(<OverviewTab voice={incompleteVoice} onSaved={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Select Class/i }));
        fireEvent.click(screen.getByRole('button', { name: 'Human' }));

        expect(screen.getByRole('button', { name: /Saving|Save/ })).not.toBeDisabled();
    });

    // F3.1 (design-critique/voices-variants-round2): the CLASS/GENDER/AGE
    // combobox headers must be tinted to match their pill hue, same as the
    // summary pills at the top of the page (VoiceDetailHeader), so the
    // section header visually maps to its category.
    it('tints the CLASS/GENDER/AGE combobox headers to match their pill hues', () => {
        render(<OverviewTab voice={mockVoice} onSaved={vi.fn()} />);
        expect(screen.getByText('CLASS')).toHaveStyle({ color: 'var(--pill-class-text)' });
        expect(screen.getByText('GENDER')).toHaveStyle({ color: 'var(--pill-gender-text)' });
        expect(screen.getByText('AGE')).toHaveStyle({ color: 'var(--pill-age-text)' });
    });
});
