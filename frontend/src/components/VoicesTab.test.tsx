import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { VoicesTab } from './VoicesTab'
import { describe, it, expect, vi } from 'vitest'

describe('VoicesTab', () => {
    const mockProfiles: any = [
        { name: 'Narrator1', wav_count: 5, speed: 1.0, is_default: false, preview_url: null, speaker_id: null, variant_name: null, engine: 'xtts' },
        { name: 'Narrator2', wav_count: 3, speed: 1.2, is_default: true, preview_url: '/preview.wav', speaker_id: null, variant_name: null, engine: 'voxtral' }
    ]

    const mockProps = {
        onRefresh: vi.fn(),
        speakerProfiles: mockProfiles,
        testProgress: {},
        settings: { safe_mode: true, make_mp3: false, default_engine: 'xtts', mistral_api_key: 'key', voxtral_enabled: true } as any
    }

    beforeEach(() => {
        vi.clearAllMocks()
        // Provide a default empty speakers array for all tests
        global.fetch = vi.fn((url: string) => {
            if (url === '/api/speakers') {
                return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) });
        }) as any
    })

    it('renders all narrator profiles', async () => {
        await act(async () => {
            render(<VoicesTab {...mockProps} />)
        })
        expect(screen.getByText('Narrator1')).toBeInTheDocument()
        expect(screen.getByText('Narrator2')).toBeInTheDocument()
        expect(screen.getByText('XTTS (1)')).toBeInTheDocument()
        expect(screen.getByText('Voxtral (1)')).toBeInTheDocument()
    })

    it('shows the default narrator pill', async () => {
        await act(async () => {
            render(<VoicesTab {...mockProps} />)
        })
        
        // Expand card to see variant tabs
        const voiceHeader = screen.getByText('Narrator2')
        fireEvent.click(voiceHeader)
        
        expect(screen.getByText('Default')).toBeInTheDocument()
    })


    it('opens profile details and allows building voice', async () => {

        render(<VoicesTab {...mockProps} />)

        // Find the Voice card (it mocks unassigned names as the voice name)
        const voiceHeader = screen.getByText('Narrator1')
        fireEvent.click(voiceHeader)

        // Now "Edit Script" or "Build Voice" should be visible in expanded view
        const buildBtn = await screen.findByText(/Rebuild/i)
        expect(buildBtn).toBeInTheDocument()
    })

    it('shows delete option in ActionMenu', async () => {
        render(<VoicesTab {...mockProps} />)

        // Open Voice ActionMenu
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
            render(<VoicesTab {...mockProps} onRefresh={onRefresh} />)
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
        const onRefresh = vi.fn().mockResolvedValue(undefined)
        const fetchMock = vi.fn((url: string) => {
            if (url === '/api/speakers') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([
                        { id: 'speaker-1', name: 'Woman', default_profile_name: 'Woman' }
                    ])
                })
            }
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

        const importedProfiles = [
            { name: 'Woman', wav_count: 3, speed: 1.0, is_default: true, preview_url: null, speaker_id: 'speaker-1', variant_name: 'New Zealand', test_text: 'Original script' }
        ]

        await act(async () => {
            render(<VoicesTab {...mockProps} onRefresh={onRefresh} speakerProfiles={importedProfiles as any} />)
        })

        fireEvent.click(screen.getByText('Woman'))
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

    it('filters voices by engine', async () => {
        await act(async () => {
            render(<VoicesTab {...mockProps} />)
        })

        fireEvent.click(screen.getByText('Voxtral (1)'))

        expect(screen.queryByText('Narrator1')).not.toBeInTheDocument()
        expect(screen.getByText('Narrator2')).toBeInTheDocument()
    })

    it('hides Voxtral voices and filters when no API key is configured', async () => {
        await act(async () => {
            render(<VoicesTab {...mockProps} settings={{ safe_mode: true, make_mp3: false, default_engine: 'xtts', voxtral_enabled: false }} />)
        })

        expect(screen.getByText('Narrator1')).toBeInTheDocument()
        expect(screen.queryByText('Narrator2')).not.toBeInTheDocument()
        expect(screen.queryByText('Voxtral (1)')).not.toBeInTheDocument()
    })
})
