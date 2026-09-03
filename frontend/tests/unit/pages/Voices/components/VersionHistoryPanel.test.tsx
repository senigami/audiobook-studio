/**
 * VersionHistoryPanel.test.tsx
 *
 * Task 007: list + promote UI for a variant's version history.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApi = vi.hoisted(() => ({
    listVoiceVersions: vi.fn(),
    promoteVoiceVersion: vi.fn(),
    runVersionAbTest: vi.fn(),
}));

vi.mock('@/api', () => ({ api: mockApi }));

// Mock the playerBus boundary so VersionAbPanel (mounted once 2 versions are
// selected) doesn't need a real audio owner in this test file.
vi.mock('@/store/playerBus', () => ({
    usePlayerBus: vi.fn(() => ({ scope: null, audioUrl: null, playing: false })),
    loadAndPlay: vi.fn(),
    pause: vi.fn(),
}));

import { VersionHistoryPanel } from '@/pages/Voices/components/VersionHistoryPanel';

const activeVersion = {
    id: 'v2',
    created_at: 1700000000,
    backfilled: false,
    engine_id: 'xtts',
    model: 'xtts-v2',
    test_text: 'Hello world',
    sample_count: 3,
    has_artifact: true,
    is_active: true,
    artifact_url: '/artifact/v2.wav',
};

const inactiveVersion = {
    id: 'v1',
    created_at: 1699000000,
    backfilled: true,
    engine_id: 'xtts',
    model: 'xtts-v2',
    test_text: 'Hello world',
    sample_count: 2,
    has_artifact: true,
    is_active: false,
    artifact_url: '/artifact/v1.wav',
};

const thirdVersion = {
    id: 'v0',
    created_at: 1698000000,
    backfilled: true,
    engine_id: 'xtts',
    model: 'xtts-v2',
    test_text: 'Hello world',
    sample_count: 1,
    has_artifact: true,
    is_active: false,
    artifact_url: '/artifact/v0.wav',
};

describe('VersionHistoryPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders "History starts with the next rebuild" and no collapsible section when there are zero versions', async () => {
        mockApi.listVoiceVersions.mockResolvedValue({ versions: [], active_version_id: null });

        render(
            <VersionHistoryPanel
                voiceName="Aria Nova"
                onPromoted={vi.fn()}
                requestConfirm={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('History starts with the next rebuild')).toBeInTheDocument();
        });
        expect(screen.queryByText(/Version history/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /promote/i })).not.toBeInTheDocument();
    });

    it('shows "Active" for the active version and a "Promote" button for the other; clicking Promote calls requestConfirm with isDestructive: false', async () => {
        mockApi.listVoiceVersions.mockResolvedValue({
            versions: [inactiveVersion, activeVersion],
            active_version_id: 'v2',
        });
        const requestConfirm = vi.fn();

        render(
            <VersionHistoryPanel
                voiceName="Aria Nova"
                onPromoted={vi.fn()}
                requestConfirm={requestConfirm}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Version history (2)')).toBeInTheDocument();
        });

        // Expand the panel to reveal rows.
        fireEvent.click(screen.getByText('Version history (2)'));

        expect(await screen.findByText('Active')).toBeInTheDocument();
        const promoteBtn = screen.getByRole('button', { name: /promote/i });
        fireEvent.click(promoteBtn);

        expect(requestConfirm).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Promote this version?',
            message: 'Make this version active? The current state will be saved as a new version first, so nothing is lost.',
            isDestructive: false,
            onConfirm: expect.any(Function),
        }));
    });

    it('confirming the promote dialog calls api.promoteVoiceVersion with voiceName/versionId, then onPromoted on success', async () => {
        mockApi.listVoiceVersions.mockResolvedValue({
            versions: [inactiveVersion, activeVersion],
            active_version_id: 'v2',
        });
        mockApi.promoteVoiceVersion.mockResolvedValue({ status: 'ok', active_version_id: 'v1' });
        const requestConfirm = vi.fn();
        const onPromoted = vi.fn();

        render(
            <VersionHistoryPanel
                voiceName="Aria Nova"
                onPromoted={onPromoted}
                requestConfirm={requestConfirm}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Version history (2)')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText('Version history (2)'));
        fireEvent.click(screen.getByRole('button', { name: /promote/i }));

        const config = requestConfirm.mock.calls[0][0];
        await act(async () => {
            await config.onConfirm();
        });

        expect(mockApi.promoteVoiceVersion).toHaveBeenCalledWith('Aria Nova', 'v1');
        await waitFor(() => {
            expect(onPromoted).toHaveBeenCalled();
        });
    });

    it('does not call onPromoted when promote fails', async () => {
        mockApi.listVoiceVersions.mockResolvedValue({
            versions: [inactiveVersion, activeVersion],
            active_version_id: 'v2',
        });
        mockApi.promoteVoiceVersion.mockResolvedValue({ status: 'error', message: 'boom' });
        const requestConfirm = vi.fn();
        const onPromoted = vi.fn();

        render(
            <VersionHistoryPanel
                voiceName="Aria Nova"
                onPromoted={onPromoted}
                requestConfirm={requestConfirm}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Version history (2)')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText('Version history (2)'));
        fireEvent.click(screen.getByRole('button', { name: /promote/i }));

        const config = requestConfirm.mock.calls[0][0];
        await act(async () => {
            await config.onConfirm();
        });

        expect(mockApi.promoteVoiceVersion).toHaveBeenCalledWith('Aria Nova', 'v1');
        expect(onPromoted).not.toHaveBeenCalled();
    });

    describe('compare selection', () => {
        beforeEach(() => {
            mockApi.listVoiceVersions.mockResolvedValue({
                versions: [thirdVersion, inactiveVersion, activeVersion],
                active_version_id: 'v2',
            });
        });

        it('selecting fewer than 2 versions hides VersionAbPanel', async () => {
            render(
                <VersionHistoryPanel voiceName="Aria Nova" onPromoted={vi.fn()} requestConfirm={vi.fn()} />
            );
            await waitFor(() => {
                expect(screen.getByText('Version history (3)')).toBeInTheDocument();
            });
            fireEvent.click(screen.getByText('Version history (3)'));

            expect(screen.queryByText('Run comparison')).not.toBeInTheDocument();

            fireEvent.click(screen.getByLabelText('Compare version v0'));
            expect(screen.queryByText('Run comparison')).not.toBeInTheDocument();
        });

        it('selecting exactly 2 versions renders VersionAbPanel with the right versionA/versionB', async () => {
            render(
                <VersionHistoryPanel voiceName="Aria Nova" onPromoted={vi.fn()} requestConfirm={vi.fn()} />
            );
            await waitFor(() => {
                expect(screen.getByText('Version history (3)')).toBeInTheDocument();
            });
            fireEvent.click(screen.getByText('Version history (3)'));

            fireEvent.click(screen.getByLabelText('Compare version v0'));
            fireEvent.click(screen.getByLabelText('Compare version v1'));

            expect(await screen.findByText('Run comparison')).toBeInTheDocument();
            // Default test-passage text comes from versionA (v0, the first selected).
            expect(screen.getByDisplayValue('Hello world')).toBeInTheDocument();
        });

        it('selecting a 3rd version drops the OLDEST-selected one and the panel updates accordingly', async () => {
            render(
                <VersionHistoryPanel voiceName="Aria Nova" onPromoted={vi.fn()} requestConfirm={vi.fn()} />
            );
            await waitFor(() => {
                expect(screen.getByText('Version history (3)')).toBeInTheDocument();
            });
            fireEvent.click(screen.getByText('Version history (3)'));

            fireEvent.click(screen.getByLabelText('Compare version v0'));
            fireEvent.click(screen.getByLabelText('Compare version v1'));
            fireEvent.click(screen.getByLabelText('Compare version v2'));

            // v0 was the oldest-selected (first clicked), so it should now be
            // deselected while v1/v2 remain checked and the panel still shows.
            expect(await screen.findByLabelText('Compare version v0')).not.toBeChecked();
            expect(screen.getByLabelText('Compare version v1')).toBeChecked();
            expect(screen.getByLabelText('Compare version v2')).toBeChecked();
            expect(screen.getByText('Run comparison')).toBeInTheDocument();
        });
    });
});
