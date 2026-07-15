/**
 * TagAutocompleteInput.test.tsx — task 006
 * Tests: Enter/comma commit + normalization, filtered suggestion dropdown,
 * click-to-commit a suggestion, backspace-removes-last, no duplicates
 * (typed or clicked), remove "×" on a pill, keyboard-only suggestion commit.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TagAutocompleteInput } from '@/pages/Voices/components/metadata/TagAutocompleteInput';

function setup(tags: string[], suggestions: string[]) {
    const onChange = vi.fn();
    render(<TagAutocompleteInput tags={tags} onChange={onChange} suggestions={suggestions} />);
    const input = screen.getByLabelText('Add tag') as HTMLInputElement;
    return { onChange, input };
}

describe('TagAutocompleteInput', () => {
    it('commits a normalized pill on Enter', () => {
        const { onChange, input } = setup([], []);
        fireEvent.change(input, { target: { value: '  Grumpy Wizard  ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith(['grumpy-wizard']);
    });

    it('commits a normalized pill on comma', () => {
        const { onChange, input } = setup([], []);
        fireEvent.change(input, { target: { value: 'Cowboy' } });
        fireEvent.keyDown(input, { key: ',' });
        expect(onChange).toHaveBeenCalledWith(['cowboy']);
    });

    it('shows a filtered suggestion dropdown and commits on click', () => {
        const { onChange, input } = setup([], ['wizard', 'warrior', 'grandmother']);
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'wa' } });

        expect(screen.getByRole('listbox', { name: 'Tag suggestions' })).toBeInTheDocument();
        expect(screen.getByText('warrior')).toBeInTheDocument();
        expect(screen.queryByText('grandmother')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('warrior'));
        expect(onChange).toHaveBeenCalledWith(['warrior']);
    });

    it('removes the last committed tag on backspace when draft is empty', () => {
        const { onChange, input } = setup(['cowboy', 'wizard'], []);
        fireEvent.keyDown(input, { key: 'Backspace' });
        expect(onChange).toHaveBeenCalledWith(['cowboy']);
    });

    it('does not re-add a tag already present, whether typed or clicked', () => {
        const { onChange, input } = setup(['wizard'], ['wizard', 'warrior']);
        // Typed duplicate
        fireEvent.change(input, { target: { value: 'wizard' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).not.toHaveBeenCalled();

        // Clicked duplicate: only "warrior" should be offered, "wizard" filtered
        // out of the suggestion dropdown (it still renders as a committed pill).
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'wi' } });
        expect(screen.queryByRole('listbox', { name: 'Tag suggestions' })).not.toBeInTheDocument();
    });

    it('removes exactly the tag whose × was clicked', () => {
        const onChange = vi.fn();
        render(
            <TagAutocompleteInput tags={['cowboy', 'wizard']} onChange={onChange} suggestions={[]} />
        );
        fireEvent.click(screen.getByLabelText('Remove wizard'));
        expect(onChange).toHaveBeenCalledWith(['cowboy']);
    });

    it('supports keyboard-only commit of a suggestion (arrow-down + Enter)', () => {
        const { onChange, input } = setup([], ['wizard', 'warrior']);
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'w' } });

        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(onChange).toHaveBeenCalledWith(['wizard']);
    });

    it('Escape closes the dropdown without committing', () => {
        const { onChange, input } = setup([], ['wizard']);
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: 'w' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(screen.queryByRole('listbox', { name: 'Tag suggestions' })).not.toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });
});
