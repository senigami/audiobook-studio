/**
 * VariantEditor.test.tsx
 *
 * Regression test: variant rows (play/speed/engine badge/Script/Rebuild)
 * had no visible name/label distinguishing one variant from another when a
 * voice has multiple variants — add the variant's display name to the row.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpeakerProfile } from '@/types';

vi.mock('@/hooks/useVariantActions', () => ({
    useVariantActions: vi.fn().mockReturnValue({
        localSpeed: null,
        setLocalSpeed: vi.fn(),
        isPlaying: false,
        playingSample: null,
        setCacheBuster: vi.fn(),
        handlePlayClick: vi.fn(),
        handleGeneratePreview: vi.fn(),
        handlePlaySample: vi.fn(),
        handleSpeedChange: vi.fn(),
        handleDeleteSample: vi.fn(),
        uploadFiles: vi.fn(),
    }),
}));

// Mock ActionMenu so we can assert on `items` without portal/DOM complexity
// (same pattern as ProjectCard.test.tsx / VoiceCatalogCard.test.tsx).
vi.mock('@/components/ui/ActionMenu', () => ({
    ActionMenu: ({ items }: { items?: Array<{ label?: string; onClick?: () => void; isDestructive?: boolean; isDivider?: boolean; disabled?: boolean }> }) => (
        <div data-testid="action-menu">
            {items?.map((item, i) => (
                item.isDivider ? null : (
                    <button
                        key={i}
                        data-testid={`menu-item-${item.label}`}
                        onClick={item.onClick}
                        disabled={item.disabled}
                        data-destructive={item.isDestructive ? 'true' : undefined}
                    >
                        {item.label}
                    </button>
                )
            ))}
        </div>
    ),
}));

import { VariantEditor } from '@/pages/Voices/components/VariantEditor';

const softProfile: SpeakerProfile = {
    name: 'Aria Nova - Soft',
    speaker_id: 'sp-1',
    variant_name: 'Soft',
    engine: 'xtts',
    is_default: false,
    is_ready: true,
    has_latent: true,
    wav_count: 2,
    is_rebuild_required: false,
    rebuild_reasons: [],
    preview_url: '/preview.mp3',
    speed: 1.0,
    samples: ['1.wav'],
} as SpeakerProfile;

describe('VariantEditor', () => {
    const baseProps = {
        isTesting: false,
        onTest: vi.fn(),
        onDeleteVariant: vi.fn(),
        onMoveVariant: vi.fn(),
        onRefresh: vi.fn(),
        onEditTestText: vi.fn(),
        onBuildNow: vi.fn().mockResolvedValue(true),
        requestConfirm: vi.fn(),
        voiceName: 'Aria Nova',
        buildingProfiles: {},
        engines: [],
    };

    it('shows the variant\'s display name so multiple variants are distinguishable', () => {
        render(<VariantEditor {...baseProps} profile={softProfile} />);
        expect(screen.getByText('Soft')).toBeInTheDocument();
    });

    describe('performance_tags', () => {
        beforeEach(() => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
        });

        it('renders existing performance_tags as pills', () => {
            const taggedProfile = { ...softProfile, performance_tags: ['sad', 'slow'] };
            render(<VariantEditor {...baseProps} profile={taggedProfile} />);
            expect(screen.getByText('sad')).toBeInTheDocument();
            expect(screen.getByText('slow')).toBeInTheDocument();
        });

        it('adding a tag calls the settings-write API with the updated array, then onRefresh', async () => {
            const onRefresh = vi.fn();
            const taggedProfile = { ...softProfile, performance_tags: ['sad'] };
            render(<VariantEditor {...baseProps} onRefresh={onRefresh} profile={taggedProfile} />);

            const input = screen.getByLabelText('Add tag');
            fireEvent.change(input, { target: { value: 'happy' } });
            fireEvent.keyDown(input, { key: 'Enter' });

            expect(fetch).toHaveBeenCalledWith(
                `/api/speaker-profiles/${encodeURIComponent(taggedProfile.name)}/settings`,
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ performance_tags: ['sad', 'happy'] }),
                })
            );
            await vi.waitFor(() => expect(onRefresh).toHaveBeenCalled());
        });

        it('removing a tag calls the settings-write API with the shorter array, then onRefresh', async () => {
            const onRefresh = vi.fn();
            const taggedProfile = { ...softProfile, performance_tags: ['sad', 'slow'] };
            render(<VariantEditor {...baseProps} onRefresh={onRefresh} profile={taggedProfile} />);

            fireEvent.click(screen.getByRole('button', { name: /remove sad/i }));

            expect(fetch).toHaveBeenCalledWith(
                `/api/speaker-profiles/${encodeURIComponent(taggedProfile.name)}/settings`,
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ performance_tags: ['slow'] }),
                })
            );
            await vi.waitFor(() => expect(onRefresh).toHaveBeenCalled());
        });

        it('aggregates sibling variants\' tags plus the starter vocabulary into suggestions', () => {
            const taggedProfile = { ...softProfile, performance_tags: [] };
            render(<VariantEditor {...baseProps} profile={taggedProfile} tagSuggestions={['gravelly']} />);

            const input = screen.getByLabelText('Add tag');
            fireEvent.focus(input);
            fireEvent.change(input, { target: { value: 'grav' } });
            expect(screen.getByText('gravelly')).toBeInTheDocument();

            fireEvent.change(input, { target: { value: 'calm' } });
            expect(screen.getByText('calm')).toBeInTheDocument();
        });
    });

    describe('ActionMenu chrome demotion (task 009)', () => {
        it('includes Script, Rebuild, Move Variant, and Delete Variant (destructive) items', () => {
            render(<VariantEditor {...baseProps} profile={softProfile} />);
            expect(screen.getByTestId('menu-item-Script')).toBeInTheDocument();
            expect(screen.getByTestId('menu-item-Rebuild')).toBeInTheDocument();
            expect(screen.getByTestId('menu-item-Move Variant')).toBeInTheDocument();
            const deleteItem = screen.getByTestId('menu-item-Delete Variant');
            expect(deleteItem).toHaveAttribute('data-destructive', 'true');
        });

        it('clicking Script calls onEditTestText with the profile', () => {
            const onEditTestText = vi.fn();
            render(<VariantEditor {...baseProps} onEditTestText={onEditTestText} profile={softProfile} />);
            fireEvent.click(screen.getByTestId('menu-item-Script'));
            expect(onEditTestText).toHaveBeenCalledWith(softProfile);
        });

        it('clicking Move Variant calls onMoveVariant with the profile', () => {
            const onMoveVariant = vi.fn();
            render(<VariantEditor {...baseProps} onMoveVariant={onMoveVariant} profile={softProfile} />);
            fireEvent.click(screen.getByTestId('menu-item-Move Variant'));
            expect(onMoveVariant).toHaveBeenCalledWith(softProfile);
        });

        it('clicking Delete Variant routes through requestConfirm, and confirming calls onDeleteVariant', () => {
            const onDeleteVariant = vi.fn();
            const requestConfirm = vi.fn((config: { onConfirm: () => void }) => config.onConfirm());
            render(
                <VariantEditor
                    {...baseProps}
                    onDeleteVariant={onDeleteVariant}
                    requestConfirm={requestConfirm}
                    profile={softProfile}
                />
            );
            fireEvent.click(screen.getByTestId('menu-item-Delete Variant'));
            expect(requestConfirm).toHaveBeenCalledWith(
                expect.objectContaining({ isDestructive: true })
            );
            expect(onDeleteVariant).toHaveBeenCalledWith(softProfile.name);
        });

        it('clicking Rebuild calls onBuildNow for this profile', () => {
            const onBuildNow = vi.fn().mockResolvedValue(true);
            render(<VariantEditor {...baseProps} onBuildNow={onBuildNow} profile={softProfile} />);
            fireEvent.click(screen.getByTestId('menu-item-Rebuild'));
            expect(onBuildNow).toHaveBeenCalledWith(softProfile.name, [], softProfile.speaker_id, softProfile.variant_name);
        });
    });
});
