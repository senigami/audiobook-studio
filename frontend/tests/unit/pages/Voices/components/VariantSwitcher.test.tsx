/**
 * VariantSwitcher.test.tsx — voice-variant-tagging-and-ia task 008
 * (ARIA re-model: design-critique follow-up, 2026-07-15)
 *
 * Covers: count-based strip/rail conditional, selection vs. default-star
 * independence (INV-DEFAULT-1), default-star reflecting `is_variant_default`
 * (task 005), roving-tabindex keyboard nav in both orientations, and
 * performance-tag chip capping (via `VoicePillRow`'s existing `max` prop).
 *
 * Re-model coverage (this round): the switcher is `role="listbox"` +
 * `role="option"` (not the previous `tablist`/`tab`, which fabricated an
 * `aria-controls` pointing at a panel that never existed — a real bug, not
 * just a lint nit), and roving tabindex now also governs the row's nested
 * play/default-star controls so an inactive row contributes zero Tab
 * stops (previously always-focusable regardless of row state).
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
        expect(screen.getByRole('listbox')).toHaveAttribute('aria-orientation', 'horizontal');
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
        expect(screen.getByRole('listbox')).toHaveAttribute('aria-orientation', 'vertical');
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
        fireEvent.click(screen.getByRole('option', { name: /Angry/ }));
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
        const options = screen.getAllByRole('option');
        options[0].focus();
        fireEvent.keyDown(options[0], { key: 'ArrowRight' });
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
        const options = screen.getAllByRole('option');
        options[0].focus();
        fireEvent.keyDown(options[0], { key: 'ArrowDown' });
        expect(onSelect).toHaveBeenCalledWith(profiles[1].name);

        // ArrowRight/ArrowLeft must NOT navigate in rail (vertical) mode.
        onSelect.mockClear();
        fireEvent.keyDown(options[0], { key: 'ArrowRight' });
        expect(onSelect).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // ARIA re-model (design-critique follow-up, 2026-07-15)
    // -----------------------------------------------------------------------

    it('uses role="listbox"/"option" (not the old fabricated tablist/tab pattern)', () => {
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
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
        expect(screen.queryByRole('tab')).not.toBeInTheDocument();
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        expect(screen.getAllByRole('option')).toHaveLength(2);
    });

    it('does not fabricate aria-controls pointing at a nonexistent panel', () => {
        const profiles = [makeProfile({ variant_name: 'Calm' })];
        render(
            <VariantSwitcher
                profiles={profiles}
                selectedVariantName={profiles[0].name}
                onSelect={vi.fn()}
                onSetDefault={vi.fn()}
                voiceName="Aria Nova"
            />
        );
        expect(screen.getByRole('option')).not.toHaveAttribute('aria-controls');
    });

    it('Tab from outside the group lands on exactly one element: the active option', () => {
        // Regression for A11Y-2: previously the nested play/default-star
        // controls were always tabIndex=0 regardless of row state, so an
        // inactive row (even one that sorts before the active row in DOM)
        // would still produce reachable Tab stops before the active option.
        const profiles = [
            makeProfile({ variant_name: 'Calm' }),
            makeProfile({ variant_name: 'Angry' }), // active — sorts second
        ];
        render(
            <>
                <button type="button">before</button>
                <VariantSwitcher
                    profiles={profiles}
                    selectedVariantName={profiles[1].name}
                    onSelect={vi.fn()}
                    onSetDefault={vi.fn()}
                    voiceName="Aria Nova"
                />
            </>
        );
        const options = screen.getAllByRole('option');
        const inactiveOption = options[0];
        const activeOption = options[1];

        expect(inactiveOption).toHaveAttribute('tabIndex', '-1');
        expect(activeOption).toHaveAttribute('tabIndex', '0');

        // The inactive row's nested play/star controls must not be Tab
        // stops either — only the active row's own controls should be.
        const inactivePlay = screen.getByRole('button', { name: /Play Calm preview/ });
        const activePlay = screen.getByRole('button', { name: /Play Angry preview/ });
        expect(inactivePlay).toHaveAttribute('tabIndex', '-1');
        expect(activePlay).toHaveAttribute('tabIndex', '0');
    });

    it('Arrow keys move the roving selection without leaving the row\'s own play/star buttons reachable via Tab', () => {
        const profiles = [
            makeProfile({ variant_name: 'Calm' }),
            makeProfile({ variant_name: 'Angry' }),
        ];
        const { rerender } = render(
            <VariantSwitcher
                profiles={profiles}
                selectedVariantName={profiles[0].name}
                onSelect={vi.fn()}
                onSetDefault={vi.fn()}
                voiceName="Aria Nova"
            />
        );

        // Before moving: row 0 (Calm) is active, so only its nested controls
        // are Tab-reachable.
        expect(screen.getByRole('button', { name: /Play Calm preview/ })).toHaveAttribute('tabIndex', '0');
        expect(screen.getByRole('button', { name: /Play Angry preview/ })).toHaveAttribute('tabIndex', '-1');
        expect(screen.getAllByRole('button', { name: 'Default variant for Aria Nova' })[0]).toHaveAttribute('tabIndex', '0');
        expect(screen.getAllByRole('button', { name: 'Default variant for Aria Nova' })[1]).toHaveAttribute('tabIndex', '-1');

        // Simulate the selection changing (as the parent would after
        // onSelect fires from an Arrow keydown) and confirm the roving
        // group hands off Tab-reachability to the newly-active row.
        rerender(
            <VariantSwitcher
                profiles={profiles}
                selectedVariantName={profiles[1].name}
                onSelect={vi.fn()}
                onSetDefault={vi.fn()}
                voiceName="Aria Nova"
            />
        );

        expect(screen.getByRole('button', { name: /Play Calm preview/ })).toHaveAttribute('tabIndex', '-1');
        expect(screen.getByRole('button', { name: /Play Angry preview/ })).toHaveAttribute('tabIndex', '0');
    });

    // H-4 (design-critique follow-up): the variant-default control and the catalog
    // card's app-default badge previously shared the same `Star` icon, differing
    // only by color (accent-blue vs. amber) — now they use distinct icon shapes.
    it('renders the variant-default control with a BadgeCheck icon, not the shared Star used on the catalog card', () => {
        const profiles = [makeProfile({ variant_name: 'Calm', is_variant_default: true })];
        render(
            <VariantSwitcher
                profiles={profiles}
                selectedVariantName={profiles[0].name}
                onSelect={vi.fn()}
                onSetDefault={vi.fn()}
                voiceName="Aria Nova"
            />
        );
        const star = screen.getByRole('button', { name: 'Default variant for Aria Nova' });
        expect(star.querySelector('svg.lucide-badge-check')).toBeInTheDocument();
        expect(star.querySelector('svg.lucide-star')).not.toBeInTheDocument();
    });

    it('sizes the play and default-star controls to at least 44px (was 24px)', () => {
        const profiles = [makeProfile({ variant_name: 'Calm' })];
        render(
            <VariantSwitcher
                profiles={profiles}
                selectedVariantName={profiles[0].name}
                onSelect={vi.fn()}
                onSetDefault={vi.fn()}
                voiceName="Aria Nova"
            />
        );
        const playButton = screen.getByRole('button', { name: /Play Calm preview/ });
        const starButton = screen.getByRole('button', { name: 'Default variant for Aria Nova' });
        expect(playButton.style.width).toBe('44px');
        expect(playButton.style.height).toBe('44px');
        expect(starButton.style.width).toBe('44px');
        expect(starButton.style.height).toBe('44px');
    });
});
