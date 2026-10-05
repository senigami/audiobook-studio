/**
 * HuggingFaceDiscover.test.tsx
 *
 * Covers the real (non-demo) Hugging Face browse/import panel:
 *  1. Initial search fires on mount and renders results from the real API shape
 *  2. Search failure surfaces an error state (no unhandled rejection)
 *  3. Import wizard: inspect -> consent gate -> import, using the real
 *     /api/voices/huggingface/* endpoints via global.fetch mocking
 *  4. A restrictive license is flagged but the Import button is never disabled by it
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { HuggingFaceDiscover } from '@/pages/Voices/components/HuggingFaceDiscover';

function jsonResponse(body: unknown, ok = true, status = 200) {
    return Promise.resolve({
        ok,
        status,
        json: () => Promise.resolve(body),
    } as Response);
}

describe('HuggingFaceDiscover', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('searches on mount and renders results from the real search shape', async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (String(url).includes('/api/voices/huggingface/search')) {
                return jsonResponse([
                    { hub_id: 'someone/voice-a', author: 'someone', tags: ['audiobook-studio-voice'], likes: 3 },
                ]);
            }
            return jsonResponse({}, false, 404);
        });

        render(<HuggingFaceDiscover />);

        await waitFor(() => expect(screen.getByText('someone/voice-a')).toBeInTheDocument());
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/voices/huggingface/search'));
    });

    it('surfaces a search error without crashing', async () => {
        global.fetch = vi.fn().mockImplementation(() =>
            jsonResponse({ message: 'Hugging Face search failed' }, false, 502)
        );

        render(<HuggingFaceDiscover />);

        await waitFor(() => expect(screen.getByText(/Hugging Face search failed/)).toBeInTheDocument());
    });

    it('runs the inspect -> consent -> import wizard and calls the real import endpoint', async () => {
        global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            const u = String(url);
            if (u.includes('/api/voices/huggingface/search')) {
                return jsonResponse([
                    { hub_id: 'someone/voice-a', author: 'someone', tags: ['audiobook-studio-voice'], likes: 3 },
                ]);
            }
            if (u.includes('/api/voices/huggingface/inspect')) {
                return jsonResponse({
                    hub_id: 'someone/voice-a',
                    license: 'cc-by-4.0',
                    is_restrictive_license: false,
                    languages: ['en-US'],
                    tags: ['audiobook-studio-voice'],
                    author: 'someone',
                    description: 'A weathered narrator voice.',
                    sample_url: null,
                });
            }
            if (u.includes('/api/voices/huggingface/import') && init?.method === 'POST') {
                const body = JSON.parse(String(init.body));
                expect(body).toMatchObject({ hub_id: 'someone/voice-a', consent: true });
                return jsonResponse({
                    status: 'ok',
                    voice_id: 'voice-a',
                    voice_name: 'someone-voice-a',
                    profile_name: 'someone-voice-a',
                    saved_samples: ['sample.wav'],
                    license: 'cc-by-4.0',
                    is_restrictive_license: false,
                    metadata: { id: 'voice-a', name: 'someone-voice-a', is_untagged: false },
                });
            }
            return jsonResponse({}, false, 404);
        });

        const onImported = vi.fn();
        render(<HuggingFaceDiscover onImported={onImported} />);

        await waitFor(() => expect(screen.getByText('someone/voice-a')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /Import/i }));

        // Inspect step loads the card.
        await waitFor(() => expect(screen.getByText('A weathered narrator voice.')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

        // Consent step — Import is disabled until the checkbox is checked.
        // Scoped to the dialog: the list behind the modal still has its own "Import" button.
        const dialog = screen.getByRole('dialog');
        const importButton = await within(dialog).findByRole('button', { name: 'Import' });
        expect(importButton).toBeDisabled();
        fireEvent.click(screen.getByRole('checkbox'));
        expect(importButton).not.toBeDisabled();
        fireEvent.click(importButton);

        await waitFor(() => expect(screen.getByText('Voice imported')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));

        expect(onImported).toHaveBeenCalledTimes(1);
    });

    it('flags a restrictive license without disabling import', async () => {
        global.fetch = vi.fn().mockImplementation((url: string) => {
            const u = String(url);
            if (u.includes('/api/voices/huggingface/search')) {
                return jsonResponse([
                    { hub_id: 'someone/nc-voice', author: 'someone', tags: [], likes: 0 },
                ]);
            }
            if (u.includes('/api/voices/huggingface/inspect')) {
                return jsonResponse({
                    hub_id: 'someone/nc-voice',
                    license: 'cc-by-nc-4.0',
                    is_restrictive_license: true,
                    languages: [],
                    tags: [],
                    author: 'someone',
                    description: '',
                    sample_url: null,
                });
            }
            return jsonResponse({}, false, 404);
        });

        render(<HuggingFaceDiscover />);
        await waitFor(() => expect(screen.getByText('someone/nc-voice')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Import/i }));

        await waitFor(() => expect(screen.getByText('cc-by-nc-4.0')).toBeInTheDocument());
        const continueButton = screen.getByRole('button', { name: 'Continue' });
        expect(continueButton).not.toBeDisabled();
        fireEvent.click(continueButton);

        await waitFor(() => expect(screen.getByText(/restricts some uses/)).toBeInTheDocument());
    });
});
