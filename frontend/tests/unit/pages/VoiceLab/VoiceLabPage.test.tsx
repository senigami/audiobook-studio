/**
 * VoiceLabPage.test.tsx — R5-T5
 *
 * Tests:
 * - Route renders for a fixture voice (stepper, name, back link)
 * - Stepper marks the correct phase from fixture profiles
 * - Unknown id redirects to /voices
 * - Overview tab renders metadata fields inline, no edit-metadata modal
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
        patchVoiceMetadata: vi.fn(),
    },
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

function renderAtPath(
    path: string,
    id: string = VOICE_ID,
    metadataList: VoiceMetadata[] = [mockMetadata],
    profiles: SpeakerProfile[] = [mockReadyProfile],
) {
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
                                speakerProfiles={profiles}
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

    it('renders inline, always-editable metadata fields in the Overview tab (no modal)', async () => {
        renderAtPath(`/voices/${VOICE_ID}`);

        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        // Overview is the default active tabpanel -- its fields (description,
        // Save button) are visible without any trigger click, and there is
        // no modal dialog to open anymore.
        expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /edit metadata/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

    it('renders the voice detail tabs (Overview/Samples/Variants/Test)', async () => {
        renderAtPath(`/voices/${VOICE_ID}`);
        await waitFor(() => {
            expect(screen.getByRole('tablist', { name: 'Voice management' })).toBeInTheDocument();
        });
        expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Samples' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Variants' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Test' })).toBeInTheDocument();
        // Overview is real, inline metadata content as of task 002 (no more
        // "coming soon" placeholder) -- assert its description field instead.
        expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    });

    it('keeps the status strip visible after switching tabs (INV-VC-4)', async () => {
        const user = userEvent.setup();
        const { container } = renderAtPath(`/voices/${VOICE_ID}`);
        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        // Status strip shows the fixture's one variant ("Default"). Scoped to the
        // header's status strip (not `screen`) since task 004's real Variants tab
        // content also renders a "Default" variant row once that tab is active.
        const statusStrip = container.querySelector('.voice-detail-header__status-strip');
        expect(statusStrip).not.toBeNull();
        expect(statusStrip).toHaveTextContent('Default');

        await user.click(screen.getByRole('tab', { name: 'Variants' }));

        expect(screen.getByRole('tab', { name: 'Variants' })).toHaveAttribute('aria-selected', 'true');
        // Status strip content is still present -- it lives in the header, not a tabpanel
        expect(statusStrip).toHaveTextContent('Default');
    });

    // ---------------------------------------------------------------------------
    // Test tab — task 005 (TestSection relocated, ScriptEditor folded in)
    // ---------------------------------------------------------------------------
    it('renders TestSection + the folded-in ScriptEditor content under the Test tab', async () => {
        const user = userEvent.setup();
        renderAtPath(`/voices/${VOICE_ID}`);
        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('tab', { name: 'Test' }));

        // TestSection content (variant/generate-test controls)
        expect(screen.getByLabelText('Test variant')).toBeInTheDocument();
        // Folded-in ScriptEditor content (was previously only reachable via a
        // separate drawer) -- variant name field + "Suggest from voice qualities".
        expect(screen.getByText(/Changing the variant label updates/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Suggest from voice qualities/i })).toBeInTheDocument();
        // No more separate "Edit preview script" link now that it's inline.
        expect(screen.queryByText(/Edit preview script/i)).not.toBeInTheDocument();
    });

    it('switches to the Test tab when the Variants tab\'s "Script" button is clicked, instead of opening a drawer', async () => {
        const user = userEvent.setup();
        renderAtPath(`/voices/${VOICE_ID}`);
        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('tab', { name: 'Variants' }));
        // Script is now consolidated into the per-variant ActionMenu overflow
        // (task 009 chrome demotion) — open it first, then click the item.
        await user.click(await screen.findByTitle('More actions'));
        await user.click(screen.getByRole('button', { name: /^Script$/i }));

        expect(screen.getByRole('tab', { name: 'Test' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('button', { name: /Suggest from voice qualities/i })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('operates on the selected variant\'s own test text, not a sibling\'s (INV-WRITE-1)', async () => {
        const variantB: SpeakerProfile = {
            ...mockReadyProfile,
            name: 'Aria Nova - Angry',
            variant_name: 'Angry',
            is_default: false,
            test_text: 'Angry variant script',
        };
        const variantAWithText: SpeakerProfile = { ...mockReadyProfile, test_text: 'Default variant script' };

        const user = userEvent.setup();
        renderAtPath(`/voices/${VOICE_ID}`, VOICE_ID, [mockMetadata], [variantAWithText, variantB]);
        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('tab', { name: 'Test' }));

        // Defaults to variant A's own test text, shown in the folded-in
        // ScriptEditor's "preview text script" textarea (scoped by class since
        // TestSection's own separate "Test script" input shares the same seed
        // value and would otherwise create an ambiguous match).
        const getScriptEditorTextarea = () =>
            document.querySelector('.script-editor-textarea') as HTMLTextAreaElement;
        expect(getScriptEditorTextarea()).toHaveValue('Default variant script');

        // Selecting variant B in the "Test variant" dropdown switches the folded-in
        // ScriptEditor to variant B's own test text -- not A's, and not a blend.
        await user.selectOptions(screen.getByLabelText('Test variant'), variantB.name);

        expect(getScriptEditorTextarea()).toHaveValue('Angry variant script');
    });

    // ---------------------------------------------------------------------------
    // Test tab preselects the switcher's active variant — task 013
    // ---------------------------------------------------------------------------
    it('preselects the variant that was active in the switcher when Script is activated', async () => {
        const variantB: SpeakerProfile = {
            ...mockReadyProfile,
            name: 'Aria Nova - Angry',
            variant_name: 'Angry',
            is_default: false,
            test_text: 'Angry variant script',
        };
        const variantAWithText: SpeakerProfile = { ...mockReadyProfile, test_text: 'Default variant script' };

        const user = userEvent.setup();
        renderAtPath(`/voices/${VOICE_ID}`, VOICE_ID, [mockMetadata], [variantAWithText, variantB]);
        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('tab', { name: 'Variants' }));

        // Select variant B ("Angry") in the switcher before activating Script.
        await user.click(await screen.findByRole('tab', { name: /Angry/ }));

        // Script is consolidated into the per-variant ActionMenu overflow (task 009).
        await user.click(await screen.findByTitle('More actions'));
        await user.click(screen.getByRole('button', { name: /^Script$/i }));

        expect(screen.getByRole('tab', { name: 'Test' })).toHaveAttribute('aria-selected', 'true');

        const getScriptEditorTextarea = () =>
            document.querySelector('.script-editor-textarea') as HTMLTextAreaElement;
        // Lands on variant B's own test text, not A's (and not a default/first variant).
        expect(getScriptEditorTextarea()).toHaveValue('Angry variant script');
        expect(screen.getByLabelText('Test variant')).toHaveValue(variantB.name);
    });

    it('defaults the Test tab to the default variant when reached directly (not via Script) — no regression', async () => {
        const variantB: SpeakerProfile = {
            ...mockReadyProfile,
            name: 'Aria Nova - Angry',
            variant_name: 'Angry',
            is_default: false,
            test_text: 'Angry variant script',
        };
        const variantAWithText: SpeakerProfile = { ...mockReadyProfile, test_text: 'Default variant script' };

        const user = userEvent.setup();
        renderAtPath(`/voices/${VOICE_ID}`, VOICE_ID, [mockMetadata], [variantAWithText, variantB]);
        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        // Clicking Test directly (never touching the Variants tab/switcher/Script).
        await user.click(screen.getByRole('tab', { name: 'Test' }));

        const getScriptEditorTextarea = () =>
            document.querySelector('.script-editor-textarea') as HTMLTextAreaElement;
        expect(getScriptEditorTextarea()).toHaveValue('Default variant script');
        expect(screen.getByLabelText('Test variant')).toHaveValue(variantAWithText.name);
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
