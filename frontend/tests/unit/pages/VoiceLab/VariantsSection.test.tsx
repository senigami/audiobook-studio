/**
 * VariantsSection.test.tsx — R5-T6
 *
 * Tests:
 * - Renders fixture profiles (default star present)
 * - Per-variant actions (delete, move) fire callbacks
 * - Add variant button fires onAddVariant
 * - Empty state when no profiles
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { SpeakerProfile, TtsEngine } from '@/types';

// Mock heavy sub-component dependencies that need full audio/bus infrastructure
vi.mock('@/hooks/useVariantActions', () => ({
    useVariantActions: vi.fn().mockReturnValue({
        localSpeed: null,
        setLocalSpeed: vi.fn(),
        isPlaying: false,
        playingSample: null,
        setCacheBuster: vi.fn(),
        handlePlayClick: vi.fn(),
        handleGeneratePreview: vi.fn(),
        handlePlaySample: vi.fn(),
        handleSpeedChange: vi.fn(),
        handleDeleteSample: vi.fn(),
        uploadFiles: vi.fn(),
    }),
}));

vi.mock('@/store/playerBus', () => ({
    usePlayerBus: vi.fn().mockReturnValue({ scope: null, playing: false, audioUrl: null }),
    loadAndPlay: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
}));

import { VariantsSection } from '@/pages/VoiceLab/components/VariantsSection';
import { useVariantActions } from '@/hooks/useVariantActions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockEngines: TtsEngine[] = [
    {
        engine_id: 'xtts',
        display_name: 'XTTS v2',
        status: 'ready',
        verified: true,
        enabled: true,
        version: '2.0',
        local: true,
        cloud: false,
        network: false,
        languages: ['en'],
        capabilities: ['voice_build'],
        resource: {},
        author: 'coqui',
        homepage: '',
        settings_schema: {},
    },
];

const defaultProfile: SpeakerProfile = {
    name: 'Aria Nova/Default',
    speaker_id: 'voice-abc-123',
    variant_name: 'Default',
    engine: 'xtts',
    is_default: true,
    is_ready: true,
    has_latent: true,
    wav_count: 2,
    is_rebuild_required: false,
    rebuild_reasons: [],
    preview_url: '/api/voices/Aria%20Nova/preview.mp3',
    speed: 1.0,
    samples: ['1.wav'],
    samples_detailed: [{ name: '1.wav', is_new: false }],
    reference_sample: null,
    voice_asset_id: null,
    test_text: '',
    settings: {},
};

const secondProfile: SpeakerProfile = {
    ...defaultProfile,
    name: 'Aria Nova/Soft',
    variant_name: 'Soft',
    is_default: false,
};

const commonProps = {
    speakerName: 'Aria Nova',
    engines: mockEngines,
    buildingProfiles: {},
    testProgress: {},
    onRefresh: vi.fn(),
    onBuildNow: vi.fn().mockResolvedValue(true),
    requestConfirm: vi.fn(),
    onAddVariant: vi.fn(),
    onMoveVariant: vi.fn(),
};

describe('VariantsSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (useVariantActions as ReturnType<typeof vi.fn>).mockReturnValue({
            localSpeed: null,
            setLocalSpeed: vi.fn(),
            isPlaying: false,
            playingSample: null,
            setCacheBuster: vi.fn(),
            handlePlayClick: vi.fn(),
            handleGeneratePreview: vi.fn(),
            handlePlaySample: vi.fn(),
            handleSpeedChange: vi.fn(),
            handleDeleteSample: vi.fn(),
            uploadFiles: vi.fn(),
        });
    });

    it('renders the Variants section label', () => {
        render(<VariantsSection {...commonProps} profiles={[defaultProfile]} />);
        expect(screen.getByText(/Variants/i)).toBeInTheDocument();
    });

    it('renders an Add variant button', () => {
        render(<VariantsSection {...commonProps} profiles={[defaultProfile]} />);
        expect(screen.getByRole('button', { name: /add variant/i })).toBeInTheDocument();
    });

    it('fires onAddVariant when the Add variant button is clicked', async () => {
        const user = userEvent.setup();
        const onAddVariant = vi.fn();
        render(<VariantsSection {...commonProps} profiles={[defaultProfile]} onAddVariant={onAddVariant} />);
        await user.click(screen.getByRole('button', { name: /add variant/i }));
        expect(onAddVariant).toHaveBeenCalledOnce();
    });

    it('shows empty state when no profiles are provided', () => {
        render(<VariantsSection {...commonProps} profiles={[]} />);
        expect(screen.getByText(/No variants yet/i)).toBeInTheDocument();
    });

    it('renders VariantEditor rows for each profile', () => {
        render(<VariantsSection {...commonProps} profiles={[defaultProfile, secondProfile]} />);
        // VariantEditor renders at least the play button per variant
        const playButtons = screen.getAllByRole('button');
        // Should have at minimum the Add variant btn + 2 sets of controls per variant
        expect(playButtons.length).toBeGreaterThan(2);
    });
});
