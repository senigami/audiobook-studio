import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import type { Speaker, SpeakerProfile } from '@/types';
import { VoicesTab } from '@/pages/Voices/VoicesPage';
import { NarratorCard } from '@/pages/Voices/components/NarratorCard';
import { SampleManager } from '@/pages/Voices/components/SampleManager';
import { VariantEditor } from '@/pages/Voices/components/VariantEditor';

// Mock useVoiceManagement
vi.mock('@/hooks/useVoiceManagement', () => ({
  useVoiceManagement: () => ({
    speakers: [
      { id: 'speaker-1', name: 'Speaker One', default_profile_name: 'Profile 1' }
    ],
    testingProfile: null,
    buildingProfiles: new Set(),
    fetchSpeakers: vi.fn(),
    handleSetDefault: vi.fn(),
    handleTest: vi.fn(),
    handleBuildNow: vi.fn(),
    handleDelete: vi.fn(),
    handleUpdateEngine: vi.fn(),
    handleUpdateReferenceSample: vi.fn(),
    handleUpdateVoiceAssetId: vi.fn(),
    formatError: (e: any) => e.message,
  }),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useReducedMotion: () => false,
}));

// Mock fetch for API calls in the component
global.fetch = vi.fn();

describe('Voices Tab Components', () => {
    const mockProfile: SpeakerProfile = {
        name: 'Profile 1',
        speaker_id: 'speaker-1',
        variant_name: 'Default',
        provider: 'elevenlabs',
        speed: 1.0,
        wav_count: 1,
        is_default: true,
        engine: 'xtts',
        preview_url: '/api/preview/1',
        is_rebuild_required: false,
        test_text: 'Test script'
    } as any;
    const emptyProfile: SpeakerProfile = {
        ...mockProfile,
        name: 'Profile Empty',
        wav_count: 0,
        preview_url: null,
        is_rebuild_required: false,
        samples: [],
        samples_detailed: []
    } as any;

    const mockSpeaker: Speaker = {
        id: 'speaker-1',
        name: 'Speaker One',
        default_profile_name: 'Profile 1',
        created_at: Date.now(),
        updated_at: Date.now()
    };

    const mockEngines = [
        { engine_id: 'xtts', display_name: 'XTTS', enabled: true, verified: true, status: 'ready' } as any
    ];

    describe('VoicesTab', () => {
        it('renders voice lab header and search bar', () => {
            // VoicesPage (R5-T4) removed the <h2>Voices</h2> heading; the header now shows
            // "My Voices" tab pill, a search bar, and toolbar buttons.
            // Button labels are hidden in compact mode (JSDOM window.innerWidth=0), so we
            // query by accessible name (aria-label) which is always present.
            render(<MemoryRouter><VoicesTab onRefresh={vi.fn()} speakerProfiles={[mockProfile]} testProgress={{}} engines={mockEngines} /></MemoryRouter>);
            expect(screen.getByPlaceholderText('Search voices...')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Export Voice' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Import Voice' })).toBeInTheDocument();
        });

        it('renders list of voices', () => {
            render(<MemoryRouter><VoicesTab onRefresh={vi.fn()} speakerProfiles={[mockProfile]} testProgress={{}} engines={mockEngines} /></MemoryRouter>);
            // useVoiceManagement mock returns speakers:[{id:'speaker-1', name:'Speaker One'}]
            // and mockProfile has speaker_id:'speaker-1' → catalog card shows 'Speaker One'
            expect(screen.getByText('Speaker One')).toBeInTheDocument();
        });

        it('opens create voice modal', () => {
            render(<MemoryRouter><VoicesTab onRefresh={vi.fn()} speakerProfiles={[mockProfile]} testProgress={{}} engines={mockEngines} /></MemoryRouter>);
            // Button label hidden in compact mode; use accessible name
            fireEvent.click(screen.getByRole('button', { name: 'New Voice' }));
            expect(screen.getByText('Create New Voice')).toBeInTheDocument();
        });
    });

    describe('NarratorCard', () => {
        it('renders narrator info and profiles', () => {
            render(
                <NarratorCard
                    speaker={mockSpeaker}
                    profiles={[mockProfile]}
                    onRefresh={vi.fn()}
                    onTest={vi.fn()}
                    onDelete={vi.fn()}
                    onMoveVariant={vi.fn()}
                    onEditTestText={vi.fn()}
                    onBuildNow={vi.fn()}
                    testProgress={{}}
                    requestConfirm={vi.fn()}
                    buildingProfiles={{}}
                    onAddVariantClick={vi.fn()}
                    onSetDefaultClick={vi.fn()}
                    onRenameClick={vi.fn()}
                    isExpanded={true}
                    onToggleExpand={vi.fn()}
                    engines={mockEngines}
                />
            );

            expect(screen.getByText('Speaker One')).toBeInTheDocument();
            expect(screen.getAllByText('Default').length).toBeGreaterThan(0);
            expect(screen.getAllByText('XTTS').length).toBeGreaterThan(0);
        });

        it('disables play and rebuild actions when no samples exist', () => {
            render(
                <NarratorCard
                    speaker={mockSpeaker}
                    profiles={[emptyProfile]}
                    onRefresh={vi.fn()}
                    onTest={vi.fn()}
                    onDelete={vi.fn()}
                    onMoveVariant={vi.fn()}
                    onEditTestText={vi.fn()}
                    onBuildNow={vi.fn()}
                    testProgress={{}}
                    requestConfirm={vi.fn()}
                    buildingProfiles={{}}
                    onAddVariantClick={vi.fn()}
                    onSetDefaultClick={vi.fn()}
                    onRenameClick={vi.fn()}
                    isExpanded={true}
                    onToggleExpand={vi.fn()}
                    engines={mockEngines}
                />
            );

            const buttons = screen.getAllByRole('button');
            expect(buttons.some(btn => btn.getAttribute('title') === 'Add at least one sample or keep a latent before generating a preview')).toBe(true);
            // Rebuild is now consolidated into VariantEditor's ActionMenu overflow
            // (task 009 chrome demotion) — open it (index 1: index 0 is the
            // card-level ActionMenu) and check the item's disabled state.
            fireEvent.click(screen.getAllByLabelText('More actions')[1]);
            expect(screen.getByRole('button', { name: 'Rebuild' })).toBeDisabled();
        });

        it('allows testing and rebuilding when a latent exists even without raw samples', () => {
            render(
                <NarratorCard
                    speaker={mockSpeaker}
                    profiles={[{ ...emptyProfile, has_latent: true }]}
                    onRefresh={vi.fn()}
                    onTest={vi.fn()}
                    onDelete={vi.fn()}
                    onMoveVariant={vi.fn()}
                    onEditTestText={vi.fn()}
                    onBuildNow={vi.fn()}
                    testProgress={{}}
                    requestConfirm={vi.fn()}
                    buildingProfiles={{}}
                    onAddVariantClick={vi.fn()}
                    onSetDefaultClick={vi.fn()}
                    onRenameClick={vi.fn()}
                    isExpanded={true}
                    onToggleExpand={vi.fn()}
                    engines={mockEngines}
                />
            );

            expect(screen.getByText('BUILD TO TEST')).toBeInTheDocument();
            const buttons = screen.getAllByRole('button');
            expect(buttons.some(btn => btn.getAttribute('title') === 'Generate Sample' && !btn.hasAttribute('disabled'))).toBe(true);
            // Rebuild is now consolidated into VariantEditor's ActionMenu overflow
            // (task 009 chrome demotion) — open it (index 1: index 0 is the
            // card-level ActionMenu) and check the item is enabled.
            fireEvent.click(screen.getAllByLabelText('More actions')[1]);
            expect(screen.getByRole('button', { name: 'Rebuild' })).not.toBeDisabled();
        });

        it('prefers the base Default profile over a sibling variant', () => {
            render(
                <NarratorCard
                    speaker={mockSpeaker}
                    profiles={[
                        { ...mockProfile, name: 'Profile 1 - Angry', variant_name: 'Angry', speed: 1.5, is_default: false },
                        { ...mockProfile, name: 'Profile 1', variant_name: 'Default', speed: 1.0, is_default: false }
                    ]}
                    onRefresh={vi.fn()}
                    onTest={vi.fn()}
                    onDelete={vi.fn()}
                    onMoveVariant={vi.fn()}
                    onEditTestText={vi.fn()}
                    onBuildNow={vi.fn()}
                    testProgress={{}}
                    requestConfirm={vi.fn()}
                    buildingProfiles={{}}
                    onAddVariantClick={vi.fn()}
                    onSetDefaultClick={vi.fn()}
                    onRenameClick={vi.fn()}
                    isExpanded={true}
                    onToggleExpand={vi.fn()}
                    engines={mockEngines}
                />
            );

            expect(screen.getByText('1.00x')).toBeInTheDocument();
        });

        it('shows Voxtral badge and hides XTTS-only controls for Voxtral profiles', () => {
            render(
                <NarratorCard
                    speaker={mockSpeaker}
                    profiles={[{ ...mockProfile, engine: 'cloud_engine', preview_url: null, voice_asset_id: 'voice_123' }]}
                    onRefresh={vi.fn()}
                    onTest={vi.fn()}
                    onDelete={vi.fn()}
                    onMoveVariant={vi.fn()}
                    onEditTestText={vi.fn()}
                    onBuildNow={vi.fn()}
                    testProgress={{}}
                    requestConfirm={vi.fn()}
                    buildingProfiles={{}}
                    onAddVariantClick={vi.fn()}
                    onSetDefaultClick={vi.fn()}
                    onRenameClick={vi.fn()}
                    isExpanded={true}
                    onToggleExpand={vi.fn()}
                    engines={[{ engine_id: 'cloud_engine', display_name: 'Cloud Engine', enabled: true, verified: true, cloud: true, status: 'ready' } as any]}
                />
            );

            expect(screen.getAllByText(/cloud engine/i).length).toBeGreaterThan(0);
            expect(screen.queryByText('1.00x')).not.toBeInTheDocument();
            expect(screen.getByText('BUILD TO TEST')).toBeInTheDocument();
            expect(screen.getAllByTitle('Generate Sample').length).toBe(1);
            // Generate is now consolidated into VariantEditor's ActionMenu overflow
            // (task 009 chrome demotion) — open it (index 1: index 0 is the
            // card-level ActionMenu) and confirm the item, not "Rebuild".
            fireEvent.click(screen.getAllByLabelText('More actions')[1]);
            expect(screen.getByText('Generate')).toBeInTheDocument();
            expect(screen.queryByText('Rebuild')).not.toBeInTheDocument();
        });

        it('shows rebuild required status and regenerate action for stale Voxtral previews', () => {
            render(
                <NarratorCard
                    speaker={mockSpeaker}
                    profiles={[{ ...mockProfile, engine: 'cloud_engine', preview_url: '/api/preview/vox', voice_asset_id: 'voice_123', is_rebuild_required: true }]}
                    onRefresh={vi.fn()}
                    onTest={vi.fn()}
                    onDelete={vi.fn()}
                    onMoveVariant={vi.fn()}
                    onEditTestText={vi.fn()}
                    onBuildNow={vi.fn()}
                    testProgress={{}}
                    requestConfirm={vi.fn()}
                    buildingProfiles={{}}
                    onAddVariantClick={vi.fn()}
                    onSetDefaultClick={vi.fn()}
                    onRenameClick={vi.fn()}
                    isExpanded={true}
                    onToggleExpand={vi.fn()}
                    engines={[{ engine_id: 'cloud_engine', display_name: 'Cloud Engine', enabled: true, verified: true, cloud: true, status: 'ready' } as any]}
                />
            );

            expect(screen.getByText(/PREVIEW STALE/i)).toBeInTheDocument();
            expect(screen.getByTitle('Play Sample')).not.toBeDisabled();
            // Regenerate is now consolidated into VariantEditor's ActionMenu overflow
            // (task 009 chrome demotion) — open it (index 1: index 0 is the
            // card-level ActionMenu) and confirm the item.
            fireEvent.click(screen.getAllByLabelText('More actions')[1]);
            expect(screen.getByText('Regenerate')).toBeInTheDocument();
        });

        it('keeps existing Voxtral previews playable but blocks new generation when cloud voices are disabled', () => {
            render(
                <NarratorCard
                    speaker={mockSpeaker}
                    profiles={[{ ...mockProfile, engine: 'cloud_engine', preview_url: '/api/preview/vox', voice_asset_id: 'voice_123', is_rebuild_required: true }]}
                    onRefresh={vi.fn()}
                    onTest={vi.fn()}
                    onDelete={vi.fn()}
                    onMoveVariant={vi.fn()}
                    onEditTestText={vi.fn()}
                    onBuildNow={vi.fn()}
                    testProgress={{}}
                    requestConfirm={vi.fn()}
                    buildingProfiles={{}}
                    onAddVariantClick={vi.fn()}
                    onSetDefaultClick={vi.fn()}
                    onRenameClick={vi.fn()}
                    isExpanded={true}
                    onToggleExpand={vi.fn()}
                    engines={[{ engine_id: 'cloud_engine', display_name: 'Cloud Engine', enabled: false, verified: true, cloud: true, status: 'ready' } as any]}
                />
            );

            expect(screen.getByTitle('Play Sample')).not.toBeDisabled();
            expect(screen.getByText(/disabled or unavailable/i)).toBeInTheDocument();
            // Regenerate is now consolidated into VariantEditor's ActionMenu overflow
            // (task 009 chrome demotion) — open it (index 1: index 0 is the
            // card-level ActionMenu) and confirm the item is disabled.
            fireEvent.click(screen.getAllByLabelText('More actions')[1]);
            expect(screen.getByRole('button', { name: /Regenerate/i })).toBeDisabled();
        });
    });

    describe('SampleManager', () => {
        it('renders samples list', () => {
            const mockSamples = [
                { id: 'sample-1', speaker_id: 'speaker-1', name: 'Sample 1', path: '/path/1', created_at: Date.now(), profile_name: 'Profile 1' }
            ] as any;
            render(
                <SampleManager
                    profile={{ ...mockProfile, samples_detailed: mockSamples }}
                    isSamplesExpanded={true}
                    setIsSamplesExpanded={vi.fn()}
                    isRebuildRequired={false}
                    uploadFiles={vi.fn()}
                    playingSample={null}
                    handlePlaySample={vi.fn()}
                    handleDeleteSample={vi.fn()}
                />
            );

            expect(screen.getByText('Sample 1')).toBeInTheDocument();
        });

        it('highlights the samples expander and add button on hover class', () => {
            render(
                <SampleManager
                    profile={{ ...mockProfile, samples_detailed: [] }}
                    isSamplesExpanded={true}
                    setIsSamplesExpanded={vi.fn()}
                    isRebuildRequired={false}
                    uploadFiles={vi.fn()}
                    playingSample={null}
                    handlePlaySample={vi.fn()}
                    handleDeleteSample={vi.fn()}
                />
            );

            expect(screen.getByRole('button', { name: /Samples \(0\)/ })).toHaveClass('hover-bg-subtle');
            expect(screen.getByTitle('Add Samples Manually')).toHaveClass('hover-bg-subtle');
            expect(screen.getByRole('button', { name: 'Collapse samples' })).toHaveClass('hover-bg-subtle');
        });
    });

    describe('VariantEditor', () => {
        it('renders editor with speed and script button', () => {
            render(
                <VariantEditor
                    profile={mockProfile}
                    isTesting={false}
                    onTest={vi.fn()}
                    onDeleteVariant={vi.fn()}
                    onMoveVariant={vi.fn()}
                    onRefresh={vi.fn()}
                    onEditTestText={vi.fn()}
                    onBuildNow={vi.fn()}
                    requestConfirm={vi.fn()}
                    voiceName="Speaker One"
                    buildingProfiles={{}}
                />
            );

            expect(screen.getByText('1.00x')).toBeInTheDocument();
            expect(screen.getByTitle('Play Sample')).toHaveClass('hover-bg-subtle');
            expect(screen.getByRole('button', { name: '1.00x' })).toHaveClass('hover-bg-subtle');
            // Script/Move Variant/Delete Variant are now consolidated into the
            // ActionMenu overflow (task 009 chrome demotion) — open it to reach them.
            fireEvent.click(screen.getByTitle('More actions'));
            expect(screen.getByRole('button', { name: 'Script' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Move Variant' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Delete Variant' })).toBeInTheDocument();
        });
    });

    describe('Voice Portability (Import/Export)', () => {
        it('renders Import Voice button and handles file selection', async () => {
            // VoicesTab also fetches /api/voices/ metadata on mount, so respond by URL
            // rather than queueing a single mockResolvedValueOnce (which the metadata
            // fetch would otherwise consume before the import request fires).
            (global.fetch as any).mockImplementation((url: string) => {
                if (url === '/api/voices/bundle/import') {
                    return Promise.resolve({
                        ok: true,
                        json: async () => ({
                            status: 'ok',
                            voice_name: 'Speaker One',
                            original_voice_name: 'Speaker One',
                            was_renamed: false,
                            variants: []
                        })
                    });
                }
                return Promise.resolve({ ok: true, json: async () => ([]) });
            });

            // Button label text hidden in compact mode (JSDOM innerWidth=0); use aria-label query
            render(<MemoryRouter><VoicesTab onRefresh={vi.fn()} speakerProfiles={[mockProfile]} testProgress={{}} engines={mockEngines} /></MemoryRouter>);
            const importBtn = screen.getByRole('button', { name: 'Import Voice' });
            expect(importBtn).toBeInTheDocument();

            // The button clicks a hidden input
            const input = screen.getByLabelText('Import voice bundle file') as HTMLInputElement;
            expect(input).toBeInTheDocument();
            expect(input).toHaveAttribute('type', 'file');
            expect(input).toHaveAttribute('accept', '.zip,application/zip');

            const file = new File(['zip-bytes'], 'bundle.zip', { type: 'application/zip' });
            fireEvent.change(input, { target: { files: [file] } });

            // Selecting a file actually triggers the import request...
            await waitFor(() => {
                expect(global.fetch).toHaveBeenCalledWith(
                    '/api/voices/bundle/import',
                    expect.objectContaining({ method: 'POST' })
                );
            });
            // ...and surfaces the resulting success confirmation to the user.
            expect(await screen.findByText(/Imported "Speaker One"/i)).toBeInTheDocument();
        });

        it('renders Export Voice button and opens export modal', () => {
            render(<MemoryRouter><VoicesTab onRefresh={vi.fn()} speakerProfiles={[mockProfile]} testProgress={{}} engines={mockEngines} /></MemoryRouter>);
            // Button label text hidden in compact mode; use accessible name query then click
            const exportBtn = screen.getByRole('button', { name: 'Export Voice' });
            expect(exportBtn).toBeInTheDocument();

            fireEvent.click(exportBtn);
            expect(screen.getByText('Export Voice Bundle')).toBeInTheDocument();
            expect(screen.getByLabelText('Voice to export')).toBeInTheDocument();
        });

        it('shows Export Voice Bundle in NarratorCard ActionMenu', () => {
            const onExport = vi.fn();
            render(
                <NarratorCard
                    speaker={mockSpeaker}
                    profiles={[mockProfile]}
                    onRefresh={vi.fn()}
                    onTest={vi.fn()}
                    onDelete={vi.fn()}
                    onMoveVariant={vi.fn()}
                    onEditTestText={vi.fn()}
                    onBuildNow={vi.fn()}
                    testProgress={{}}
                    requestConfirm={vi.fn()}
                    buildingProfiles={{}}
                    onAddVariantClick={vi.fn()}
                    onSetDefaultClick={vi.fn()}
                    onRenameClick={vi.fn()}
                    onExportVoice={onExport}
                    isExpanded={true}
                    onToggleExpand={vi.fn()}
                    engines={mockEngines}
                />
            );

            // Open the card-level ActionMenu (index 0: index 1 is the nested
            // VariantEditor's own ActionMenu, added by task 009's chrome demotion).
            fireEvent.click(screen.getAllByLabelText('More actions')[0]);
            expect(screen.getByText('Export Voice Bundle')).toBeInTheDocument();

            fireEvent.click(screen.getByText('Export Voice Bundle'));
            expect(onExport).toHaveBeenCalledWith('Speaker One');
        });

        it('shows export confirmation modal with source WAV toggle', () => {
            const mockRefresh = vi.fn();
            render(<MemoryRouter><VoicesTab onRefresh={mockRefresh} speakerProfiles={[mockProfile]} testProgress={{}} engines={mockEngines} /></MemoryRouter>);

            // Trigger export via VoiceCatalogCard ActionMenu (replaced NarratorCard in R5-T3)
            fireEvent.click(screen.getByLabelText('More actions'));
            fireEvent.click(screen.getByText('Export Voice Bundle'));

            // Modal should appear
            expect(screen.getByText('Export Voice Bundle')).toBeInTheDocument();
            expect(screen.getByText(/Export a voice bundle with all variants/)).toBeInTheDocument();
            expect(screen.getByLabelText('Voice to export')).toHaveValue('Speaker One');

            const toggle = screen.getByLabelText(/Include source WAV samples/);
            expect(toggle).toBeInTheDocument();
            expect(toggle).not.toBeChecked();

            // Cancel button
            fireEvent.click(screen.getByText('Cancel'));
            expect(screen.queryByText(/Export "Speaker One"/)).not.toBeInTheDocument();
        });
    });
});
