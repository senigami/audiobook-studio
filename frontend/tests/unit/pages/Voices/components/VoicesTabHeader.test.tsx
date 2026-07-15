/**
 * VoicesTabHeader.test.tsx — R5-T4, updated for task 005 (MultiSelect facet filters)
 * Tests: toolbar buttons (wide/compact), tab pills render, Discover tab shows placeholder
 * (no network call), CLASS/GENDER/AGE/TAGS render as MultiSelects with array-based
 * (OR-within-facet) onChange callbacks.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { VoicesTabHeader } from '@/pages/Voices/components/VoicesTabHeader';
import { DiscoverPlaceholder } from '@/pages/Voices/components/DiscoverPlaceholder';

describe('VoicesTabHeader', () => {
    const setViewportWidth = (width: number) => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            writable: true,
            value: width,
        });
        window.dispatchEvent(new Event('resize'));
    };

    const baseProps = {
        searchQuery: '',
        setSearchQuery: () => undefined,
        engineFilter: 'all' as const,
        setEngineFilter: () => undefined,
        engineFilterOptions: [
            { key: 'all' as const, label: 'All (2)' },
            { key: 'disabled' as const, label: 'Disabled (0)' },
        ],
        isImportingVoice: false,
        exportVoiceDisabled: false,
        importInputRef: React.createRef<HTMLInputElement>(),
        onImportClick: () => undefined,
        onExportClick: () => undefined,
        onCreateClick: () => undefined,
        onGuideClick: () => undefined,
    };

    beforeEach(() => {
        setViewportWidth(1200);
    });

    it('shows labeled toolbar buttons on wide screens', () => {
        render(<VoicesTabHeader {...baseProps} />);
        expect(screen.getByText('Export Voice')).toBeInTheDocument();
        expect(screen.getByText('Import Voice')).toBeInTheDocument();
        expect(screen.getByText('New Voice')).toBeInTheDocument();
        expect(screen.getByText('Recording Guide')).toBeInTheDocument();
    });

    it('collapses toolbar buttons to icons on compact screens', () => {
        setViewportWidth(800);

        render(<VoicesTabHeader {...baseProps} />);

        expect(screen.getByRole('button', { name: 'Export Voice' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Import Voice' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New Voice' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Recording Guide' })).toBeInTheDocument();

        expect(screen.queryByText('Export Voice')).not.toBeInTheDocument();
        expect(screen.queryByText('Import Voice')).not.toBeInTheDocument();
        expect(screen.queryByText('New Voice')).not.toBeInTheDocument();
        expect(screen.queryByText('Recording Guide')).not.toBeInTheDocument();
    });

    // ---------------------------------------------------------------------------
    // Tab pills — R5-T4
    // ---------------------------------------------------------------------------

    it('renders My Voices and Discover tab pills', () => {
        render(<VoicesTabHeader {...baseProps} />);
        expect(screen.getByRole('tab', { name: 'My Voices' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: '🤗 Discover' })).toBeInTheDocument();
    });

    it('My Voices tab is selected by default', () => {
        render(<VoicesTabHeader {...baseProps} />);
        expect(screen.getByRole('tab', { name: 'My Voices' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: '🤗 Discover' })).toHaveAttribute('aria-selected', 'false');
    });

    it('clicking Discover tab calls onTabChange with "discover"', () => {
        const onTabChange = vi.fn();
        render(<VoicesTabHeader {...baseProps} onTabChange={onTabChange} />);
        fireEvent.click(screen.getByRole('tab', { name: '🤗 Discover' }));
        expect(onTabChange).toHaveBeenCalledWith('discover');
    });

    it('when activeTab is "discover", Discover tab shows as selected', () => {
        render(<VoicesTabHeader {...baseProps} activeTab="discover" />);
        expect(screen.getByRole('tab', { name: '🤗 Discover' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'My Voices' })).toHaveAttribute('aria-selected', 'false');
    });

    it('hides search/facet row when Discover tab is active', () => {
        render(<VoicesTabHeader {...baseProps} activeTab="discover" classOptions={[{ id: 'human', label: 'Human' }]} />);
        // CLASS MultiSelect trigger should not appear in discover tab
        expect(screen.queryByRole('button', { name: 'CLASS' })).not.toBeInTheDocument();
    });

    // ---------------------------------------------------------------------------
    // Facet MultiSelects — array-based state, OR-within-facet (task 005)
    // ---------------------------------------------------------------------------

    it('renders CLASS/GENDER/AGE as compact MultiSelects in a single row (not stacked button rows)', () => {
        render(
            <VoicesTabHeader
                {...baseProps}
                classOptions={[{ id: 'human', label: 'Human' }]}
                genderOptions={[{ id: 'feminine', label: 'Feminine' }]}
                ageOptions={[{ id: 'adult', label: 'Adult' }]}
            />,
        );
        const row = document.querySelector('.voice-facet-filter-row');
        expect(row).not.toBeNull();
        expect(within(row as HTMLElement).getByRole('button', { name: 'CLASS' })).toBeInTheDocument();
        expect(within(row as HTMLElement).getByRole('button', { name: 'GENDER' })).toBeInTheDocument();
        expect(within(row as HTMLElement).getByRole('button', { name: 'AGE' })).toBeInTheDocument();
    });

    it('selecting a class option calls setClassFilter with the option id appended (OR-within-facet)', () => {
        const setClassFilter = vi.fn();
        render(
            <VoicesTabHeader
                {...baseProps}
                classFilter={['synthetic']}
                classOptions={[{ id: 'human', label: 'Human' }, { id: 'synthetic', label: 'Synthetic / AI' }]}
                setClassFilter={setClassFilter}
            />,
        );
        // Already has a selection, so the trigger's accessible name is the selected
        // chip, not the "CLASS" placeholder label — open it via the wrapper instead.
        // (Query the real <button> tag directly: role="button" would also match the
        // selected chip's removable "x", which is a <span role="button">.)
        const trigger = screen.getByTestId('class-facet-filter').querySelector('button');
        fireEvent.click(trigger as HTMLButtonElement);
        fireEvent.click(screen.getByRole('option', { name: 'Human' }));
        expect(setClassFilter).toHaveBeenCalledWith(['synthetic', 'human']);
    });

    it('deselecting an already-selected class option calls setClassFilter with it removed', () => {
        const setClassFilter = vi.fn();
        render(
            <VoicesTabHeader
                {...baseProps}
                classFilter={['human']}
                classOptions={[{ id: 'human', label: 'Human' }]}
                setClassFilter={setClassFilter}
            />,
        );
        // Selected options render as removable chips on the trigger itself
        fireEvent.click(screen.getByRole('button', { name: 'Remove Human' }));
        expect(setClassFilter).toHaveBeenCalledWith([]);
    });

    it('selecting a gender option calls setGenderFilter', () => {
        const setGenderFilter = vi.fn();
        render(
            <VoicesTabHeader
                {...baseProps}
                genderOptions={[{ id: 'feminine', label: 'Feminine' }]}
                setGenderFilter={setGenderFilter}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'GENDER' }));
        fireEvent.click(screen.getByRole('option', { name: 'Feminine' }));
        expect(setGenderFilter).toHaveBeenCalledWith(['feminine']);
    });

    it('selecting an age option calls setAgeFilter', () => {
        const setAgeFilter = vi.fn();
        render(
            <VoicesTabHeader
                {...baseProps}
                ageOptions={[{ id: 'adult', label: 'Adult' }]}
                setAgeFilter={setAgeFilter}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'AGE' }));
        fireEvent.click(screen.getByRole('option', { name: 'Adult' }));
        expect(setAgeFilter).toHaveBeenCalledWith(['adult']);
    });

    // ---------------------------------------------------------------------------
    // Free-form tag filter — separate MultiSelect, visually distinguished by a
    // divider from the three fixed-vocabulary facets (task 005)
    // ---------------------------------------------------------------------------

    it('renders a separate tag MultiSelect, visually divided from the fixed-vocabulary facets', () => {
        render(
            <VoicesTabHeader
                {...baseProps}
                classOptions={[{ id: 'human', label: 'Human' }]}
                tagOptions={[{ id: 'raspy', label: 'raspy' }]}
            />,
        );
        expect(screen.getByRole('button', { name: 'CLASS' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'TAGS' })).toBeInTheDocument();
        const row = document.querySelector('.voice-facet-filter-row');
        expect(row?.querySelector('.voice-facet-divider')).not.toBeNull();
    });

    it('selecting a tag option calls setTagFilter', () => {
        const setTagFilter = vi.fn();
        render(
            <VoicesTabHeader
                {...baseProps}
                tagOptions={[{ id: 'raspy', label: 'raspy' }]}
                setTagFilter={setTagFilter}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'TAGS' }));
        fireEvent.click(screen.getByRole('option', { name: 'raspy' }));
        expect(setTagFilter).toHaveBeenCalledWith(['raspy']);
    });

    it('omits the tag MultiSelect when no tag options are derived from live data', () => {
        render(<VoicesTabHeader {...baseProps} classOptions={[{ id: 'human', label: 'Human' }]} />);
        expect(screen.queryByRole('button', { name: 'TAGS' })).not.toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// DiscoverPlaceholder — no network calls, renders planned chip
// ---------------------------------------------------------------------------

describe('DiscoverPlaceholder', () => {
    it('renders planned chip and description text', () => {
        render(<DiscoverPlaceholder />);
        expect(screen.getByLabelText('Planned feature')).toBeInTheDocument();
        expect(screen.getByText(/community voices from hugging face/i)).toBeInTheDocument();
    });

    it('contains no install buttons or network-triggering controls', () => {
        const { container } = render(<DiscoverPlaceholder />);
        // No buttons that could trigger network calls
        const buttons = container.querySelectorAll('button');
        expect(buttons).toHaveLength(0);
    });
});
