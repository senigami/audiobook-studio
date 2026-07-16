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

// framer-motion's real useReducedMotion() lazily initializes a module-level
// singleton (motion-dom's `prefersReducedMotion`) from `window.matchMedia` on
// first call and never re-reads it — so stubbing `window.matchMedia` per test
// (as PlayerBar.test.tsx does for its own single fixed value) can't drive a
// per-test true/false toggle here. Instead we mock `useReducedMotion` directly
// (a third-party hook — outside the VariantEditor unit under test per R2) so
// each test can control it independently. `motion.div` is stubbed only as a
// thin prop-capturing pass-through (no animation logic reimplemented) so the
// actual `animate`/`transition` values VariantEditor computes and passes down
// are directly inspectable.
vi.mock('framer-motion', async (importOriginal) => {
    const actual = await importOriginal<typeof import('framer-motion')>();
    return {
        ...actual,
        useReducedMotion: vi.fn(),
        motion: {
            ...actual.motion,
            div: ({ layoutId: _layoutId, animate, transition, ...rest }: any) => (
                <div
                    data-testid="play-pulse-probe"
                    data-animate={JSON.stringify(animate)}
                    data-transition={JSON.stringify(transition)}
                    {...rest}
                />
            ),
        },
    };
});

import { VariantEditor } from '@/pages/Voices/components/VariantEditor';
import { useVariantActions } from '@/hooks/useVariantActions';
import { useReducedMotion } from 'framer-motion';

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

    describe('play-pulse reduced-motion guard (DC-004)', () => {
        it('animates the play-pulse when the user has no motion preference', () => {
            vi.mocked(useReducedMotion).mockReturnValue(false);
            vi.mocked(useVariantActions).mockReturnValueOnce({
                localSpeed: null,
                setLocalSpeed: vi.fn(),
                isPlaying: true,
                playingSample: null,
                setCacheBuster: vi.fn(),
                handlePlayClick: vi.fn(),
                handleGeneratePreview: vi.fn(),
                handlePlaySample: vi.fn(),
                handleSpeedChange: vi.fn(),
                handleDeleteSample: vi.fn(),
                uploadFiles: vi.fn(),
            } as ReturnType<typeof useVariantActions>);

            render(<VariantEditor {...baseProps} profile={softProfile} />);
            const pulse = screen.getByTestId('play-pulse-probe');
            expect(JSON.parse(pulse.dataset.animate!)).toEqual({ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] });
            expect(JSON.parse(pulse.dataset.transition!)).toEqual({ duration: 2, repeat: null });
        });

        it('disables the play-pulse animation when the user prefers reduced motion', () => {
            vi.mocked(useReducedMotion).mockReturnValue(true);
            vi.mocked(useVariantActions).mockReturnValueOnce({
                localSpeed: null,
                setLocalSpeed: vi.fn(),
                isPlaying: true,
                playingSample: null,
                setCacheBuster: vi.fn(),
                handlePlayClick: vi.fn(),
                handleGeneratePreview: vi.fn(),
                handlePlaySample: vi.fn(),
                handleSpeedChange: vi.fn(),
                handleDeleteSample: vi.fn(),
                uploadFiles: vi.fn(),
            } as ReturnType<typeof useVariantActions>);

            render(<VariantEditor {...baseProps} profile={softProfile} />);
            const pulse = screen.getByTestId('play-pulse-probe');
            expect(JSON.parse(pulse.dataset.animate!)).toEqual({});
            expect(JSON.parse(pulse.dataset.transition!)).toEqual({ duration: 0 });
        });
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

            fireEvent.click(screen.getByLabelText('Add tag'));
            const input = screen.getByLabelText('Search tag');
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

            fireEvent.click(screen.getByLabelText('Add tag'));
            const input = screen.getByLabelText('Search tag');
            fireEvent.change(input, { target: { value: 'grav' } });
            expect(screen.getByText('gravelly')).toBeInTheDocument();

            fireEvent.change(input, { target: { value: 'calm' } });
            expect(screen.getByText('calm')).toBeInTheDocument();
        });
    });

    // Per-variant performance qualities (owner-requested, 2026-07-16):
    // tone/timbre/pace moved off voice-level VoiceAttributes since they
    // describe how THIS recording performs -- same settings-write pattern
    // as performance_tags, one key at a time.
    describe('tone/timbre/pace', () => {
        beforeEach(() => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
        });

        it('renders existing tone and timbre as removable pills', () => {
            const profile = { ...softProfile, tone: ['warm'], timbre: ['velvety'] };
            render(<VariantEditor {...baseProps} profile={profile} />);
            expect(screen.getByText('warm')).toBeInTheDocument();
            expect(screen.getByText('velvety')).toBeInTheDocument();
        });

        it('adding a tone calls the settings-write API with just the tone key, then onRefresh', async () => {
            const onRefresh = vi.fn();
            const profile = { ...softProfile, tone: ['warm'] };
            render(<VariantEditor {...baseProps} onRefresh={onRefresh} profile={profile} />);

            fireEvent.click(screen.getByLabelText('Add tone'));
            const input = screen.getByLabelText('Search tone');
            fireEvent.change(input, { target: { value: 'calm' } });
            fireEvent.keyDown(input, { key: 'Enter' });

            expect(fetch).toHaveBeenCalledWith(
                `/api/speaker-profiles/${encodeURIComponent(profile.name)}/settings`,
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ tone: ['warm', 'calm'] }),
                })
            );
            await vi.waitFor(() => expect(onRefresh).toHaveBeenCalled());
        });

        it('renders pace as a searchable select bound to the profile value', () => {
            const profile = { ...softProfile, pace: 'brisk' };
            render(<VariantEditor {...baseProps} profile={profile} />);
            expect(screen.getByText('Brisk')).toBeInTheDocument();
        });
    });

    describe('ActionMenu chrome demotion (task 009)', () => {
        it('includes Script, Record samples, Rebuild, Move Variant, and Delete Variant (destructive) items', () => {
            render(<VariantEditor {...baseProps} profile={softProfile} />);
            expect(screen.getByTestId('menu-item-Script')).toBeInTheDocument();
            expect(screen.getByTestId('menu-item-Record samples')).toBeInTheDocument();
            expect(screen.getByTestId('menu-item-Rebuild')).toBeInTheDocument();
            expect(screen.getByTestId('menu-item-Move Variant')).toBeInTheDocument();
            const deleteItem = screen.getByTestId('menu-item-Delete Variant');
            expect(deleteItem).toHaveAttribute('data-destructive', 'true');
        });

        it('clicking Script toggles the in-place Script/engine-config panel open and closed (task 009: no more onEditTestText tab-switch)', () => {
            render(<VariantEditor {...baseProps} profile={softProfile} />);
            expect(screen.queryByText('PREVIEW TEXT SCRIPT')).not.toBeInTheDocument();

            fireEvent.click(screen.getByTestId('menu-item-Script'));
            expect(screen.getByText('PREVIEW TEXT SCRIPT')).toBeInTheDocument();

            fireEvent.click(screen.getByTestId('menu-item-Script'));
            expect(screen.queryByText('PREVIEW TEXT SCRIPT')).not.toBeInTheDocument();
        });

        it('clicking Record samples toggles the in-place record-mode capture UI', () => {
            render(<VariantEditor {...baseProps} profile={softProfile} />);
            expect(screen.queryByText(/skip/i)).not.toBeInTheDocument();

            fireEvent.click(screen.getByTestId('menu-item-Record samples'));
            expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();

            fireEvent.click(screen.getByTestId('menu-item-Record samples'));
            expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument();
        });

        it('the mic button next to the samples upload "+" also toggles record-mode (owner-requested, 2026-07-16)', () => {
            render(<VariantEditor {...baseProps} profile={softProfile} />);
            expect(screen.queryByText(/skip/i)).not.toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
            expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Record a sample' }));
            expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument();
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

    // Variant renaming reachability (INV-VC-2): the "VARIANT NAME" field the
    // retired TestTab used to host must still be reachable from the Script panel,
    // and changing it must hit the same rename endpoints TestTab used — /rename
    // for a non-default variant (whose label lives in the profile name) and
    // /variant-name for the default variant (whose label is a stored setting).
    describe('variant renaming (INV-VC-2)', () => {
        beforeEach(() => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
        });

        const openScriptPanel = () => fireEvent.click(screen.getByTestId('menu-item-Script'));

        it('renders the VARIANT NAME field in the Script panel', () => {
            render(<VariantEditor {...baseProps} profile={softProfile} />);
            expect(screen.queryByPlaceholderText('Variant name')).not.toBeInTheDocument();
            openScriptPanel();
            expect(screen.getByText('VARIANT NAME')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('Variant name')).toHaveValue('Soft');
        });

        it('renaming a NON-default variant saves via /rename with the composed full name, then onRefresh', async () => {
            const onRefresh = vi.fn();
            render(<VariantEditor {...baseProps} onRefresh={onRefresh} profile={softProfile} />);
            openScriptPanel();

            fireEvent.change(screen.getByPlaceholderText('Variant name'), { target: { value: 'Whisper' } });
            fireEvent.click(screen.getByRole('button', { name: 'Save Script' }));

            await vi.waitFor(() =>
                expect(fetch).toHaveBeenCalledWith(
                    `/api/speaker-profiles/${encodeURIComponent(softProfile.name)}/rename`,
                    expect.objectContaining({ method: 'POST' })
                )
            );
            const renameCall = (fetch as any).mock.calls.find((c: any[]) => String(c[0]).endsWith('/rename'));
            expect((renameCall[1].body as URLSearchParams).get('new_name')).toBe('Aria Nova - Whisper');
            await vi.waitFor(() => expect(onRefresh).toHaveBeenCalled());
        });

        it('renaming the DEFAULT variant saves via /variant-name (not /rename)', async () => {
            const defaultProfile = {
                ...softProfile,
                name: 'Aria Nova',
                variant_name: 'Default',
                is_default: true,
            } as SpeakerProfile;
            render(<VariantEditor {...baseProps} profile={defaultProfile} />);
            openScriptPanel();

            fireEvent.change(screen.getByPlaceholderText('Variant name'), { target: { value: 'Narration' } });
            fireEvent.click(screen.getByRole('button', { name: 'Save Script' }));

            await vi.waitFor(() =>
                expect(fetch).toHaveBeenCalledWith(
                    `/api/speaker-profiles/${encodeURIComponent(defaultProfile.name)}/variant-name`,
                    expect.objectContaining({ method: 'POST' })
                )
            );
            const calls = (fetch as any).mock.calls.map((c: any[]) => String(c[0]));
            expect(calls.some((u: string) => u.endsWith('/rename'))).toBe(false);
        });

        it('does not call a rename endpoint when the variant name is unchanged', async () => {
            render(<VariantEditor {...baseProps} profile={softProfile} />);
            openScriptPanel();

            fireEvent.click(screen.getByRole('button', { name: 'Save Script' }));

            await vi.waitFor(() =>
                expect(fetch).toHaveBeenCalledWith(
                    `/api/speaker-profiles/${encodeURIComponent(softProfile.name)}/settings`,
                    expect.objectContaining({ method: 'POST' })
                )
            );
            const calls = (fetch as any).mock.calls.map((c: any[]) => String(c[0]));
            expect(calls.some((u: string) => u.endsWith('/rename') || u.endsWith('/variant-name'))).toBe(false);
        });
    });
});
