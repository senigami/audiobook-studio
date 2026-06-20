/**
 * VoicesTabHeader.test.tsx — R5-T4 (updated)
 * Tests: toolbar buttons (wide/compact), tab pills render, Discover tab shows placeholder
 * (no network call), facet chip selection calls setClassFilter.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
        // CLASS label should not appear in discover tab
        expect(screen.queryByText('CLASS')).not.toBeInTheDocument();
    });

    // ---------------------------------------------------------------------------
    // Facet chip selection
    // ---------------------------------------------------------------------------

    it('clicking a class chip calls setClassFilter with the option id', () => {
        const setClassFilter = vi.fn();
        render(
            <VoicesTabHeader
                {...baseProps}
                classOptions={[{ id: 'human', label: 'Human' }]}
                setClassFilter={setClassFilter}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Human' }));
        expect(setClassFilter).toHaveBeenCalledWith('human');
    });

    it('clicking an active class chip calls setClassFilter with empty string (deselect)', () => {
        const setClassFilter = vi.fn();
        render(
            <VoicesTabHeader
                {...baseProps}
                classFilter="human"
                classOptions={[{ id: 'human', label: 'Human' }]}
                setClassFilter={setClassFilter}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Human' }));
        expect(setClassFilter).toHaveBeenCalledWith('');
    });

    it('clicking a gender chip calls setGenderFilter', () => {
        const setGenderFilter = vi.fn();
        render(
            <VoicesTabHeader
                {...baseProps}
                genderOptions={[{ id: 'feminine', label: 'Feminine' }]}
                setGenderFilter={setGenderFilter}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Feminine' }));
        expect(setGenderFilter).toHaveBeenCalledWith('feminine');
    });

    it('clicking an age chip calls setAgeFilter', () => {
        const setAgeFilter = vi.fn();
        render(
            <VoicesTabHeader
                {...baseProps}
                ageOptions={[{ id: 'adult', label: 'Adult' }]}
                setAgeFilter={setAgeFilter}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Adult' }));
        expect(setAgeFilter).toHaveBeenCalledWith('adult');
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
