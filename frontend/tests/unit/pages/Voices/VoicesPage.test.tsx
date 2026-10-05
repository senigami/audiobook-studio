import React, { useState } from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { VoicesTab, resolveEditingVoiceMetadata, CLASS_OPTIONS, GENDER_OPTIONS, AGE_OPTIONS } from '@/pages/Voices/VoicesPage'
import rawVoiceTaxonomy from '../../../../../design-docs/specs/voice-taxonomy.json'
import { ScriptEditor } from '@/pages/Voices/components/ScriptEditor'
import { describe, it, expect, vi } from 'vitest'
import type { SpeakerProfile, VoiceMetadata, TtsEngine } from '@/types'

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
    useReducedMotion: () => false,
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

        // Narrator2 has is_default=true — VoiceCatalogCard renders an "App default" badge
        // with aria-label="App default voice"
        expect(screen.getByLabelText('App default voice')).toBeInTheDocument()
    })

    it('opens profile details and allows building voice', async () => {
        render(<MemoryRouter><VoicesTab {...mockProps} /></MemoryRouter>)

        // Narrator1: wav_count=5, no preview_url → phase 'build'. The separate
        // CTA button is retired (2026-07-16) — the avatar play button doubles
        // as Build when the profile isn't built yet (aria-label "Build voice").
        const buildBtn = await screen.findByRole('button', { name: 'Build voice' })
        expect(buildBtn).toBeInTheDocument()
    })

    it('exposes Delete as a reachable overflow-menu item (task 002: consolidated into the kebab)', async () => {
        render(<MemoryRouter><VoicesTab {...mockProps} /></MemoryRouter>)
        const menuTriggers = await screen.findAllByRole('button', { name: /more actions/i })
        fireEvent.click(menuTriggers[0])
        expect(await screen.findByText('Delete')).toBeInTheDocument()
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
        // The "Edit Preview Script" path used to reach `ScriptEditor` via
        // NarratorCard's `onEditTestText` -> a local `editingProfile` toggle
        // (mirroring the retired VoicesTab state chain). voices-variants-round2
        // task 009 moved test-text/engine-config editing in-place into
        // `VariantEditor` itself and dropped `onEditTestText` entirely (there's
        // no separate view to switch to anymore) -- `NarratorCard` no longer
        // drives this at all, and was already dead in production (see
        // VoicesTabContent.tsx's header comment) before this task. This test
        // renders `ScriptEditor` directly instead, preserving the behavioral
        // contract under test (imported voices' variant-name endpoint, not a
        // full rename) without depending on retired plumbing.
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

        const mockEngines: TtsEngine[] = [
            { engine_id: 'xtts', display_name: 'XTTS', enabled: true, verified: true, status: 'ready' } as any
        ]

        // Renders ScriptEditor directly (task 009: no more onEditTestText
        // chain through NarratorCard to reach it) with the same imported-vs-
        // native save branching this test exercises.
        function ScriptEditorHarness() {
            const [variantName, setVariantName] = useState(importedProfile.variant_name || '')

            const handleSave = async () => {
                const isImported = Boolean(importedProfile.speaker_id)
                if (isImported) {
                    // Mirrors useVoicesTabActions.handleSaveTestText: imported voices
                    // update variant-name metadata rather than renaming
                    await fetch(`/api/speaker-profiles/${encodeURIComponent(importedProfile.name)}/variant-name`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ variant_name: variantName }),
                    })
                } else {
                    await fetch(`/api/speaker-profiles/${encodeURIComponent(importedProfile.name)}/test-text`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ test_text: importedProfile.test_text }),
                    })
                }
                onRefresh()
            }

            return (
                <ScriptEditor
                    variantName={variantName}
                    onVariantNameChange={setVariantName}
                    engine={importedProfile.engine || 'xtts'}
                    onEngineChange={vi.fn()}
                    engines={mockEngines}
                    testText={importedProfile.test_text || ''}
                    onTestTextChange={vi.fn()}
                    referenceSample=""
                    onReferenceSampleChange={vi.fn()}
                    availableSamples={[]}
                    engineVoiceId=""
                    onEngineVoiceIdChange={vi.fn()}
                    onResetTestText={vi.fn()}
                    onSave={handleSave}
                    isSaving={false}
                />
            )
        }

        await act(async () => {
            render(<ScriptEditorHarness />)
        })

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

    it('no longer exposes Edit Recording Script/Voice Settings/Edit Metadata/Open in Voice Lab on the catalog card overflow menu (task 006 — relocated to the voice detail page)', async () => {
        await act(async () => {
            render(<MemoryRouter><VoicesTab {...mockProps} /></MemoryRouter>)
        })

        const actionMenus = await screen.findAllByRole('button', { name: /more actions/i })
        fireEvent.click(actionMenus[0])

        expect(screen.queryByText('Edit Recording Script')).not.toBeInTheDocument()
        expect(screen.queryByText('Voice Settings')).not.toBeInTheDocument()
        expect(screen.queryByText('Edit Metadata')).not.toBeInTheDocument()
        expect(screen.queryByText('Open in Voice Lab')).not.toBeInTheDocument()
        expect(screen.queryByText('Delete Voice (all variants)')).not.toBeInTheDocument()
        expect(screen.getByText('Rename Voice')).toBeInTheDocument()
        expect(screen.getByText('Export Voice Bundle')).toBeInTheDocument()
    })

    it('exposes Set as App Default and Delete as overflow-menu items (task 002: consolidated into the kebab, not direct card actions)', async () => {
        await act(async () => {
            render(<MemoryRouter><VoicesTab {...mockProps} /></MemoryRouter>)
        })

        const menuTriggers = await screen.findAllByRole('button', { name: /more actions/i })
        fireEvent.click(menuTriggers[0])
        expect(await screen.findByText('Set as App Default')).toBeInTheDocument()
        expect(await screen.findByText('Delete')).toBeInTheDocument()
    })

    it('filters voices by engine', async () => {
        await act(async () => {
            render(<MemoryRouter><VoicesTab {...mockProps} /></MemoryRouter>)
        })

        fireEvent.click(screen.getByText('Voxtral (1)'))

        expect(screen.queryByText('Narrator1')).not.toBeInTheDocument()
        expect(await screen.findByText('Narrator2')).toBeInTheDocument()
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
        expect(await screen.findByText('Narrator2')).toBeInTheDocument()
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

// ---------------------------------------------------------------------------
// CLASS/GENDER/AGE filter options — task 005: sourced from
// design-docs/specs/voice-taxonomy.json, not the old hand-duplicated subset
// (which was missing the `not-applicable` gender value and had drifted labels).
// ---------------------------------------------------------------------------
describe('CLASS/GENDER/AGE facet options (taxonomy-sourced)', () => {
    const jsonSection = (key: string) => (rawVoiceTaxonomy as any).sections.find((s: any) => s.key === key)

    it('CLASS options match voice-taxonomy.json\'s class section exactly', () => {
        expect(CLASS_OPTIONS).toEqual(jsonSection('class').values)
    })

    it('GENDER options match voice-taxonomy.json\'s gender section exactly, including not-applicable', () => {
        expect(GENDER_OPTIONS).toEqual(jsonSection('gender').values)
        expect(GENDER_OPTIONS).toContainEqual({ id: 'not-applicable', label: 'Not applicable (non-human)' })
    })

    it('AGE options match voice-taxonomy.json\'s age section exactly', () => {
        expect(AGE_OPTIONS).toEqual(jsonSection('age').values)
    })
})
