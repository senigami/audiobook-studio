import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { VoicesTabHeader } from '@/pages/Voices/components/VoicesTabHeader';

describe('VoicesTabHeader', () => {
    const setViewportWidth = (width: number) => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            writable: true,
            value: width
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
            { key: 'disabled' as const, label: 'Disabled (0)' }
        ],
        isImportingVoice: false,
        exportVoiceDisabled: false,
        importInputRef: React.createRef<HTMLInputElement>(),
        onImportClick: () => undefined,
        onExportClick: () => undefined,
        onCreateClick: () => undefined,
        onGuideClick: () => undefined
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
});
