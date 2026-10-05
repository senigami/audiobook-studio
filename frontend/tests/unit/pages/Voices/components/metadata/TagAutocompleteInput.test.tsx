/**
 * TagAutocompleteInput.test.tsx — task 006, redesigned 2026-07-16 to the
 * plus-trigger + search-popover pattern (owner-requested): the "+" button
 * opens a popover with the full suggestion list already visible; picking a
 * suggestion or typing free text both commit through commitValue() and
 * close the popover, leaving only the label + pills + "+" behind.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TagAutocompleteInput } from '@/pages/Voices/components/metadata/TagAutocompleteInput';

function setup(tags: string[], suggestions: string[]) {
    const onChange = vi.fn();
    render(<TagAutocompleteInput tags={tags} onChange={onChange} suggestions={suggestions} />);
    fireEvent.click(screen.getByLabelText('Add tag'));
    const input = screen.getByLabelText('Search tag') as HTMLInputElement;
    return { onChange, input };
}

describe('TagAutocompleteInput', () => {
    it('starts closed, showing only the "+" trigger', () => {
        render(<TagAutocompleteInput tags={[]} onChange={vi.fn()} suggestions={[]} />);
        expect(screen.queryByLabelText('Search tag')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Add tag')).toBeInTheDocument();
    });

    it('opening the popover shows the full suggestion list immediately, no typing required', async () => {
        render(<TagAutocompleteInput tags={[]} onChange={vi.fn()} suggestions={['wizard', 'warrior']} />);
        fireEvent.click(screen.getByLabelText('Add tag'));
        expect(await screen.findByText('wizard')).toBeInTheDocument();
        expect(screen.getByText('warrior')).toBeInTheDocument();
    });

    it('commits a normalized pill on Enter and closes the popover', () => {
        const { onChange, input } = setup([], []);
        fireEvent.change(input, { target: { value: '  Grumpy Wizard  ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith(['grumpy-wizard']);
        expect(screen.queryByLabelText('Search tag')).not.toBeInTheDocument();
    });

    it('commits a normalized pill on comma', () => {
        const { onChange, input } = setup([], []);
        fireEvent.change(input, { target: { value: 'Cowboy' } });
        fireEvent.keyDown(input, { key: ',' });
        expect(onChange).toHaveBeenCalledWith(['cowboy']);
    });

    it('narrows suggestions as the user types and commits on click, closing the popover', async () => {
        const { onChange, input } = setup([], ['wizard', 'warrior', 'grandmother']);
        fireEvent.change(input, { target: { value: 'wa' } });

        expect(await screen.findByText('warrior')).toBeInTheDocument();
        expect(screen.queryByText('grandmother')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('warrior'));
        expect(onChange).toHaveBeenCalledWith(['warrior']);
        expect(screen.queryByLabelText('Search tag')).not.toBeInTheDocument();
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

        // Re-open: "wizard" is filtered out of suggestions (still rendered
        // as its own pill, so we scope the check to the suggestions list),
        // "warrior" still offered.
        fireEvent.click(screen.getByLabelText('Add tag'));
        const listbox = screen.getByRole('listbox', { name: 'Tag suggestions' });
        expect(within(listbox).queryByText('wizard')).not.toBeInTheDocument();
        expect(within(listbox).getByText('warrior')).toBeInTheDocument();
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
        fireEvent.change(input, { target: { value: 'w' } });

        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(onChange).toHaveBeenCalledWith(['wizard']);
    });

    it('Escape closes the popover without committing', () => {
        const { onChange, input } = setup([], ['wizard']);
        fireEvent.change(input, { target: { value: 'w' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(screen.queryByLabelText('Search tag')).not.toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('clicking the "+" again toggles the popover closed', async () => {
        render(<TagAutocompleteInput tags={[]} onChange={vi.fn()} suggestions={[]} />);
        const trigger = screen.getByLabelText('Add tag');
        fireEvent.click(trigger);
        expect(await screen.findByLabelText('Search tag')).toBeInTheDocument();
        fireEvent.click(trigger);
        expect(screen.queryByLabelText('Search tag')).not.toBeInTheDocument();
    });
});
