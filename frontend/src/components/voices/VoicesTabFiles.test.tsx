import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Speaker, SpeakerProfile } from '../../types';
import { VoicesTab } from '../VoicesTab';
import { NarratorCard } from './NarratorCard';
import { SampleManager } from './SampleManager';
import { VariantEditor } from './VariantEditor';

// Mock useVoiceManagement
vi.mock('../../hooks/useVoiceManagement', () => ({
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
    handleUpdateVoxtralVoiceId: vi.fn(),
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
            render(<VoicesTab onRefresh={vi.fn()} speakerProfiles={[mockProfile]} testProgress={{}} engines={mockEngines} />);
            expect(screen.getByText('Voices')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('Search voices...')).toBeInTheDocument();
            expect(screen.getByText('Export Voice')).toBeInTheDocument();
            expect(screen.getByText('Import Voice')).toBeInTheDocument();
        });

        it('renders list of voices', () => {
            render(<VoicesTab onRefresh={vi.fn()} speakerProfiles={[mockProfile]} testProgress={{}} engines={mockEngines} />);
            expect(screen.getByText('Speaker One')).toBeInTheDocument();
        });

        it('opens create voice modal', () => {
            render(<VoicesTab onRefresh={vi.fn()} speakerProfiles={[mockProfile]} testProgress={{}} engines={mockEngines} />);
            fireEvent.click(screen.getByText('New Voice'));
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
            expect(screen.getByText('Default')).toBeInTheDocument();
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
            expect(buttons.some(btn => btn.getAttribute('title') === 'Add at least one sample or keep a latent before rebuilding this voice')).toBe(true);
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
            expect(buttons.some(btn => btn.getAttribute('title') === 'Rebuild Voice Model' && !btn.hasAttribute('disabled'))).toBe(true);
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
                    profiles={[{ ...mockProfile, engine: 'voxtral', preview_url: null, voxtral_voice_id: 'voice_123' }]}
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
                    engines={[{ engine_id: 'voxtral', display_name: 'Voxtral', enabled: true, verified: true, cloud: true, status: 'ready' } as any]}
                />
            );

            expect(screen.getAllByText(/voxtral/i).length).toBeGreaterThan(0);
            expect(screen.queryByText('1.00x')).not.toBeInTheDocument();
            expect(screen.queryByText('Rebuild')).not.toBeInTheDocument();
            expect(screen.getByText('BUILD TO TEST')).toBeInTheDocument();
            expect(screen.getByText('Generate')).toBeInTheDocument();
            expect(screen.getAllByTitle('Generate Sample').length).toBe(2);
        });

        it('shows rebuild required status and regenerate action for stale Voxtral previews', () => {
            render(
                <NarratorCard
                    speaker={mockSpeaker}
                    profiles={[{ ...mockProfile, engine: 'voxtral', preview_url: '/api/preview/vox', voxtral_voice_id: 'voice_123', is_rebuild_required: true }]}
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
                    engines={[{ engine_id: 'voxtral', display_name: 'Voxtral', enabled: true, verified: true, cloud: true, status: 'ready' } as any]}
                />
            );

            expect(screen.getByText(/PREVIEW STALE/i)).toBeInTheDocument();
            expect(screen.getByText('Regenerate')).toBeInTheDocument();
            expect(screen.getByTitle('Play Sample')).not.toBeDisabled();
        });

        it('keeps existing Voxtral previews playable but blocks new generation when cloud voices are disabled', () => {
            render(
                <NarratorCard
                    speaker={mockSpeaker}
                    profiles={[{ ...mockProfile, engine: 'voxtral', preview_url: '/api/preview/vox', voxtral_voice_id: 'voice_123', is_rebuild_required: true }]}
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
                    engines={[{ engine_id: 'voxtral', display_name: 'Voxtral', enabled: false, verified: true, cloud: true, status: 'ready' } as any]}
                />
            );

            expect(screen.getByTitle('Play Sample')).not.toBeDisabled();
            expect(screen.getByRole('button', { name: /Regenerate/i })).toBeDisabled();
            expect(screen.getByText(/disabled or unavailable/i)).toBeInTheDocument();
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
            expect(screen.getByText('Script')).toBeInTheDocument();
            expect(screen.getByTitle('Play Sample')).toHaveClass('hover-bg-subtle');
            expect(screen.getByRole('button', { name: 'Delete Variant' })).toHaveClass('hover-bg-destructive');
            expect(screen.getByRole('button', { name: '1.00x' })).toHaveClass('hover-bg-subtle');
            expect(screen.getByRole('button', { name: 'Script' })).toHaveClass('hover-bg-subtle');
            expect(screen.getByRole('button', { name: 'Move Variant' })).toHaveClass('hover-bg-subtle');
        });
    });

    describe('Voice Portability (Import/Export)', () => {
        it('renders Import Voice button and handles file selection', () => {
            render(<VoicesTab onRefresh={vi.fn()} speakerProfiles={[mockProfile]} testProgress={{}} engines={mockEngines} />);
            const importBtn = screen.getByText('Import Voice');
            expect(importBtn).toBeInTheDocument();

            // The button clicks a hidden input
            const input = screen.getByLabelText('Import voice bundle file');
            expect(input).toBeInTheDocument();
            expect(input).toHaveAttribute('type', 'file');
            expect(input).toHaveAttribute('accept', '.zip,application/zip');
        });

        it('renders Export Voice button and opens export modal', () => {
            render(<VoicesTab onRefresh={vi.fn()} speakerProfiles={[mockProfile]} testProgress={{}} engines={mockEngines} />);
            const exportBtn = screen.getByText('Export Voice');
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

            // Open ActionMenu
            fireEvent.click(screen.getByLabelText('More actions'));
            expect(screen.getByText('Export Voice Bundle')).toBeInTheDocument();

            fireEvent.click(screen.getByText('Export Voice Bundle'));
            expect(onExport).toHaveBeenCalledWith('Speaker One');
        });

        it('shows export confirmation modal with source WAV toggle', () => {
            const mockRefresh = vi.fn();
            render(<VoicesTab onRefresh={mockRefresh} speakerProfiles={[mockProfile]} testProgress={{}} engines={mockEngines} />);

            // Trigger export via NarratorCard (which is rendered inside VoicesTab)
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
