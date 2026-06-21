// WIRE-3 tests: MoveVariantModal uses SearchableSelect instead of a plain <select>.
// R2: mock only framer-motion (animation boundary outside the unit under test).

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MoveVariantModal } from '@/pages/Voices/components/VoiceModals';

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('MoveVariantModal — SearchableSelect (WIRE-3)', () => {
    const speakers = [
        { id: 'spk-1', name: 'Alice' },
        { id: 'spk-2', name: 'Bob' },
        { id: 'spk-3', name: 'Charlie' },
    ];

    it('renders a SearchableSelect (button trigger) instead of a plain combobox', () => {
        render(
            <MoveVariantModal
                isOpen={true}
                onClose={vi.fn()}
                variantName="Variant X"
                speakers={speakers}
                selectedSpeakerId=""
                onSelectSpeaker={vi.fn()}
                onSubmit={vi.fn()}
                isMoving={false}
            />
        );

        // SearchableSelect renders a button trigger, not a native <select>
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        // The trigger button shows the placeholder text
        expect(screen.getByRole('button', { name: /Select a speaker/i })).toBeInTheDocument();
    });

    it('opens the dropdown and shows speaker options when trigger is clicked', () => {
        render(
            <MoveVariantModal
                isOpen={true}
                onClose={vi.fn()}
                variantName="Variant X"
                speakers={speakers}
                selectedSpeakerId=""
                onSelectSpeaker={vi.fn()}
                onSubmit={vi.fn()}
                isMoving={false}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Select a speaker/i }));

        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByText('Charlie')).toBeInTheDocument();
    });

    it('calls onSelectSpeaker with the speaker id when an option is selected', () => {
        const onSelectSpeaker = vi.fn();
        render(
            <MoveVariantModal
                isOpen={true}
                onClose={vi.fn()}
                variantName="Variant X"
                speakers={speakers}
                selectedSpeakerId=""
                onSelectSpeaker={onSelectSpeaker}
                onSubmit={vi.fn()}
                isMoving={false}
            />
        );

        // Open dropdown
        fireEvent.click(screen.getByRole('button', { name: /Select a speaker/i }));
        // Select "Bob"
        fireEvent.click(screen.getByRole('button', { name: 'Bob' }));

        expect(onSelectSpeaker).toHaveBeenCalledWith('spk-2');
    });

    it('supports keyboard-searchable filtering', () => {
        render(
            <MoveVariantModal
                isOpen={true}
                onClose={vi.fn()}
                variantName="Variant X"
                speakers={speakers}
                selectedSpeakerId=""
                onSelectSpeaker={vi.fn()}
                onSubmit={vi.fn()}
                isMoving={false}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /Select a speaker/i }));

        const searchInput = screen.getByPlaceholderText('Search speakers...');
        fireEvent.change(searchInput, { target: { value: 'ali' } });

        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    });
});
