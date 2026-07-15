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

    it('renders the VariantSwitcher plus exactly ONE VariantEditor, never one per profile', () => {
        render(<VariantsSection {...commonProps} profiles={[defaultProfile, secondProfile]} />);
        // VariantSwitcher renders a tab per profile...
        expect(screen.getAllByRole('tab')).toHaveLength(2);
        // ...but only the selected profile's VariantEditor is mounted. Each
        // VariantEditor renders exactly one "More actions" overflow trigger,
        // so counting it ties the assertion to the number of editors mounted.
        const moreActionsButtons = screen.getAllByTitle('More actions');
        expect(moreActionsButtons).toHaveLength(1);
    });

    it('defaults selection to the character default variant, and switching tabs swaps the mounted VariantEditor', async () => {
        const user = userEvent.setup();
        const defaultVariant = { ...defaultProfile, is_variant_default: true };
        const softVariant = { ...secondProfile, is_variant_default: false };
        render(<VariantsSection {...commonProps} profiles={[softVariant, defaultVariant]} />);

        // Default variant tab is selected initially.
        expect(screen.getByRole('tab', { name: /Default/ })).toHaveAttribute('aria-selected', 'true');

        // Switching to the other variant's tab swaps which VariantEditor is mounted.
        await user.click(screen.getByRole('tab', { name: /Soft/ }));
        expect(screen.getByRole('tab', { name: /Soft/ })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getAllByTitle('More actions')).toHaveLength(1);
    });

    it('does not render the filter bar in strip mode (<=4 variants)', () => {
        render(<VariantsSection {...commonProps} profiles={[defaultProfile, secondProfile]} />);
        expect(screen.queryByTestId('variant-filter-bar')).not.toBeInTheDocument();
    });

    it('renders the filter bar in rail mode (>4 variants) and narrows visible variants on chip select', async () => {
        const user = userEvent.setup();
        const railProfiles: SpeakerProfile[] = ['A', 'B', 'C', 'D', 'E'].map((n, i) => ({
            ...defaultProfile,
            name: `Aria Nova/${n}`,
            variant_name: n,
            is_default: i === 0,
            performance_tags: n === 'C' ? ['sad', 'slow'] : ['happy'],
        }));
        render(<VariantsSection {...commonProps} profiles={railProfiles} />);
        expect(screen.getByTestId('variant-filter-bar')).toBeInTheDocument();
        expect(screen.getAllByRole('tab')).toHaveLength(5);

        await user.click(screen.getByRole('button', { name: 'sad' }));
        expect(screen.getAllByRole('tab')).toHaveLength(1);
        expect(screen.getByRole('tab', { name: /C/ })).toBeInTheDocument();
    });

    it('auto-selects the first remaining visible variant when a filter hides the currently-selected one', async () => {
        const user = userEvent.setup();
        const railProfiles: SpeakerProfile[] = ['A', 'B', 'C', 'D', 'E'].map((n, i) => ({
            ...defaultProfile,
            name: `Aria Nova/${n}`,
            variant_name: n,
            is_default: i === 0,
            performance_tags: n === 'C' ? ['sad'] : ['happy'],
        }));
        render(<VariantsSection {...commonProps} profiles={railProfiles} />);

        // Selected variant defaults to "A" (is_default). Filtering to "sad"
        // hides A, so the detail pane must fall forward onto "C" (the only
        // remaining visible profile) instead of staying pointed at A.
        expect(screen.getByRole('tab', { name: /A/ })).toHaveAttribute('aria-selected', 'true');
        await user.click(screen.getByRole('button', { name: 'sad' }));
        expect(screen.getByRole('tab', { name: /C/ })).toHaveAttribute('aria-selected', 'true');
    });
});
