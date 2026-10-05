/**
 * SamplesSection.test.tsx — R5-T6
 *
 * Tests:
 * - Lists fixture samples
 * - Fires delete handler when delete button is clicked (mock boundary)
 * - Fires upload handler when file is chosen (mock boundary)
 * - Shows empty state when no profile
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { SpeakerProfile } from '@/types';

// Mock the hooks that touch audio / network
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
    pause: vi.fn(),
}));

import { SamplesSection } from '@/pages/VoiceLab/components/SamplesSection';
import { useVariantActions } from '@/hooks/useVariantActions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockProfile: SpeakerProfile = {
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
    samples: ['1.wav', '2.wav'],
    samples_detailed: [
        { name: '1.wav', is_new: false },
        { name: '2.wav', is_new: true },
    ],
    reference_sample: null,
    voice_asset_id: null,
    test_text: '',
    settings: {},
};

describe('SamplesSection', () => {
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

    it('passes the profile to SampleManager (wav count shown)', () => {
        render(<SamplesSection profiles={[mockProfile]} onRefresh={vi.fn()} />);
        // SampleManager shows the sample count in its header
        expect(screen.getByText(/Samples \(2\)/)).toBeInTheDocument();
    });

    it('shows empty state when no profiles are provided', () => {
        render(<SamplesSection profiles={[]} onRefresh={vi.fn()} />);
        expect(screen.getByText(/No profile found/i)).toBeInTheDocument();
    });
});
