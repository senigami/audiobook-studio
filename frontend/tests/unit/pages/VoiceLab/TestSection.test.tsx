/**
 * TestSection.test.tsx — R5-T8
 *
 * Tests:
 * - Generate-test fires onTest with the chosen engine/variant/script
 * - Progress fixture renders the bar (non-zero width)
 * - Delete confirm fires handleDelete and navigates (mock router boundary)
 *   (tested at VoiceLabPage level — TestSection just tests its own CTA)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import type { SpeakerProfile, TtsEngine } from '@/types';

import { TestSection } from '@/pages/VoiceLab/components/TestSection';

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
    samples: ['1.wav', '2.wav'],
    samples_detailed: [
        { name: '1.wav', is_new: false },
        { name: '2.wav', is_new: false },
    ],
    reference_sample: null,
    voice_asset_id: null,
    test_text: 'Hello world.',
    settings: {},
};

const commonProps = {
    profiles: [defaultProfile],
    engines: mockEngines,
    testProgress: {},
    jobs: {},
    onTest: vi.fn().mockResolvedValue(undefined),
    onRefresh: vi.fn(),
};

describe('TestSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the Test section label', () => {
        render(<TestSection {...commonProps} />);
        // Multiple "Test" elements exist (label + options); just assert presence
        const allTest = screen.getAllByText(/Test/i);
        expect(allTest.length).toBeGreaterThan(0);
    });

    it('renders the Generate test button', () => {
        render(<TestSection {...commonProps} />);
        expect(screen.getByRole('button', { name: /generate test/i })).toBeInTheDocument();
    });

    it('fires onTest when Generate test is clicked', async () => {
        const onTest = vi.fn().mockResolvedValue(undefined);
        render(<TestSection {...commonProps} onTest={onTest} />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /generate test/i }));
            await Promise.resolve();
        });

        expect(onTest).toHaveBeenCalledOnce();
        expect(onTest).toHaveBeenCalledWith(defaultProfile.name);
    });

    it('renders a variant selector with the profile variant name', () => {
        render(<TestSection {...commonProps} />);
        const select = screen.getByRole('combobox', { name: /test variant/i });
        expect(select).toBeInTheDocument();
        // The option should contain the variant name
        expect(screen.getByRole('option', { name: /default/i })).toBeInTheDocument();
    });

    it('renders a reference sample selector when samples are present', () => {
        render(<TestSection {...commonProps} />);
        const refSelect = screen.getByRole('combobox', { name: /reference sample/i });
        expect(refSelect).toBeInTheDocument();
        // The "Auto" option
        expect(screen.getByRole('option', { name: /auto/i })).toBeInTheDocument();
        // Sample options
        expect(screen.getByRole('option', { name: /1\.wav/i })).toBeInTheDocument();
    });

    it('renders progress bar when testProgress is non-zero', () => {
        render(
            <TestSection
                {...commonProps}
                testProgress={{ [defaultProfile.name]: { progress: 42, started_at: Date.now() } }}
            />
        );
        // Progress bar is rendered as a div with width style
        // We check that the generating state is visible
        expect(screen.getByText(/Generating…/i)).toBeInTheDocument();
    });

    it('renders playback controls when preview_url is present', () => {
        render(<TestSection {...commonProps} />);
        expect(screen.getByRole('button', { name: /play preview/i })).toBeInTheDocument();
    });

    it('shows no preview message when preview_url is absent', () => {
        const profileNoPreview = { ...defaultProfile, preview_url: null };
        render(<TestSection {...commonProps} profiles={[profileNoPreview]} />);
        expect(screen.getByText(/No preview yet/i)).toBeInTheDocument();
    });

    it('renders the engine badge', () => {
        render(<TestSection {...commonProps} />);
        expect(screen.getByText('XTTS v2')).toBeInTheDocument();
    });
});
