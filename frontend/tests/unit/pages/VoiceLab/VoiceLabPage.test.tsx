/**
 * VoiceLabPage.test.tsx — R5-T5
 *
 * Tests:
 * - Route renders for a fixture voice (stepper, name, back link)
 * - Stepper marks the correct phase from fixture profiles
 * - Unknown id redirects to /voices
 * - Edit-metadata opens the modal (focus-trap dialog present)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React, { Suspense } from 'react';
import { VoiceLabPage } from '@/pages/VoiceLab/VoiceLabPage';
import type { SpeakerProfile, TtsEngine, VoiceMetadata } from '@/types';

// ---------------------------------------------------------------------------
// Mock api.listVoicesWithMetadata so we don't need a server
// ---------------------------------------------------------------------------
vi.mock('@/api', () => ({
    api: {
        listVoicesWithMetadata: vi.fn(),
        exportVoiceBundleUrl: vi.fn().mockReturnValue('/api/voices/test/bundle/download'),
        uploadHfVoice: vi.fn(),
    },
}));

// Mock lazy-loaded sections to avoid their full dependency chain in unit tests
vi.mock('@/pages/VoiceLab/components/SamplesSection', () => ({
    SamplesSection: () => <div data-testid="samples-section">Samples</div>,
}));
vi.mock('@/pages/VoiceLab/components/VariantsSection', () => ({
    VariantsSection: () => <div data-testid="variants-section">Variants</div>,
}));
vi.mock('@/pages/VoiceLab/components/TestSection', () => ({
    TestSection: () => <div data-testid="test-section">Test</div>,
}));

import { api } from '@/api';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VOICE_ID = 'voice-abc-123';

const mockMetadata: VoiceMetadata = {
    id: VOICE_ID,
    name: 'Aria Nova',
    description: 'A warm, expressive narrator voice.',
    attributes: { class: 'human', gender: 'feminine', age: 'adult' },
    is_untagged: false,
};

const mockReadyProfile: SpeakerProfile = {
    name: 'Aria Nova/Default',
    speaker_id: VOICE_ID,
    variant_name: 'Default',
    engine: 'xtts',
    is_default: true,
    is_ready: true,
    has_latent: true,
    wav_count: 3,
    is_rebuild_required: false,
    rebuild_reasons: [],
    preview_url: '/api/voices/Aria%20Nova/preview.mp3',
    speed: 1.0,
    samples: [],
    samples_detailed: [],
    reference_sample: null,
    voice_asset_id: null,
    test_text: '',
    settings: {},
};

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

// ---------------------------------------------------------------------------
// Helper: render at a given path
// ---------------------------------------------------------------------------

function renderAtPath(path: string, id: string = VOICE_ID, metadataList: VoiceMetadata[] = [mockMetadata]) {
    (api.listVoicesWithMetadata as ReturnType<typeof vi.fn>).mockResolvedValue(metadataList);

    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/voices" element={<div data-testid="voices-page">Voices page</div>} />
                <Route
                    path="/voices/:id"
                    element={
                        <Suspense fallback={<div>Loading</div>}>
                            <VoiceLabPage
                                speakerProfiles={[mockReadyProfile]}
                                engines={mockEngines}
                                jobs={{}}
                                testProgress={{}}
                                onRefresh={vi.fn()}
                            />
                        </Suspense>
                    }
                />
            </Routes>
        </MemoryRouter>
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VoiceLabPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the voice name after metadata loads', async () => {
        renderAtPath(`/voices/${VOICE_ID}`);
        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });
    });

    it('navigates to /voices when the back button is clicked', async () => {
        const user = userEvent.setup();
        renderAtPath(`/voices/${VOICE_ID}`);

        const back = await screen.findByRole('button', { name: /voices/i });
        await user.click(back);

        await waitFor(() => {
            expect(screen.getByTestId('voices-page')).toBeInTheDocument();
        });
    });

    it('marks the "Ready" step as active for a ready profile', async () => {
        renderAtPath(`/voices/${VOICE_ID}`);
        await waitFor(() => {
            // aria-current="step" should be on the last (Ready) step
            const activeStep = screen.getByRole('listitem', { current: 'step' });
            expect(activeStep.textContent).toMatch(/Ready/);
        });
    });

    it('redirects to /voices for an unknown voice id', async () => {
        (api.listVoicesWithMetadata as ReturnType<typeof vi.fn>).mockResolvedValue([mockMetadata]);

        render(
            <MemoryRouter initialEntries={['/voices/does-not-exist']}>
                <Routes>
                    <Route path="/voices" element={<div data-testid="voices-page">Voices page</div>} />
                    <Route
                        path="/voices/:id"
                        element={
                            <Suspense fallback={<div>Loading</div>}>
                                <VoiceLabPage
                                    speakerProfiles={[mockReadyProfile]}
                                    engines={mockEngines}
                                    jobs={{}}
                                    testProgress={{}}
                                    onRefresh={vi.fn()}
                                />
                            </Suspense>
                        }
                    />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('voices-page')).toBeInTheDocument();
        });
    });

    it('opens MetadataEditorModal when "Edit metadata" is clicked', async () => {
        const user = userEvent.setup();
        renderAtPath(`/voices/${VOICE_ID}`);

        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        const editBtn = screen.getByRole('button', { name: /edit metadata/i });
        await user.click(editBtn);

        // MetadataEditorModal renders a dialog element with role="dialog"
        await waitFor(() => {
            const dialog = screen.getByRole('dialog');
            expect(dialog).toBeInTheDocument();
        });
    });

    it('opens the real Publish to Hugging Face flow (not a decorative placeholder)', async () => {
        const user = userEvent.setup();
        renderAtPath(`/voices/${VOICE_ID}`);

        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        expect(screen.queryByText('planned')).toBeNull();

        const publishBtn = screen.getByRole('button', { name: /publish to hugging face/i });
        expect(publishBtn.tagName).toBe('BUTTON');
        expect(publishBtn).not.toBeDisabled();
        await user.click(publishBtn);

        await waitFor(() => {
            expect(screen.getByRole('dialog', { name: /publish to hugging face/i })).toBeInTheDocument();
        });
        expect(screen.getByLabelText('Hugging Face repo')).toBeInTheDocument();
    });

    it('renders section placeholders (samples, variants, test)', async () => {
        renderAtPath(`/voices/${VOICE_ID}`);
        await waitFor(() => {
            expect(screen.getByTestId('samples-section')).toBeInTheDocument();
            expect(screen.getByTestId('variants-section')).toBeInTheDocument();
            expect(screen.getByTestId('test-section')).toBeInTheDocument();
        });
    });

    // ---------------------------------------------------------------------------
    // Mobile tag-pill wall — HIG review item 4a
    // ---------------------------------------------------------------------------
    describe('attribute pill row at mobile width', () => {
        const manyTagsMetadata: VoiceMetadata = {
            ...mockMetadata,
            tags: ['warm', 'bright', 'calm', 'clear', 'soft', 'deep', 'raspy', 'gentle', 'crisp', 'smooth'],
        };

        function setWindowWidth(width: number) {
            Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
            window.dispatchEvent(new Event('resize'));
        }

        afterEach(() => {
            setWindowWidth(1024);
        });

        it('caps the pill row with a "+N" expandable toggle at mobile width (375px)', async () => {
            setWindowWidth(375);
            renderAtPath(`/voices/${VOICE_ID}`, VOICE_ID, [manyTagsMetadata]);
            await waitFor(() => {
                expect(screen.getByText('Aria Nova')).toBeInTheDocument();
            });
            await waitFor(() => {
                expect(screen.getByRole('button', { name: /Show \d+ more attributes/ })).toBeInTheDocument();
            });
        });

        it('does not cap the pill row on desktop width', async () => {
            setWindowWidth(1200);
            renderAtPath(`/voices/${VOICE_ID}`, VOICE_ID, [manyTagsMetadata]);
            await waitFor(() => {
                expect(screen.getByText('Aria Nova')).toBeInTheDocument();
            });
            expect(screen.queryByRole('button', { name: /Show \d+ more attributes/ })).not.toBeInTheDocument();
        });
    });
});
