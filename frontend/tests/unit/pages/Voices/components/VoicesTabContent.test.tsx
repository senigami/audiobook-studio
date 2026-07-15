/**
 * VoicesTabContent.test.tsx
 * Confirms VoicesTabContent forwards callbacks through to the rendered VoiceCatalogCard's
 * simplified action surface (Set Default direct action; Rename/Export/Delete overflow menu —
 * task 006, voice-card-consolidation plan). Edit Metadata/Edit Recording Script/Voice Settings
 * were relocated to the voice detail page and are no longer reachable from this catalog card.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
        span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock the playerBus boundary (audio owner) — pulled in transitively via VoiceCatalogCard
vi.mock('@/store/playerBus', () => ({
    usePlayerBus: vi.fn(() => ({ scope: null, audioUrl: null, playing: false })),
    loadAndPlay: vi.fn(),
    pause: vi.fn(),
}));

import { VoicesTabContent } from '@/pages/Voices/components/VoicesTabContent';
import type { SpeakerProfile, TtsEngine } from '@/types';

describe('VoicesTabContent', () => {
    const readyEngine: TtsEngine = {
        engine_id: 'xtts',
        enabled: true,
        status: 'ready',
        display_name: 'XTTS',
        verified: false,
        capabilities: ['voice_build'],
    } as TtsEngine;

    const readyProfile: SpeakerProfile = {
        name: 'Clara Bell - Default',
        wav_count: 3,
        speed: 1.0,
        is_default: true,
        speaker_id: 'sp-1',
        variant_name: 'Default',
        engine: 'xtts',
        preview_url: '/preview/clara.mp3',
        is_rebuild_required: false,
        rebuild_reasons: [],
        is_ready: true,
        has_latent: false,
        voice_asset_id: null,
        reference_sample: null,
        samples: [],
    };

    const voice = {
        id: 'sp-1',
        name: 'Clara Bell',
        profiles: [readyProfile],
    };

    const baseProps = {
        voices: [voice],
        filteredVoices: [voice],
        engineFilter: 'all' as const,
        onRefresh: vi.fn(),
        handleTest: vi.fn(),
        handleDelete: vi.fn(),
        handleBuildNow: vi.fn().mockResolvedValue(true),
        testProgress: {},
        handleRequestConfirm: vi.fn(),
        buildingProfiles: {},
        onSetDefault: vi.fn(),
        onRename: vi.fn(),
        onAddVariant: vi.fn(),
        onMoveVariant: vi.fn(),
        onExportVoice: vi.fn(),
        expandedVoiceId: null,
        setExpandedVoiceId: vi.fn(),
        engines: [readyEngine],
        onCreateClick: vi.fn(),
        voiceMetadataMap: new Map(),
        onEditMetadata: vi.fn(),
        onNavigateToLab: vi.fn(),
    };

    it('forwards onSetDefault to the rendered VoiceCatalogCard\'s "Set as App Default" overflow-menu item', () => {
        const nonDefaultProfile = { ...readyProfile, is_default: false };
        const nonDefaultVoice = { ...voice, profiles: [nonDefaultProfile] };
        render(<VoicesTabContent {...baseProps} voices={[nonDefaultVoice]} filteredVoices={[nonDefaultVoice]} />);

        fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
        fireEvent.click(screen.getByText('Set as App Default'));

        expect(baseProps.onSetDefault).toHaveBeenCalledWith(nonDefaultProfile.name);
    });

    it('forwards onRename to the rendered VoiceCatalogCard\'s slimmed overflow menu', () => {
        render(<VoicesTabContent {...baseProps} />);

        fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
        fireEvent.click(screen.getByText('Rename Voice'));

        expect(baseProps.onRename).toHaveBeenCalled();
    });

    it('forwards onExportVoice to the rendered VoiceCatalogCard\'s slimmed overflow menu', () => {
        render(<VoicesTabContent {...baseProps} />);

        fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
        fireEvent.click(screen.getByText('Export Voice Bundle'));

        expect(baseProps.onExportVoice).toHaveBeenCalledWith('Clara Bell');
    });

    it('forwards onNavigateToLab to the rendered VoiceCatalogCard (card body click)', () => {
        render(<VoicesTabContent {...baseProps} />);

        fireEvent.click(screen.getByTestId('voice-catalog-card-body'));

        expect(baseProps.onNavigateToLab).toHaveBeenCalledWith('sp-1');
    });

    // ---------------------------------------------------------------------------
    // Bulk-select toolbar (persona fast-follow: Large Catalog Curator)
    // ---------------------------------------------------------------------------

    it('does not render the bulk toolbar when selectMode is off', () => {
        render(<VoicesTabContent {...baseProps} />);
        expect(screen.queryByRole('toolbar', { name: /bulk voice actions/i })).not.toBeInTheDocument();
    });

    it('does not render the bulk toolbar when selectMode is on but nothing is selected', () => {
        render(<VoicesTabContent {...baseProps} selectMode selectedIds={new Set()} />);
        expect(screen.queryByRole('toolbar', { name: /bulk voice actions/i })).not.toBeInTheDocument();
    });

    it('renders the bulk toolbar with the selected count once >=1 voice is selected', () => {
        render(<VoicesTabContent {...baseProps} selectMode selectedIds={new Set(['sp-1'])} />);
        expect(screen.getByRole('toolbar', { name: /bulk voice actions/i })).toBeInTheDocument();
        expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    it('fires onBulkDelete/onBulkExport from the toolbar buttons', () => {
        const onBulkDelete = vi.fn();
        const onBulkExport = vi.fn();
        render(
            <VoicesTabContent
                {...baseProps}
                selectMode
                selectedIds={new Set(['sp-1'])}
                onBulkDelete={onBulkDelete}
                onBulkExport={onBulkExport}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: /delete 1/i }));
        expect(onBulkDelete).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: /export 1/i }));
        expect(onBulkExport).toHaveBeenCalledTimes(1);
    });

    it('passes selectable/selected/onToggleSelect through to the rendered card', () => {
        const onToggleSelect = vi.fn();
        render(
            <VoicesTabContent
                {...baseProps}
                selectMode
                selectedIds={new Set(['sp-1'])}
                onToggleSelect={onToggleSelect}
            />
        );
        const checkbox = screen.getByLabelText('Select Clara Bell checkbox').querySelector('input');
        expect(checkbox).toBeChecked();
        fireEvent.click(checkbox!);
        expect(onToggleSelect).toHaveBeenCalledWith('sp-1');
    });
});
