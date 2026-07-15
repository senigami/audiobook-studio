/**
 * VariantSwitcher.test.tsx — voice-variant-tagging-and-ia task 008
 *
 * Covers: count-based strip/rail conditional, selection vs. default-star
 * independence (INV-DEFAULT-1), default-star reflecting `is_variant_default`
 * (task 005), roving-tabindex keyboard nav in both orientations, and
 * performance-tag chip capping (via `VoicePillRow`'s existing `max` prop).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpeakerProfile } from '@/types';

// Mock the playerBus boundary (audio owner) — same shape as VersionAbPanel.test.tsx /
// VoiceCatalogCard.test.tsx.
vi.mock('@/store/playerBus', () => ({
    usePlayerBus: vi.fn(() => ({ scope: null, audioUrl: null, playing: false })),
    loadAndPlay: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
}));

import { usePlayerBus } from '@/store/playerBus';
import { VariantSwitcher } from '@/pages/Voices/components/VariantSwitcher';

function makeProfile(overrides: Partial<SpeakerProfile>): SpeakerProfile {
    return {
        name: overrides.variant_name ? `Aria Nova - ${overrides.variant_name}` : 'Aria Nova',
        speaker_id: 'sp-1',
        variant_name: null,
        engine: 'xtts',
        is_default: false,
        wav_count: 1,
        speed: 1.0,
        preview_url: null,
        ...overrides,
    } as SpeakerProfile;
}

describe('VariantSwitcher', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (usePlayerBus as ReturnType<typeof vi.fn>).mockReturnValue({ scope: null, audioUrl: null, playing: false });
    });

    it('renders the strip variant when profiles.length <= 4', () => {
        const profiles = [
            makeProfile({ variant_name: 'Calm' }),
            makeProfile({ variant_name: 'Angry' }),
        ];
        render(
            <VariantSwitcher
                profiles={profiles}
                selectedVariantName={profiles[0].name}
                onSelect={vi.fn()}
                onSetDefault={vi.fn()}
                voiceName="Aria Nova"
            />
        );
        expect(screen.getByTestId('variant-switcher-strip')).toBeInTheDocument();
        expect(screen.queryByTestId('variant-switcher-rail')).not.toBeInTheDocument();
        expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal');
    });

    it('renders the rail variant when profiles.length > 4', () => {
        const profiles = ['A', 'B', 'C', 'D', 'E'].map(n => makeProfile({ variant_name: n }));
        render(
            <VariantSwitcher
                profiles={profiles}
                selectedVariantName={profiles[0].name}
                onSelect={vi.fn()}
                onSetDefault={vi.fn()}
                voiceName="Aria Nova"
            />
        );
        expect(screen.getByTestId('variant-switcher-rail')).toBeInTheDocument();
        expect(screen.queryByTestId('variant-switcher-strip')).not.toBeInTheDocument();
        expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
    });

    it('clicking a non-selected item calls onSelect with that variant name', () => {
        const profiles = [
            makeProfile({ variant_name: 'Calm' }),
            makeProfile({ variant_name: 'Angry' }),
        ];
        const onSelect = vi.fn();
        render(
            <VariantSwitcher
                profiles={profiles}
                selectedVariantName={profiles[0].name}
                onSelect={onSelect}
                onSetDefault={vi.fn()}
                voiceName="Aria Nova"
            />
        );
        fireEvent.click(screen.getByRole('tab', { name: /Angry/ }));
        expect(onSelect).toHaveBeenCalledWith(profiles[1].name);
    });

    it('clicking the default-star calls onSetDefault and does NOT also call onSelect', () => {
        const profiles = [
            makeProfile({ variant_name: 'Calm' }),
            makeProfile({ variant_name: 'Angry' }),
        ];
        const onSelect = vi.fn();
        const onSetDefault = vi.fn();
        render(
            <VariantSwitcher
                profiles={profiles}
                selectedVariantName={profiles[0].name}
                onSelect={onSelect}
                onSetDefault={onSetDefault}
                voiceName="Aria Nova"
            />
        );
        const stars = screen.getAllByRole('button', { name: 'Default variant for Aria Nova' });
        fireEvent.click(stars[1]);
        expect(onSetDefault).toHaveBeenCalledWith(profiles[1].name);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it("the star's filled/outline state matches is_variant_default", () => {
        const profiles = [
            makeProfile({ variant_name: 'Calm', is_variant_default: true }),
            makeProfile({ variant_name: 'Angry', is_variant_default: false }),
        ];
        render(
            <VariantSwitcher
                profiles={profiles}
                selectedVariantName={profiles[0].name}
                onSelect={vi.fn()}
                onSetDefault={vi.fn()}
                voiceName="Aria Nova"
            />
        );
        const stars = screen.getAllByRole('button', { name: 'Default variant for Aria Nova' });
        expect(stars[0]).toHaveAttribute('aria-pressed', 'true');
        expect(stars[1]).toHaveAttribute('aria-pressed', 'false');
    });

    it('performance-tag chips render per item, capped at 2 visible + overflow', () => {
        const profiles = [
            makeProfile({
                variant_name: 'Calm',
                performance_tags: ['warm', 'gentle', 'slow-paced'],
            }),
        ];
        render(
            <VariantSwitcher
                profiles={profiles}
                selectedVariantName={profiles[0].name}
                onSelect={vi.fn()}
                onSetDefault={vi.fn()}
                voiceName="Aria Nova"
            />
        );
        expect(screen.getByText('warm')).toBeInTheDocument();
        expect(screen.getByText('gentle')).toBeInTheDocument();
        expect(screen.queryByText('slow-paced')).not.toBeInTheDocument();
        expect(screen.getByText('+1')).toBeInTheDocument();
    });

    it('ArrowRight moves the roving tabindex/selection in strip (horizontal) mode', () => {
        const profiles = [
            makeProfile({ variant_name: 'Calm' }),
            makeProfile({ variant_name: 'Angry' }),
        ];
        const onSelect = vi.fn();
        render(
            <VariantSwitcher
                profiles={profiles}
                selectedVariantName={profiles[0].name}
                onSelect={onSelect}
                onSetDefault={vi.fn()}
                voiceName="Aria Nova"
            />
        );
        const tabs = screen.getAllByRole('tab');
        tabs[0].focus();
        fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
        expect(onSelect).toHaveBeenCalledWith(profiles[1].name);
    });

    it('ArrowDown moves the roving tabindex/selection in rail (vertical) mode', () => {
        const profiles = ['A', 'B', 'C', 'D', 'E'].map(n => makeProfile({ variant_name: n }));
        const onSelect = vi.fn();
        render(
            <VariantSwitcher
                profiles={profiles}
                selectedVariantName={profiles[0].name}
                onSelect={onSelect}
                onSetDefault={vi.fn()}
                voiceName="Aria Nova"
            />
        );
        const tabs = screen.getAllByRole('tab');
        tabs[0].focus();
        fireEvent.keyDown(tabs[0], { key: 'ArrowDown' });
        expect(onSelect).toHaveBeenCalledWith(profiles[1].name);

        // ArrowRight/ArrowLeft must NOT navigate in rail (vertical) mode.
        onSelect.mockClear();
        fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
        expect(onSelect).not.toHaveBeenCalled();
    });
});
