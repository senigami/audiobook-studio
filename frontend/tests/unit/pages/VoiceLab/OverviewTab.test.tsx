/**
 * OverviewTab.test.tsx
 *
 * Regression-prevention test for DC-013: the icon-only "copy icon prompt"
 * button must be mounted in the Overview tab's render tree. This feature
 * was built once (VoiceIconControls.tsx) then silently unmounted during a
 * tab-consolidation rework -- this test exists so a future rework can't
 * orphan it again without a failing test.
 *
 * Also covers task 006 (voice-variants round 2): class/gender/age are
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
    it('mounts the icon-only copy-icon-prompt button beside the icon upload control', () => {
        render(<OverviewTab voice={mockVoice} onSaved={vi.fn()} />);

        expect(
            screen.getByRole('button', { name: 'Copy icon generation prompt' })
        ).toBeInTheDocument();
    });

    it('renders class/gender/age as searchable-select comboboxes showing the current value', () => {
        render(<OverviewTab voice={mockVoice} onSaved={vi.fn()} />);

        // SearchableSelect renders a trigger <button> whose accessible name is
        // the selected option's label (taxonomy "label", not raw id).
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
});
