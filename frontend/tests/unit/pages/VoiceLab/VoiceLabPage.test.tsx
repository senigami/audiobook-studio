/**
 * VoiceLabPage.test.tsx — R5-T5
 *
 * Tests:
 * - Route renders for a fixture voice (stepper, name, back link)
 * - Stepper marks the correct phase from fixture profiles
 * - Unknown id redirects to /voices
 * - Overview disclosure renders metadata fields inline, no edit-metadata modal
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

    it('renders inline, always-editable metadata fields in the Overview disclosure (no modal)', async () => {
        renderAtPath(`/voices/${VOICE_ID}`);

        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        // Overview lives in the "Voice details" disclosure (task 007) --
        // its fields (description, Save button) are present in the DOM
        // (collapsed or not), and there is no modal dialog to open anymore.
        expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /edit metadata/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('defaults the Overview disclosure to collapsed when required metadata fields are already complete (2026-07-15 follow-up)', async () => {
        // mockMetadata has class/gender/age all set -- "complete".
        renderAtPath(`/voices/${VOICE_ID}`);

        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        const summary = screen.getByText('Voice details').closest('summary') as HTMLElement;
        const details = summary.closest('details') as HTMLDetailsElement;
        await waitFor(() => {
            expect(details).not.toHaveAttribute('open');
        });
    });

    it('defaults the Overview disclosure to open when a required metadata field is missing (2026-07-15 follow-up)', async () => {
        const incompleteMetadata: VoiceMetadata = {
            ...mockMetadata,
            attributes: { class: 'human', gender: undefined as any, age: 'adult' },
        };
        renderAtPath(`/voices/${VOICE_ID}`, VOICE_ID, [incompleteMetadata]);

        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        const summary = screen.getByText('Voice details').closest('summary') as HTMLElement;
        const details = summary.closest('details') as HTMLDetailsElement;
        await waitFor(() => {
            expect(details).toHaveAttribute('open');
        });
    });

    it('collapses/expands the Overview disclosure via the native <details> toggle without gating Save on visibility', async () => {
        const user = userEvent.setup();
        const incompleteMetadata: VoiceMetadata = {
            ...mockMetadata,
            attributes: { class: 'human', gender: undefined as any, age: 'adult' },
        };
        renderAtPath(`/voices/${VOICE_ID}`, VOICE_ID, [incompleteMetadata]);

        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        const summary = screen.getByText('Voice details').closest('summary') as HTMLElement;
        const details = summary.closest('details') as HTMLDetailsElement;

        // Open by default here (missing required field) -- fields visible
        // without any trigger click.
        await waitFor(() => {
            expect(details).toHaveAttribute('open');
        });
        expect(screen.getByLabelText(/description/i)).toBeVisible();
        const saveBtnWhenOpen = screen.getByRole('button', { name: /^save$/i });
        const disabledWhenOpen = saveBtnWhenOpen.hasAttribute('disabled');

        // Collapsing hides the fields but doesn't unmount them, and the Save
        // button's enabled/disabled state (driven by OverviewTab's own
        // required-fields gating, untouched by this task) is identical
        // whether the disclosure is open or closed -- toggling visibility
        // isn't itself gating Save.
        await user.click(summary);
        expect(details).not.toHaveAttribute('open');
        const saveBtnWhenClosed = screen.getByRole('button', { name: /^save$/i });
        expect(saveBtnWhenClosed.hasAttribute('disabled')).toBe(disabledWhenOpen);

        // Re-expanding restores visibility.
        await user.click(summary);
        expect(details).toHaveAttribute('open');
        expect(screen.getByLabelText(/description/i)).toBeVisible();
    });

    it('does not force-reopen the Overview disclosure after the user manually collapses it (respects manual toggle)', async () => {
        const user = userEvent.setup();
        // Complete metadata -- defaults collapsed. Manually expand, then
        // trigger a metadata refresh (e.g. a Save) for the SAME voice id
        // and confirm the disclosure stays open (the init effect must not
        // re-fire and fight the user's toggle).
        renderAtPath(`/voices/${VOICE_ID}`);

        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        const summary = screen.getByText('Voice details').closest('summary') as HTMLElement;
        const details = summary.closest('details') as HTMLDetailsElement;

        await waitFor(() => {
            expect(details).not.toHaveAttribute('open');
        });

        await user.click(summary);
        expect(details).toHaveAttribute('open');

        // Simulate a metadata refresh for the same voice (e.g. after Save)
        // by resolving the metadata fetch again with a new object of the
        // same id/completeness.
        (api.patchVoiceMetadata as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockMetadata });
        const saveBtn = screen.getByRole('button', { name: /^save$/i });
        await user.click(saveBtn);

        await waitFor(() => {
            expect(details).toHaveAttribute('open');
        });
    });

    it('opens the real Publish to Hugging Face flow via the header overflow menu (not a decorative placeholder)', async () => {
        const user = userEvent.setup();
        const { container } = renderAtPath(`/voices/${VOICE_ID}`);

        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        expect(screen.queryByText('planned')).toBeNull();

        // H-2 (2026-07-15 follow-up): Publish is now inside the header's
        // single overflow ActionMenu, not a standalone button.
        const headerActions = container.querySelector('.voice-detail-header__actions') as HTMLElement;
        const menuTrigger = within(headerActions).getByRole('button', { name: 'More actions' });
        await user.click(menuTrigger);

        const publishBtn = await screen.findByRole('button', { name: /publish to hugging face/i });
        expect(publishBtn.tagName).toBe('BUTTON');
        expect(publishBtn).not.toBeDisabled();
        await user.click(publishBtn);

        await waitFor(() => {
            expect(screen.getByRole('dialog', { name: /publish to hugging face/i })).toBeInTheDocument();
        });
        expect(screen.getByLabelText('Hugging Face repo')).toBeInTheDocument();
    });

    // ---------------------------------------------------------------------------
    // Header action-row consolidation (H-2) + delete-via-ConfirmModal (H-1)
    // -- 2026-07-15 design-critique follow-up
    // ---------------------------------------------------------------------------
    describe('header overflow menu (2026-07-15 follow-up)', () => {
        function getHeaderMenuTrigger(container: HTMLElement) {
            const headerActions = container.querySelector('.voice-detail-header__actions') as HTMLElement;
            return within(headerActions).getByRole('button', { name: 'More actions' });
        }

        it('does not render Play preview in the header (H-3 partial: dropped, not moved)', async () => {
            renderAtPath(`/voices/${VOICE_ID}`);
            await waitFor(() => {
                expect(screen.getByText('Aria Nova')).toBeInTheDocument();
            });
            expect(screen.queryByRole('button', { name: /play preview/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /pause preview/i })).not.toBeInTheDocument();
        });

        it('folds Set default/Export/Publish/Delete into a single overflow menu instead of 4 separate buttons', async () => {
            const user = userEvent.setup();
            const { container } = renderAtPath(`/voices/${VOICE_ID}`);
            await waitFor(() => {
                expect(screen.getByText('Aria Nova')).toBeInTheDocument();
            });

            // None of these render as standalone top-level buttons any more.
            expect(screen.queryByRole('button', { name: /^set as app default$/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^export bundle/i })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^delete voice$/i })).not.toBeInTheDocument();

            await user.click(getHeaderMenuTrigger(container));

            expect(await screen.findByRole('button', { name: /export bundle/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /publish to hugging face/i })).toBeInTheDocument();
            // Fixture's profile is already the app default, so the menu item
            // renders its "already default" label ("App default") rather than
            // the call-to-action label -- either way it's the same menu item.
            expect(screen.getByRole('button', { name: /app default/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^delete voice$/i })).toBeInTheDocument();
        });

        it('routes voice delete through the themed ConfirmModal, never window.confirm (H-1)', async () => {
            const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
            const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
            const user = userEvent.setup();
            const { container } = renderAtPath(`/voices/${VOICE_ID}`);
            await waitFor(() => {
                expect(screen.getByText('Aria Nova')).toBeInTheDocument();
            });

            await user.click(getHeaderMenuTrigger(container));
            await user.click(await screen.findByRole('button', { name: /^delete voice$/i }));

            // Themed modal appears; native window.confirm is never invoked.
            const dialog = await screen.findByRole('dialog');
            expect(dialog).toHaveTextContent('Aria Nova');
            expect(confirmSpy).not.toHaveBeenCalled();

            const confirmBtn = within(dialog).getByRole('button', { name: /confirm|delete/i });
            await user.click(confirmBtn);

            await waitFor(() => {
                expect(fetchSpy).toHaveBeenCalledWith(
                    expect.stringContaining(`/api/speakers/${VOICE_ID}`),
                    expect.objectContaining({ method: 'DELETE' })
                );
            });
            expect(confirmSpy).not.toHaveBeenCalled();

            confirmSpy.mockRestore();
            fetchSpy.mockRestore();
        });
    });

    it('renders VariantsSection directly below the Overview disclosure -- no tab shell (task 008)', async () => {
        renderAtPath(`/voices/${VOICE_ID}`);
        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });
        // The Samples/Variants/Test tab shell (VoiceDetailTabs) is retired --
        // its "Voice management"-labeled tablist no longer exists. (Note:
        // VariantSwitcher below renders its own, unrelated
        // "<voice> variants"-labeled listbox -- re-modeled from a tablist to
        // a real listbox/option pattern in the 2026-07-15 ARIA fix, see
        // VariantSwitcher.tsx's file header.)
        expect(screen.queryByRole('tablist', { name: 'Voice management' })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Overview' })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Samples' })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /^Variants$/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Test' })).not.toBeInTheDocument();
        // Overview is real, inline metadata content as of task 002 (no more
        // "coming soon" placeholder) -- assert its description field instead.
        expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
        // Variants section renders directly below, with its own switcher tab
        // for the fixture's one profile ("Default").
        expect(screen.getByText('Variants')).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /Default/ })).toBeInTheDocument();
    });

    it('keeps the status strip visible alongside the Variants section (INV-VC-4)', async () => {
        const { container } = renderAtPath(`/voices/${VOICE_ID}`);
        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        // Status strip shows the fixture's one variant ("Default"). Scoped to the
        // header's status strip (not `screen`) since the Variants section below
        // also renders a "Default" variant row.
        const statusStrip = container.querySelector('.voice-detail-header__status-strip');
        expect(statusStrip).not.toBeNull();
        expect(statusStrip).toHaveTextContent('Default');

        // Status strip content lives in the header, unaffected by anything
        // rendered below it (there's no tab to switch to anymore).
        expect(screen.getByText('Variants')).toBeInTheDocument();
        expect(statusStrip).toHaveTextContent('Default');
    });

    // ---------------------------------------------------------------------------
    // Script action — task 008 (retire tabs): routes selection instead of
    // switching tabs (the old Test tab it used to switch to is retired; its
    // content has no new home yet -- that's task 009's job).
    // ---------------------------------------------------------------------------
    it('does not open a drawer or switch to any tab when the Variants section\'s "Script" action is used', async () => {
        const user = userEvent.setup();
        renderAtPath(`/voices/${VOICE_ID}`);
        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        // Script is consolidated into the per-variant ActionMenu overflow
        // (task 009 chrome demotion) — open it first, then click the item.
        await user.click(await screen.findByTitle('More actions'));
        await user.click(screen.getByRole('button', { name: /^Script$/i }));

        // No dead click: no drawer/dialog opens, and no page-level tab shell
        // exists to switch to.
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByRole('tablist', { name: 'Voice management' })).not.toBeInTheDocument();
        // The variant's own editor panel (identified by its still-findable
        // "More actions" trigger) remains mounted -- selection stayed put.
        expect(screen.getByTitle('More actions')).toBeInTheDocument();
    });

    it('keeps the switcher\'s active variant selected when Script is activated from it (no reset to the default)', async () => {
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

        // Select variant B ("Angry") in the switcher before activating Script.
        await user.click(await screen.findByRole('option', { name: /Angry/ }));
        expect(screen.getByRole('option', { name: /Angry/ })).toHaveAttribute('aria-selected', 'true');

        // Script is consolidated into the per-variant ActionMenu overflow (task 009).
        await user.click(await screen.findByTitle('More actions'));
        await user.click(screen.getByRole('button', { name: /^Script$/i }));

        // Still on variant B -- Script routed selection (a no-op here since B
        // was already selected), not a tab switch back to some other default.
        expect(screen.getByRole('option', { name: /Angry/ })).toHaveAttribute('aria-selected', 'true');
    });

    it('defaults the Variants section to the default variant on load (not via Script) — no regression', async () => {
        const variantB: SpeakerProfile = {
            ...mockReadyProfile,
            name: 'Aria Nova - Angry',
            variant_name: 'Angry',
            is_default: false,
            test_text: 'Angry variant script',
        };
        const variantAWithText: SpeakerProfile = {
            ...mockReadyProfile,
            test_text: 'Default variant script',
            is_variant_default: true,
        };

        renderAtPath(`/voices/${VOICE_ID}`, VOICE_ID, [mockMetadata], [variantAWithText, variantB]);
        await waitFor(() => {
            expect(screen.getByText('Aria Nova')).toBeInTheDocument();
        });

        // The default variant ("Default") is selected on load, without ever
        // touching the switcher or the Script action.
        await waitFor(() => {
            expect(screen.getByRole('option', { name: /Default/ })).toHaveAttribute('aria-selected', 'true');
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
