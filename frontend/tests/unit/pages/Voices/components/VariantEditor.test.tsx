/**
 * VariantEditor.test.tsx
 *
 * Regression test: variant rows (play/speed/engine badge/Script/Rebuild)
 * had no visible name/label distinguishing one variant from another when a
 * voice has multiple variants — add the variant's display name to the row.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { SpeakerProfile } from '@/types';

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

import { VariantEditor } from '@/pages/Voices/components/VariantEditor';

const softProfile: SpeakerProfile = {
    name: 'Aria Nova - Soft',
    speaker_id: 'sp-1',
    variant_name: 'Soft',
    engine: 'xtts',
    is_default: false,
    is_ready: true,
    has_latent: true,
    wav_count: 2,
    is_rebuild_required: false,
    rebuild_reasons: [],
    preview_url: '/preview.mp3',
    speed: 1.0,
    samples: ['1.wav'],
} as SpeakerProfile;

describe('VariantEditor', () => {
    const baseProps = {
        isTesting: false,
        onTest: vi.fn(),
        onDeleteVariant: vi.fn(),
        onMoveVariant: vi.fn(),
        onRefresh: vi.fn(),
        onEditTestText: vi.fn(),
        onBuildNow: vi.fn().mockResolvedValue(true),
        requestConfirm: vi.fn(),
        voiceName: 'Aria Nova',
        buildingProfiles: {},
        engines: [],
    };

    it('shows the variant\'s display name so multiple variants are distinguishable', () => {
        render(<VariantEditor {...baseProps} profile={softProfile} />);
        expect(screen.getByText('Soft')).toBeInTheDocument();
    });
});
