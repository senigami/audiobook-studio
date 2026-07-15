/**
 * VariantsTabRebuild.test.tsx — task 004 (voice-card-consolidation, P4)
 *
 * R3 acceptance: variant rebuild must genuinely work end-to-end from the
 * Variants tab, not merely forward a caller-supplied callback prop. This
 * exercises `VoiceLabPage`'s real `VariantsTab` call site (real
 * `useVoiceManagement` wiring, not a mocked hook) and asserts an
 * *observable real effect*:
 *   1. clicking "Rebuild" fires the actual build-triggering API call
 *      (`POST /api/speaker-profiles/:name/build`) with the correct
 *      `speaker_id`/`variant_name` form fields, and
 *   2. the UI transitions to the real "building" state ("Rebuilding...")
 *      driven by `buildingProfiles`, not a stub that's always `{}`.
 *
 * R1 revert-check (see task 004 completion report): this test was run
 * against the pre-fix stubbed call site (`buildingProfiles={{}}`,
 * `onBuildNow={async () => false}`, `requestConfirm={() => undefined}`)
 * and failed for the right reason (no fetch call observed, button never
 * showed "Rebuilding...") before the real wiring landed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React, { Suspense } from 'react';
import { VoiceLabPage } from '@/pages/VoiceLab/VoiceLabPage';
import type { SpeakerProfile, TtsEngine, VoiceMetadata } from '@/types';

vi.mock('@/api', () => ({
    api: {
        listVoicesWithMetadata: vi.fn(),
        exportVoiceBundleUrl: vi.fn().mockReturnValue('/api/voices/test/bundle/download'),
        uploadHfVoice: vi.fn(),
        patchVoiceMetadata: vi.fn(),
    },
}));

import { api } from '@/api';

const VOICE_ID = 'voice-abc-123';

const mockMetadata: VoiceMetadata = {
    id: VOICE_ID,
    name: 'Aria Nova',
    description: 'A warm, expressive narrator voice.',
    attributes: { class: 'human', gender: 'feminine', age: 'adult' },
    is_untagged: false,
};

const mockProfile: SpeakerProfile = {
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
    samples: ['1.wav'],
    samples_detailed: [{ name: '1.wav', is_new: false }],
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

function renderVoiceLab() {
    (api.listVoicesWithMetadata as ReturnType<typeof vi.fn>).mockResolvedValue([mockMetadata]);

    return render(
        <MemoryRouter initialEntries={[`/voices/${VOICE_ID}`]}>
            <Routes>
                <Route path="/voices" element={<div>Voices page</div>} />
                <Route
                    path="/voices/:id"
                    element={
                        <Suspense fallback={<div>Loading</div>}>
                            <VoiceLabPage
                                speakerProfiles={[mockProfile]}
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

describe('VoiceLabPage Variants tab — real rebuild wiring (R3)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ job_id: 'job-1' }),
        }));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fires the real build API call with the correct speaker_id/variant_name on Rebuild click', async () => {
        const user = userEvent.setup();
        renderVoiceLab();

        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('tab', { name: 'Variants' }));

        // Rebuild is now consolidated into the per-variant ActionMenu overflow
        // (task 009 chrome demotion) — open it first, then click the item.
        await user.click(await screen.findByTitle('More actions'));
        const rebuildBtn = await screen.findByRole('button', { name: 'Rebuild' });
        await user.click(rebuildBtn);

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                `/api/speaker-profiles/${encodeURIComponent(mockProfile.name)}/build`,
                expect.objectContaining({ method: 'POST' })
            );
        });

        const call = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
            ([url]) => url === `/api/speaker-profiles/${encodeURIComponent(mockProfile.name)}/build`
        );
        const formData = call?.[1]?.body as FormData;
        expect(formData.get('speaker_id')).toBe(mockProfile.speaker_id);
        expect(formData.get('variant_name')).toBe(mockProfile.variant_name);
    });

    it('makes Voice Settings reachable and functional directly from the Variants tab (no overflow menu)', async () => {
        const user = userEvent.setup();

        // Give the fixture engine a real settings_schema/synthesis_settings so
        // VoiceSettingsPanel renders its JsonSchemaForm instead of the "no
        // settings" copy.
        const enginesWithSettings: TtsEngine[] = [
            {
                ...mockEngines[0],
                settings_schema: {
                    type: 'object',
                    properties: {
                        temperature: { type: 'number', title: 'Temperature', default: 0.7 },
                    },
                },
                behavior: { synthesis_settings: ['temperature'] },
            },
        ];
        (api.listVoicesWithMetadata as ReturnType<typeof vi.fn>).mockResolvedValue([mockMetadata]);

        render(
            <MemoryRouter initialEntries={[`/voices/${VOICE_ID}`]}>
                <Routes>
                    <Route path="/voices" element={<div>Voices page</div>} />
                    <Route
                        path="/voices/:id"
                        element={
                            <Suspense fallback={<div>Loading</div>}>
                                <VoiceLabPage
                                    speakerProfiles={[mockProfile]}
                                    engines={enginesWithSettings}
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
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        // Reachable directly -- no overflow/action menu click required, just
        // the Variants tab itself.
        await user.click(screen.getByRole('tab', { name: 'Variants' }));

        expect(screen.getByText('Voice Settings')).toBeInTheDocument();
        const saveBtn = screen.getByRole('button', { name: /save voice settings/i });
        expect(saveBtn).toBeInTheDocument();

        await user.click(saveBtn);

        // Functional: saving fires the real settings-update API call for the
        // default variant's profile name.
        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                `/api/speaker-profiles/${encodeURIComponent(mockProfile.name)}/settings`,
                expect.objectContaining({ method: 'POST' })
            );
        });
    });

    it('transitions the Rebuild button to the real building state after a successful build call', async () => {
        const user = userEvent.setup();
        renderVoiceLab();

        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('tab', { name: 'Variants' }));

        // Rebuild is now consolidated into the per-variant ActionMenu overflow
        // (task 009 chrome demotion) — open it first, then click the item.
        await user.click(await screen.findByTitle('More actions'));
        const rebuildBtn = await screen.findByRole('button', { name: 'Rebuild' });
        await user.click(rebuildBtn);

        // Observable real effect: the button's own building state (backed by
        // `buildingProfiles`, tracked from the real job id returned by the
        // build call) flips to "Rebuilding...", not a stub that's always {}.
        // The menu closes on selection, so reopen it to observe the item's label.
        await user.click(await screen.findByTitle('More actions'));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Rebuilding/i })).toBeInTheDocument();
        });
    });
});
