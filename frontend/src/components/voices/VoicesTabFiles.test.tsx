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
    formatError: (e: any) => e.message,
  }),
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
        preview_url: '/api/preview/1',
        is_rebuild_required: false,
        test_text: 'Test script'
    } as any;

    const mockSpeaker: Speaker = { 
        id: 'speaker-1', 
        name: 'Speaker One', 
        default_profile_name: 'Profile 1', 
        created_at: Date.now(), 
        updated_at: Date.now() 
    };

    describe('VoicesTab', () => {
        it('renders voice lab header and search bar', () => {
            render(<VoicesTab onRefresh={vi.fn()} speakerProfiles={[mockProfile]} testProgress={{}} />);
            expect(screen.getByText('Voices')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('Search voices...')).toBeInTheDocument();
        });

        it('renders list of voices', () => {
            render(<VoicesTab onRefresh={vi.fn()} speakerProfiles={[mockProfile]} testProgress={{}} />);
            expect(screen.getByText('Speaker One')).toBeInTheDocument();
        });

        it('opens create voice modal', () => {
            render(<VoicesTab onRefresh={vi.fn()} speakerProfiles={[mockProfile]} testProgress={{}} />);
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
                />
            );

            expect(screen.getByText('Speaker One')).toBeInTheDocument();
            expect(screen.getByText('Default')).toBeInTheDocument();
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
                />
            );

            expect(screen.getByText('1.00x')).toBeInTheDocument();
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
        });
    });
});
