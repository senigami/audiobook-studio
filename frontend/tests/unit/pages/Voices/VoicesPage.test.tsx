import React, { useState } from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { VoicesTab, resolveEditingVoiceMetadata } from '@/pages/Voices/VoicesPage'
import { NarratorCard } from '@/pages/Voices/components/NarratorCard'
import { ScriptEditor } from '@/pages/Voices/components/ScriptEditor'
import { describe, it, expect, vi } from 'vitest'
import type { Speaker, SpeakerProfile, VoiceMetadata, TtsEngine } from '@/types'

// ---------------------------------------------------------------------------
// Mock framer-motion so catalog-card and NarratorCard animations work in JSDOM
// ---------------------------------------------------------------------------
vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
        span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}))

describe('VoicesTab', () => {
    const mockProfiles: any = [
        { name: 'Narrator1', wav_count: 5, speed: 1.0, is_default: false, preview_url: null, speaker_id: null, variant_name: null, engine: 'xtts' },
        { name: 'Narrator2', wav_count: 3, speed: 1.2, is_default: true, preview_url: '/preview.wav', speaker_id: null, variant_name: null, engine: 'voxtral' }
    ]

    const mockProps = {
        onRefresh: vi.fn(),
        speakerProfiles: mockProfiles,
        testProgress: {},
        settings: { safe_mode: true, make_mp3: false, default_engine: 'xtts', mistral_api_key: 'key', voxtral_enabled: true } as any,
        engines: [
            { engine_id: 'xtts', enabled: true, verified: true, status: 'ready', display_name: 'XTTS' },
            { engine_id: 'voxtral', enabled: true, verified: true, status: 'ready', display_name: 'Voxtral' }
        ] as any
    }

    beforeEach(() => {
        vi.clearAllMocks()
        global.fetch = vi.fn((url: string) => {
            if (url === '/api/speakers') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) })
        }) as any
    })

    it('renders all narrator profiles', async () => {
        await act(async () => {
            render(<MemoryRouter><VoicesTab {...mockProps} /></MemoryRouter>)
        })
        // Voice names appear in catalog cards
        expect(screen.getByText('Narrator1')).toBeInTheDocument()
        expect(screen.getByText('Narrator2')).toBeInTheDocument()
        // Engine filter chips appear in VoicesTabHeader
        expect(screen.getByText('XTTS (1)')).toBeInTheDocument()
        expect(screen.getByText('Voxtral (1)')).toBeInTheDocument()
    })

    it('shows the default narrator pill', async () => {
        await act(async () => {
            render(<MemoryRouter><VoicesTab {...mockProps} /></MemoryRouter>)
        })

        // Narrator2 has is_default=true — VoiceCatalogCard renders a "★ default" badge
        // with aria-label="Default voice"
        expect(screen.getByLabelText('Default voice')).toBeInTheDocument()
    })

    it('opens profile details and allows building voice', async () => {
        render(<MemoryRouter><VoicesTab {...mockProps} /></MemoryRouter>)

        // Narrator1: wav_count=5, no preview_url → phase 'build' → CTA "Build voice"
        // The CTA button is always visible on the catalog card without requiring expansion
        const buildBtn = await screen.findByText('Build voice')
        expect(buildBtn).toBeInTheDocument()
    })

    it('shows delete option in ActionMenu', async () => {
        render(<MemoryRouter><VoicesTab {...mockProps} /></MemoryRouter>)

        // VoiceCatalogCard renders ActionMenu with aria-label="More actions"
        const actionMenus = await screen.findAllByRole('button', { name: /more actions/i })
        fireEvent.click(actionMenus[0])

        expect(screen.getByText('Delete Voice (all variants)')).toBeInTheDocument()
    })

    it('refreshes the full voice state after renaming an unassigned voice', async () => {
        const onRefresh = vi.fn().mockResolvedValue(undefined)
        global.fetch = vi.fn((url: string) => {
            if (url === '/api/speakers') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
            }
            if (url === '/api/speaker-profiles/Narrator1/rename') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok', new_name: 'Narrator Renamed' }) })
            }
            if (url === '/api/home') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) })
        }) as any

        await act(async () => {
            render(<MemoryRouter><VoicesTab {...mockProps} onRefresh={onRefresh} /></MemoryRouter>)
        })

        fireEvent.click((await screen.findAllByRole('button', { name: /more actions/i }))[0])
        fireEvent.click(await screen.findByText('Rename Voice'))

        const input = screen.getByPlaceholderText('e.g. Victor the Vampire')
        fireEvent.change(input, { target: { value: 'Narrator Renamed' } })
        fireEvent.click(screen.getByText('Rename Voice'))

        await waitFor(() => {
            expect(onRefresh).toHaveBeenCalled()
        })
    })

    it('saves imported base variant labels as metadata instead of renaming the whole voice', async () => {
        // The "Edit Preview Script" path now lives in NarratorCard → VariantEditor → ScriptEditor chain.
        // We render that chain directly here since VoicesTab's catalog cards (R5-T3) no longer
        // expose this flow — it was moved to Voice Lab (R5-T5). This preserves the behavioral
        // contract (variant-name endpoint, not rename) while adapting to the new architecture.
        const onRefresh = vi.fn().mockResolvedValue(undefined)
        const fetchMock = vi.fn((url: string) => {
            if (url === '/api/speaker-profiles/Woman/test-text') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) })
            }
            if (url === '/api/speaker-profiles/Woman/variant-name') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok', variant_name: 'Kiwi' }) })
            }
            if (url === '/api/home') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) })
        })
        global.fetch = fetchMock as any

        const importedProfile: SpeakerProfile = {
            name: 'Woman',
            wav_count: 3,
            speed: 1.0,
            is_default: true,
            preview_url: null,
            speaker_id: 'speaker-1',
            variant_name: 'New Zealand',
            engine: 'xtts',
            test_text: 'Original script',
        } as any

        const mockSpeaker: Speaker = {
            id: 'speaker-1',
            name: 'Woman',
            default_profile_name: 'Woman',
            created_at: Date.now(),
            updated_at: Date.now(),
        }

        const mockEngines: TtsEngine[] = [
            { engine_id: 'xtts', display_name: 'XTTS', enabled: true, verified: true, status: 'ready' } as any
        ]

        // Minimal wrapper that wires NarratorCard's onEditTestText into a ScriptEditor modal,
        // mirroring the VoicesTab state chain (state.setEditingProfile → VoicesModals).
        function NarratorWithScriptEditor() {
            const [editingProfile, setEditingProfile] = useState<SpeakerProfile | null>(null)
            const [variantName, setVariantName] = useState('')

            const handleEditTestText = (profile: SpeakerProfile) => {
                setEditingProfile(profile)
                setVariantName(profile.variant_name || '')
            }

            const handleSave = async () => {
                if (!editingProfile) return
                const isImported = Boolean(editingProfile.speaker_id)
                if (isImported) {
                    // Mirrors useVoicesTabActions.handleSaveTestText: imported voices
                    // update variant-name metadata rather than renaming
                    await fetch(`/api/speaker-profiles/${encodeURIComponent(editingProfile.name)}/variant-name`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ variant_name: variantName }),
                    })
                } else {
                    await fetch(`/api/speaker-profiles/${encodeURIComponent(editingProfile.name)}/test-text`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ test_text: editingProfile.test_text }),
                    })
                }
                onRefresh()
                setEditingProfile(null)
            }

            return (
                <>
                    <NarratorCard
                        speaker={mockSpeaker}
                        profiles={[importedProfile]}
                        onRefresh={onRefresh}
                        onTest={vi.fn()}
                        onDelete={vi.fn()}
                        onMoveVariant={vi.fn()}
                        onEditTestText={handleEditTestText}
                        onBuildNow={vi.fn()}
                        testProgress={{}}
                        requestConfirm={vi.fn()}
                        buildingProfiles={{}}
                        onAddVariantClick={vi.fn()}
                        onSetDefaultClick={vi.fn()}
                        onRenameClick={vi.fn()}
                        isExpanded={true}
                        onToggleExpand={vi.fn()}
                        engines={mockEngines}
                    />
                    {editingProfile && (
                        <ScriptEditor
                            variantName={variantName}
                            onVariantNameChange={setVariantName}
                            engine={editingProfile.engine || 'xtts'}
                            onEngineChange={vi.fn()}
                            engines={mockEngines}
                            testText={editingProfile.test_text || ''}
                            onTestTextChange={vi.fn()}
                            referenceSample=""
                            onReferenceSampleChange={vi.fn()}
                            availableSamples={[]}
                            engineVoiceId=""
                            onEngineVoiceIdChange={vi.fn()}
                            settings={{}}
                            onSettingsChange={vi.fn()}
                            onResetTestText={vi.fn()}
                            onSave={handleSave}
                            isSaving={false}
                        />
                    )}
                </>
            )
        }

        await act(async () => {
            render(<NarratorWithScriptEditor />)
        })

        fireEvent.click(await screen.findByTitle('Edit Preview Script'))

        const input = screen.getByDisplayValue('New Zealand')
        expect(input).not.toBeDisabled()
        fireEvent.change(input, { target: { value: 'Kiwi' } })
        fireEvent.click(screen.getByText('Save Script'))

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                '/api/speaker-profiles/Woman/variant-name',
                expect.objectContaining({ method: 'POST' })
            )
        })

        expect(fetchMock).not.toHaveBeenCalledWith(
            '/api/speaker-profiles/Woman/rename',
            expect.anything()
        )
        expect(onRefresh).toHaveBeenCalled()
    })

    it('wires the catalog card "Edit Recording Script" action to open the Script Editor drawer', async () => {
        // Regression: onEditTestText was declared in VoicesTabContentProps but never
        // destructured/forwarded to VoiceCatalogCard, and VoiceCatalogCard had no menu
        // item to trigger it — making the Script Editor drawer unreachable from the
        // live Voices catalog. This exercises the full path: catalog card action menu
        // → state.setEditingProfile → VoicesModals → ScriptEditor drawer.
        await act(async () => {
            render(<MemoryRouter><VoicesTab {...mockProps} /></MemoryRouter>)
        })

        const actionMenus = await screen.findAllByRole('button', { name: /more actions/i })
        fireEvent.click(actionMenus[0])
        fireEvent.click(await screen.findByText('Edit Recording Script'))

        expect(await screen.findByText('Suggest from voice qualities')).toBeInTheDocument()
    })

    it('wires the catalog card "Voice Settings" action to open the standalone Voice Settings drawer (not the Script Editor)', async () => {
        // Phase 12 backlog: per-voice plugin settings were relocated out of the Script
        // Editor drawer into their own drawer, reached via a distinct "Voice Settings"
        // action menu item. This exercises the full path: catalog card action menu
        // → state.setEditingProfile/setIsVoiceSettingsOpen → VoicesModals → VoiceSettingsPanel drawer.
        await act(async () => {
            render(<MemoryRouter><VoicesTab {...mockProps} /></MemoryRouter>)
        })

        const actionMenus = await screen.findAllByRole('button', { name: /more actions/i })
        fireEvent.click(actionMenus[0])
        fireEvent.click(await screen.findByText('Voice Settings'))

        expect(await screen.findByText(/Voice Settings:/)).toBeInTheDocument()
        expect(screen.queryByText('Suggest from voice qualities')).not.toBeInTheDocument()
    })

    it('filters voices by engine', async () => {
        await act(async () => {
            render(<MemoryRouter><VoicesTab {...mockProps} /></MemoryRouter>)
        })

        fireEvent.click(screen.getByText('Voxtral (1)'))

        expect(screen.queryByText('Narrator1')).not.toBeInTheDocument()
        expect(screen.getByText('Narrator2')).toBeInTheDocument()
    })

    it('hides disabled Voxtral voices while keeping enabled XTTS voices visible', async () => {
        await act(async () => {
            render(<MemoryRouter><VoicesTab {...mockProps} engines={[
                { engine_id: 'xtts', enabled: true, verified: true, status: 'ready', display_name: 'XTTS' },
                { engine_id: 'voxtral', enabled: false, verified: true, status: 'needs_setup', display_name: 'Voxtral' }
            ] as any} /></MemoryRouter>)
        })

        // Active voices: only Narrator1 (xtts enabled); Narrator2 moved to disabled pool
        expect(screen.getByText('Narrator1')).toBeInTheDocument()
        expect(screen.queryByText('Narrator2')).not.toBeInTheDocument()
        // Engine filter chips reflect the disabled pool
        expect(screen.getByText('Disabled (1)')).toBeInTheDocument()
        expect(screen.queryByText('Voxtral (1)')).not.toBeInTheDocument()
        expect(screen.getByText('XTTS (1)')).toBeInTheDocument()
    })

    it('shows no voices when all engines are disabled', async () => {
        await act(async () => {
            render(<MemoryRouter><VoicesTab {...mockProps} engines={[
                { engine_id: 'xtts', enabled: false, verified: true, status: 'needs_setup', display_name: 'XTTS' },
                { engine_id: 'voxtral', enabled: false, verified: true, status: 'needs_setup', display_name: 'Voxtral' }
            ] as any} /></MemoryRouter>)
        })

        expect(screen.queryByText('Narrator1')).not.toBeInTheDocument()
        expect(screen.queryByText('Narrator2')).not.toBeInTheDocument()
        expect(screen.getByText('All (0)')).toBeInTheDocument()
        expect(screen.getByText('Disabled (2)')).toBeInTheDocument()
    })

    it('shows disabled voices on the disabled tab', async () => {
        await act(async () => {
            render(<MemoryRouter><VoicesTab {...mockProps} engines={[
                { engine_id: 'xtts', enabled: true, verified: true, status: 'ready', display_name: 'XTTS' },
                { engine_id: 'voxtral', enabled: false, verified: true, status: 'needs_setup', display_name: 'Voxtral' }
            ] as any} /></MemoryRouter>)
        })

        fireEvent.click(screen.getByText('Disabled (1)'))

        // Narrator2 (voxtral, disabled engine) appears on the disabled tab
        expect(screen.queryByText('Narrator1')).not.toBeInTheDocument()
        expect(screen.getByText('Narrator2')).toBeInTheDocument()
    })

    it('uses the first ready engine as default when adding a variant if profile has no engine', async () => {
        // The create-voice modal (New Voice button) uses the same firstReadyEngine default as
        // add-variant. Test that with only 'custom-engine' available, the modal selects it —
        // not the hardcoded 'xtts' fallback.
        const engines = [
            { engine_id: 'custom-engine', enabled: true, verified: true, status: 'ready', display_name: 'Custom' }
        ] as any

        await act(async () => {
            render(<MemoryRouter><VoicesTab {...mockProps} engines={engines} speakerProfiles={[{ ...mockProfiles[0], engine: null }]} /></MemoryRouter>)
        })

        // Open the "New Voice" modal — it uses newVoiceEngine from useVoicesTabState
        const newVoiceBtn = await screen.findByRole('button', { name: 'New Voice' })
        fireEvent.click(newVoiceBtn)

        // The engine select in the New Voice modal should default to 'custom-engine'
        const engineSelect = await screen.findByLabelText(/ENGINE/i) as HTMLSelectElement
        expect(engineSelect.value).toBe('custom-engine')
        expect(engineSelect.value).not.toBe('xtts')
    })
})

