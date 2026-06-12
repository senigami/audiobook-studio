/**
 * MetadataEditor.test.tsx
 *
 * Tests for Phase D voice metadata UI:
 *  1. Untagged badge renders per fixture flag
 *  2. Metadata editor round-trip (PATCH body shape, 422 surfaced verbatim)
 *  3. Facet filter narrows the list
 *  4. Icon upload sends multipart and surfaces rejection
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// 1 — Untagged badge on NarratorCard
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/ActionMenu', () => ({
    ActionMenu: () => null,
}));

describe('NarratorCard untagged badge', () => {
    it('renders "Not tagged" badge when isUntagged=true', async () => {
        const { NarratorCard } = await import('@/pages/Voices/components/NarratorCard');

        const speaker = {
            id: 'voice-1',
            name: 'Test Voice',
            default_profile_name: null,
            created_at: 0,
            updated_at: 0,
        };
        const profiles = [{
            name: 'Test Voice/xtts',
            wav_count: 4,
            speed: 1.0,
            is_default: true,
            speaker_id: 'voice-1',
            variant_name: 'Default',
            engine: 'xtts',
            preview_url: null,
            is_rebuild_required: false,
            is_ready: true,
            samples: [],
        }];

        render(
            <NarratorCard
                speaker={speaker}
                profiles={profiles as any}
                testProgress={{}}
                buildingProfiles={{}}
                engines={[{ engine_id: 'xtts', enabled: true, verified: true, status: 'ready', display_name: 'XTTS' }] as any}
                isExpanded={false}
                onToggleExpand={vi.fn()}
                onTest={vi.fn()}
                onDelete={vi.fn()}
                onMoveVariant={vi.fn()}
                onRefresh={vi.fn()}
                onEditTestText={vi.fn()}
                onBuildNow={async () => false}
                requestConfirm={vi.fn()}
                onAddVariantClick={vi.fn()}
                onRenameClick={vi.fn()}
                onExportVoice={vi.fn()}
                onSetDefaultClick={vi.fn()}
                isUntagged={true}
                onEditMetadata={vi.fn()}
            />
        );

        expect(screen.getByText('Not tagged')).toBeInTheDocument();
    });

    it('does NOT render "Not tagged" badge when isUntagged=false', async () => {
        const { NarratorCard } = await import('@/pages/Voices/components/NarratorCard');

        const speaker = {
            id: 'voice-2',
            name: 'Tagged Voice',
            default_profile_name: null,
            created_at: 0,
            updated_at: 0,
        };
        const profiles = [{
            name: 'Tagged Voice/xtts',
            wav_count: 4,
            speed: 1.0,
            is_default: true,
            speaker_id: 'voice-2',
            variant_name: 'Default',
            engine: 'xtts',
            preview_url: null,
            is_rebuild_required: false,
            is_ready: true,
            samples: [],
        }];

        render(
            <NarratorCard
                speaker={speaker}
                profiles={profiles as any}
                testProgress={{}}
                buildingProfiles={{}}
                engines={[{ engine_id: 'xtts', enabled: true, verified: true, status: 'ready', display_name: 'XTTS' }] as any}
                isExpanded={false}
                onToggleExpand={vi.fn()}
                onTest={vi.fn()}
                onDelete={vi.fn()}
                onMoveVariant={vi.fn()}
                onRefresh={vi.fn()}
                onEditTestText={vi.fn()}
                onBuildNow={async () => false}
                requestConfirm={vi.fn()}
                onAddVariantClick={vi.fn()}
                onRenameClick={vi.fn()}
                onExportVoice={vi.fn()}
                onSetDefaultClick={vi.fn()}
                isUntagged={false}
            />
        );

        expect(screen.queryByText('Not tagged')).not.toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// 2 — MetadataEditorModal: PATCH body shape and 422 surfaced verbatim
// ---------------------------------------------------------------------------

describe('MetadataEditorModal', () => {
    const baseVoice = {
        id: 'gravel-road',
        name: 'Gravel Road',
        is_untagged: true,
        attributes: undefined,
        tags: [],
        description: '',
        languages: [],
    };

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('calls PATCH with correct body shape on save and calls onSaved', async () => {
        const { MetadataEditorModal } = await import('@/pages/Voices/components/MetadataEditorModal');

        const updatedVoice = { ...baseVoice, is_untagged: false, attributes: { class: 'human', gender: 'masculine', age: 'senior' } };
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(updatedVoice),
        }) as any;

        const onSaved = vi.fn();
        const onClose = vi.fn();

        render(
            <MetadataEditorModal
                isOpen={true}
                voice={baseVoice as any}
                onClose={onClose}
                onSaved={onSaved}
            />
        );

        // Select required attribute chips: class=human, gender=masculine, age=senior
        // Chips are aria-pressed buttons; find by text content
        fireEvent.click(screen.getByText('Human'));
        fireEvent.click(screen.getByText('Masculine'));
        fireEvent.click(screen.getByText('Senior / Elderly'));

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/voices/gravel-road/metadata',
                expect.objectContaining({
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: expect.stringContaining('"class":"human"'),
                })
            );
        });

        await waitFor(() => {
            expect(onSaved).toHaveBeenCalledWith(updatedVoice);
        });
    });

    it('surfaces 422 error message verbatim when PATCH fails', async () => {
        const { MetadataEditorModal } = await import('@/pages/Voices/components/MetadataEditorModal');

        const errorMessage = 'attributes.class: value "alien" is not in the controlled vocabulary.';
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 422,
            json: () => Promise.resolve({ detail: errorMessage }),
        }) as any;

        const onSaved = vi.fn();

        render(
            <MetadataEditorModal
                isOpen={true}
                voice={baseVoice as any}
                onClose={vi.fn()}
                onSaved={onSaved}
            />
        );

        // Select required attrs to enable save
        fireEvent.click(screen.getByText('Human'));
        fireEvent.click(screen.getByText('Masculine'));
        fireEvent.click(screen.getByText('Senior / Elderly'));

        fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

        await waitFor(() => {
            expect(screen.getByText(errorMessage)).toBeInTheDocument();
        });

        expect(onSaved).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// 3 — Facet filter narrows the list (via useVoicesData)
// ---------------------------------------------------------------------------

describe('useVoicesData facet filtering', () => {
    it('filters by classFilter and returns only matching voices', async () => {
        const { useVoicesData } = await import('@/hooks/useVoicesData');
        const { renderHook } = await import('@testing-library/react');
        type VoiceMetadata = import('@/types').VoiceMetadata;

        const humanMeta: VoiceMetadata = { id: 'v1', name: 'Voice A', is_untagged: false, attributes: { class: 'human' } };
        const creatureMeta: VoiceMetadata = { id: 'v2', name: 'Voice B', is_untagged: false, attributes: { class: 'creature' } };

        const metadataMap = new Map<string, VoiceMetadata>([
            ['v1', humanMeta],
            ['v2', creatureMeta],
        ]);

        const profiles = [
            { name: 'p1', wav_count: 1, speed: 1, is_default: true, speaker_id: 'v1', variant_name: null, engine: 'xtts', preview_url: null, samples: [] },
            { name: 'p2', wav_count: 1, speed: 1, is_default: true, speaker_id: 'v2', variant_name: null, engine: 'xtts', preview_url: null, samples: [] },
        ] as any[];

        const speakers = [
            { id: 'v1', name: 'Voice A', default_profile_name: 'p1', created_at: 0, updated_at: 0 },
            { id: 'v2', name: 'Voice B', default_profile_name: 'p2', created_at: 0, updated_at: 0 },
        ];

        const engines = [{ engine_id: 'xtts', enabled: true, status: 'ready', display_name: 'XTTS' }] as any[];

        const { result } = renderHook(() =>
            useVoicesData({
                speakers,
                activeSpeakerProfiles: profiles,
                disabledSpeakerProfiles: [],
                engines,
                searchQuery: '',
                engineFilter: 'all',
                exportVoiceName: null,
                voiceMetadataMap: metadataMap,
                classFilter: 'creature',
            })
        );

        expect(result.current.filteredVoices).toHaveLength(1);
        expect(result.current.filteredVoices[0].name).toBe('Voice B');
    });

    it('filters by searchQuery over tags and description', async () => {
        const { useVoicesData } = await import('@/hooks/useVoicesData');
        const { renderHook } = await import('@testing-library/react');
        type VoiceMetadata = import('@/types').VoiceMetadata;

        const cowboyMeta: VoiceMetadata = { id: 'v1', name: 'Gravel Road', is_untagged: false, tags: ['cowboy', 'weathered'], description: 'Ranch hand drawl' };
        const otherMeta: VoiceMetadata = { id: 'v2', name: 'Studio Voice', is_untagged: false, tags: ['clean'], description: 'Neutral narrator' };

        const metadataMap = new Map<string, VoiceMetadata>([['v1', cowboyMeta], ['v2', otherMeta]]);

        const profiles = [
            { name: 'p1', wav_count: 1, speed: 1, is_default: true, speaker_id: 'v1', variant_name: null, engine: 'xtts', preview_url: null, samples: [] },
            { name: 'p2', wav_count: 1, speed: 1, is_default: true, speaker_id: 'v2', variant_name: null, engine: 'xtts', preview_url: null, samples: [] },
        ] as any[];

        const speakers = [
            { id: 'v1', name: 'Gravel Road', default_profile_name: 'p1', created_at: 0, updated_at: 0 },
            { id: 'v2', name: 'Studio Voice', default_profile_name: 'p2', created_at: 0, updated_at: 0 },
        ];

        const engines = [{ engine_id: 'xtts', enabled: true, status: 'ready', display_name: 'XTTS' }] as any[];

        const { result } = renderHook(() =>
            useVoicesData({
                speakers,
                activeSpeakerProfiles: profiles,
                disabledSpeakerProfiles: [],
                engines,
                searchQuery: 'cowboy',
                engineFilter: 'all',
                exportVoiceName: null,
                voiceMetadataMap: metadataMap,
            })
        );

        expect(result.current.filteredVoices).toHaveLength(1);
        expect(result.current.filteredVoices[0].name).toBe('Gravel Road');
    });
});

// ---------------------------------------------------------------------------
// 4 — Icon upload: sends multipart and surfaces rejection
// ---------------------------------------------------------------------------

describe('MetadataEditorModal icon upload', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('sends multipart POST to icon endpoint', async () => {
        const { MetadataEditorModal } = await import('@/pages/Voices/components/MetadataEditorModal');

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ status: 'ok', image: 'icon.png' }),
        }) as any;

        const voice = { id: 'voice-1', name: 'Test', is_untagged: true };

        render(
            <MetadataEditorModal
                isOpen={true}
                voice={voice as any}
                onClose={vi.fn()}
                onSaved={vi.fn()}
            />
        );

        const input = document.querySelector('input[type="file"][accept="image/png,image/jpeg,image/webp"]') as HTMLInputElement;
        expect(input).not.toBeNull();

        const file = new File(['png-data'], 'icon.png', { type: 'image/png' });
        await act(async () => {
            fireEvent.change(input, { target: { files: [file] } });
        });

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/voices/voice-1/icon',
                expect.objectContaining({ method: 'POST' })
            );
            const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(call[1].body).toBeInstanceOf(FormData);
        });
    });

    it('surfaces icon upload rejection message verbatim', async () => {
        const { MetadataEditorModal } = await import('@/pages/Voices/components/MetadataEditorModal');

        const rejectionMsg = 'Icon must be square (1:1 aspect ratio). Got 800×600.';
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 422,
            json: () => Promise.resolve({ detail: rejectionMsg }),
        }) as any;

        const voice = { id: 'voice-1', name: 'Test', is_untagged: true };

        render(
            <MetadataEditorModal
                isOpen={true}
                voice={voice as any}
                onClose={vi.fn()}
                onSaved={vi.fn()}
            />
        );

        const input = document.querySelector('input[type="file"][accept="image/png,image/jpeg,image/webp"]') as HTMLInputElement;
        const file = new File(['img'], 'wide.jpg', { type: 'image/jpeg' });
        await act(async () => {
            fireEvent.change(input, { target: { files: [file] } });
        });

        await waitFor(() => {
            expect(screen.getByText(rejectionMsg)).toBeInTheDocument();
        });
    });
});