describe('resolveEditingVoiceMetadata', () => {
    // Regression for the bug where editingVoiceMetadata matched
    // `group.profiles.includes(editingProfile)` by object identity. Any
    // refetchHome() elsewhere in the app (e.g. an unrelated job_completed
    // websocket event) replaces `speakerProfiles` — and therefore the
    // `voiceGroups` built from it — with brand-new object references, which
    // silently broke the "Suggest from voice qualities" button even though
    // the voice was still fully tagged.
    const makeProfile = (): SpeakerProfile => ({
        name: 'Woman',
        wav_count: 3,
        speed: 1.0,
        is_default: true,
        preview_url: null,
        speaker_id: 'speaker-1',
        variant_name: 'New Zealand',
        engine: 'xtts',
        test_text: 'Original script',
    } as any)

    const taggedMetadata: VoiceMetadata = {
        id: 'speaker-1',
        name: 'Woman',
        is_untagged: false,
        attributes: { class: 'human', gender: 'feminine', age: 'adult', pace: 'moderate' },
    }

    it('resolves metadata even when the voice group array has been rebuilt with new-but-equivalent object references', () => {
        const staleEditingProfile = makeProfile()
        const staleGroup = { id: 'speaker-1', name: 'Woman', profiles: [staleEditingProfile] }

        // Sanity check: resolves fine against the group that actually contains
        // the referentially-identical profile.
        expect(
            resolveEditingVoiceMetadata(staleEditingProfile, [staleGroup], new Map([['speaker-1', taggedMetadata]]), [])
        ).toEqual(taggedMetadata)

        // Now simulate refetchHome(): a brand-new profile object/array (same
        // `name`/`speaker_id` values, different references) replaces the group
        // this profile lives in, while `editingProfile` still points at the
        // old (stale) reference.
        const rebuiltGroup = { id: 'speaker-1', name: 'Woman', profiles: [makeProfile()] }
        expect(staleEditingProfile).not.toBe(rebuiltGroup.profiles[0])

        expect(
            resolveEditingVoiceMetadata(staleEditingProfile, [rebuiltGroup], new Map([['speaker-1', taggedMetadata]]), [])
        ).toEqual(taggedMetadata)
    })

    it('returns undefined when there is no editing profile', () => {
        expect(resolveEditingVoiceMetadata(null, [], new Map(), [])).toBeUndefined()
    })

    it('returns undefined when no voice group contains a profile with the matching name', () => {
        const editingProfile = makeProfile()
        const unrelatedGroup = { id: 'speaker-2', name: 'Other', profiles: [{ ...editingProfile, name: 'SomeoneElse' }] }
        expect(
            resolveEditingVoiceMetadata(editingProfile, [unrelatedGroup], new Map([['speaker-1', taggedMetadata]]), [])
        ).toBeUndefined()
    })

    it('falls back to name-based metadata lookup when the group id is not in the metadata map', () => {
        const editingProfile = makeProfile()
        const group = { id: 'speaker-1', name: 'Woman', profiles: [editingProfile] }
        expect(
            resolveEditingVoiceMetadata(editingProfile, [group], new Map(), [taggedMetadata])
        ).toEqual(taggedMetadata)
    })
})
