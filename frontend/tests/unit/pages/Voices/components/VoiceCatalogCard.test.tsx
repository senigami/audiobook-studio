/**
 * VoiceCatalogCard.test.tsx — R5-T3
 * Tests: name/pills/badges render; CTA label matches phase; ⋯ menu items fire callbacks;
 * preview button toggles through playerBus (audio boundary mocked).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the playerBus boundary (audio owner)
vi.mock('@/store/playerBus', () => ({
    usePlayerBus: vi.fn(() => ({ scope: null, audioUrl: null, playing: false })),
    loadAndPlay: vi.fn(),
    pause: vi.fn(),
}));

// Mock the toast boundary (a DOM CustomEvent dispatcher, not the unit under test)
vi.mock('@/utils/toast', () => ({
    emitToast: vi.fn(),
}));

// Mock ActionMenu so we can test items without portal/DOM complexity
vi.mock('@/components/ui/ActionMenu', () => ({
    ActionMenu: ({ items }: { items: Array<{ label?: string; onClick?: () => void; isDestructive?: boolean; disabled?: boolean; isDivider?: boolean }> }) => (
        <div data-testid="action-menu">
            {items?.map((item, i) =>
                item.isDivider ? (
                    <hr key={i} data-testid="menu-divider" />
                ) : (
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
            )}
        </div>
    ),
}));

import { VoiceCatalogCard } from '@/pages/Voices/components/VoiceCatalogCard';
import { usePlayerBus, loadAndPlay, pause as pauseBusMock } from '@/store/playerBus';
import { emitToast } from '@/utils/toast';
import type { Speaker, SpeakerProfile, TtsEngine, VoiceMetadata } from '@/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const readyEngine: TtsEngine = {
    engine_id: 'xtts',
    enabled: true,
    status: 'ready',
    display_name: 'XTTS',
    verified: false,
    capabilities: ['voice_build'],
} as TtsEngine;

const speaker: Speaker = {
    id: 'sp-1',
    name: 'Clara Bell',
    default_profile_name: 'Default',
    created_at: 0,
    updated_at: 0,
};

const readyProfile: SpeakerProfile = {
    name: 'Clara Bell - Default',
    wav_count: 3,
    speed: 1.0,
    is_default: true,
    speaker_id: 'sp-1',
    variant_name: 'Default',
    engine: 'xtts',
    preview_url: '/preview/clara.mp3',
    is_rebuild_required: false,
    rebuild_reasons: [],
    is_ready: true,
    has_latent: false,
    voice_asset_id: null,
    reference_sample: null,
    samples: [],
};

const noSamplesProfile: SpeakerProfile = {
    ...readyProfile,
    wav_count: 0,
    is_ready: false,
    preview_url: null,
    samples: [],
};

const metadata: VoiceMetadata = {
    id: 'sp-1',
    name: 'Clara Bell',
    description: 'A clear, bright female narrator voice.',
    is_untagged: false,
    attributes: {
        voice_class: 'human',
        gender: 'feminine',
        age: 'adult',
    },
    tags: ['warm'],
};

const baseProps = {
    speaker,
    engines: [readyEngine],
    buildingProfiles: {},
    testProgress: {},
    metadata,
    onBuildNow: vi.fn().mockResolvedValue(true),
    onNavigateToLab: vi.fn(),
    onSetDefaultClick: vi.fn(),
    onRenameClick: vi.fn(),
    onExportVoice: vi.fn(),
    requestConfirm: vi.fn(),
    onEditMetadata: vi.fn(),
    onRefresh: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VoiceCatalogCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (usePlayerBus as ReturnType<typeof vi.fn>).mockReturnValue({ scope: null, audioUrl: null, playing: false });
    });

    it('renders voice name', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.getByText('Clara Bell')).toBeInTheDocument();
    });

    it('renders attribute pills from metadata', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        // pills: human(class), feminine(gender), adult(age), warm(tag) — 3 visible + +1 overflow
        expect(screen.getByText('human')).toBeInTheDocument();
        expect(screen.getByText('feminine')).toBeInTheDocument();
    });

    it('shows an "App default voice" star when voice has a default profile', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.getByLabelText('App default voice')).toBeInTheDocument();
    });

    it('does NOT show default badge when no profile is default', () => {
        const profiles = [{ ...readyProfile, is_default: false }];
        render(<VoiceCatalogCard {...baseProps} profiles={profiles} />);
        expect(screen.queryByLabelText('App default voice')).not.toBeInTheDocument();
    });

    // H-4: the app-default badge renders lucide's `Star` shape (VariantSwitcher's
    // per-variant-default control uses a distinct `BadgeCheck` shape instead, so the
    // two "default" concepts are never differentiated by color alone).
    it('renders the app-default badge with the Star icon (not shared with the variant-default control)', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        const badge = screen.getByLabelText('App default voice');
        expect(badge.querySelector('svg.lucide-star')).toBeInTheDocument();
    });

    it('shows UntaggedBadge when voice is untagged (no attributes, no tags)', () => {
        const untaggedMeta: VoiceMetadata = { ...metadata, is_untagged: true, attributes: undefined, tags: [] };
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} metadata={untaggedMeta} />);
        expect(screen.getByRole('button', { name: /missing attributes/i })).toBeInTheDocument();
    });

    it('shows description text', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.getByText('A clear, bright female narrator voice.')).toBeInTheDocument();
    });

    it('renders the avatar image via the /api/voices/{id}/icon endpoint, not the raw metadata.image value', () => {
        const metaWithImage: VoiceMetadata = { ...metadata, image: 'projects/1/voices/sp-1/icon.png' };
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} metadata={metaWithImage} />);
        const img = screen.getByAltText('Clara Bell icon');
        expect(img).toHaveAttribute('src', '/api/voices/sp-1/icon');
    });

    it('falls back to the User icon when metadata.image is absent', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.queryByAltText('Clara Bell icon')).not.toBeInTheDocument();
    });

    // ---------------------------------------------------------------------------
    // Play vs. Build (2026-07-16, owner-corrected): the separate always-visible
    // CTA button is retired, but Build is explicitly restored as its own kebab
    // menu item — Play's job is to play; it only falls back to triggering a
    // build when there is genuinely no audio yet (`!previewUrl`), never merely
    // because the phase's cta.intent happens to be 'build' (which is also true
    // for an already-built, playable profile flagged is_rebuild_required).
    // ---------------------------------------------------------------------------

    it('for a READY profile, the avatar play button offers preview, not build', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.getByRole('button', { name: 'Play preview' })).toBeInTheDocument();
    });

    it('for a no-samples profile (navigate-intent, no build material), the play button stays disabled', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[noSamplesProfile]} />);
        const btn = screen.getByRole('button', { name: 'Play preview' });
        expect(btn).toBeDisabled();
    });

    it('regression: a profile with an existing preview_url but is_rebuild_required still plays on click, it does not force a rebuild', () => {
        // The bug: cta.intent === 'build' is ALSO true for a profile that's
        // already built and playable but flagged for a rebuild (new samples,
        // settings changed, etc. — see voicePhase.ts's LABEL_TO_PHASE). Play
        // must play the existing audio, not silently substitute a rebuild.
        const profiles = [{ ...readyProfile, is_rebuild_required: true, rebuild_reasons: ['new_samples'] }];
        render(<VoiceCatalogCard {...baseProps} profiles={profiles} />);

        const btn = screen.getByRole('button', { name: 'Play preview' });
        fireEvent.click(btn);

        expect(loadAndPlay).toHaveBeenCalledWith(expect.objectContaining({ audioUrl: profiles[0].preview_url }));
        expect(baseProps.onBuildNow).not.toHaveBeenCalled();
    });

    it('avatar play button shows "Build voice" and triggers a build when there is no preview yet', () => {
        // Both the avatar play button AND the kebab's Build voice item can
        // share the accessible name "Build voice" in this state — scope to
        // the avatar-specific control via its class, not an ambiguous
        // getByRole (which would match both).
        const profiles = [{ ...readyProfile, preview_url: null, wav_count: 3 }];
        const { container } = render(<VoiceCatalogCard {...baseProps} profiles={profiles} />);

        const btn = container.querySelector('.voice-catalog-card__avatar-play-btn') as HTMLButtonElement;
        expect(btn).toHaveAccessibleName('Build voice');
        fireEvent.click(btn);

        expect(baseProps.onBuildNow).toHaveBeenCalledWith(
            profiles[0].name, [], 'sp-1', profiles[0].variant_name || undefined
        );
    });

    it('avatar play button shows a disabled, spinning "Building…" state while the profile is in buildingProfiles', () => {
        const profiles = [{ ...readyProfile, preview_url: null, wav_count: 3 }];
        const { container } = render(
            <VoiceCatalogCard
                {...baseProps}
                profiles={profiles}
                buildingProfiles={{ [profiles[0].name]: true }}
            />
        );
        const btn = container.querySelector('.voice-catalog-card__avatar-play-btn') as HTMLButtonElement;
        expect(btn).toHaveAccessibleName('Building…');
        expect(btn).toBeDisabled();
    });

    it('Build voice is also reachable and functional as its own kebab menu item, independent of Play', async () => {
        const profiles = [readyProfile]; // already has a preview_url
        render(<VoiceCatalogCard {...baseProps} profiles={profiles} />);

        fireEvent.click(screen.getByTestId('menu-item-Build voice'));

        expect(baseProps.onBuildNow).toHaveBeenCalledWith(
            profiles[0].name, [], 'sp-1', profiles[0].variant_name || undefined
        );
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(emitToast).toHaveBeenCalledWith(expect.stringContaining('Clara Bell'));
    });

    it('the kebab\'s Build voice item is disabled while already building', () => {
        const profiles = [{ ...readyProfile, preview_url: null, wav_count: 3 }];
        render(
            <VoiceCatalogCard
                {...baseProps}
                profiles={profiles}
                buildingProfiles={{ [profiles[0].name]: true }}
            />
        );
        fireEvent.click(screen.getByTestId('menu-item-Building…'));
        expect(baseProps.onBuildNow).not.toHaveBeenCalled();
    });

    // Navigate/test/edit-intent phases no longer have a distinct CTA button —
    // navigation is via the name button / card body, already covered by
    // "clicking the voice name navigates to Voice Lab" and the card-body tests
    // further down.

    // ---------------------------------------------------------------------------
    // Set as App Default — moved into the top-right kebab (task 002 consolidation;
    // originally a direct card action per task 006/011, disabled-logic fix preserved)
    // ---------------------------------------------------------------------------

    it('renders "Set as App Default" inside the overflow menu (not as a standalone direct action)', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[{ ...readyProfile, is_default: false }]} />);
        const menuItem = screen.getByTestId('menu-item-Set as App Default');
        expect(menuItem).toBeInTheDocument();
        expect(screen.getByTestId('action-menu')).toContainElement(menuItem);
    });

    it('clicking "Set as App Default" (menu item) calls onSetDefaultClick with the default profile name', () => {
        const profiles = [{ ...readyProfile, is_default: false }];
        render(<VoiceCatalogCard {...baseProps} profiles={profiles} />);
        fireEvent.click(screen.getByTestId('menu-item-Set as App Default'));
        expect(baseProps.onSetDefaultClick).toHaveBeenCalledWith(profiles[0].name);
    });

    it('disables "Set as App Default" (menu item) when the profile is already the default', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.getByTestId('menu-item-Set as App Default')).toBeDisabled();
    });

    // Regression test for the task 011 disabled-logic fix.
    //
    // Precise prior bug mechanism (confirmed by reading the pre-fix condition and
    // exercising it directly, not assumed): the old disabled expression was
    //   hasDefaultProfile && profiles.find(p => p.is_default)?.name === defaultProfile?.name
    // For the common case — this card's own currently-default profile IS selectable
    // (isVoiceProfileSelectable true) — `defaultProfile` always resolves to that same
    // profile first (its derivation prioritizes `is_default && selectable`), so the
    // second clause was tautologically true whenever `hasDefaultProfile` was true.
    // That means, for ordinary single- or multi-profile cards, the old condition was
    // behaviorally IDENTICAL to the simplified `hasDefaultProfile` used after the fix
    // (verified: neither a second card that doesn't hold default status, nor a
    // same-card multi-profile case with a selectable default, changes value across the
    // two versions of the condition).
    //
    // The one case where the two conditions actually diverge is when THIS card's own
    // default profile is present but NOT selectable (e.g. its engine is missing/
    // disabled) while a sibling profile in the SAME card is selectable: the old
    // tautology broke down there (`defaultProfile` fell through to the sibling, whose
    // name differs from the still-marked-default profile's name), so `disabled`
    // evaluated to `false` — the button was enabled and, if clicked, pointed the
    // app-wide default at the sibling profile even though this card's voice already
    // held default status via its other (unselectable) profile. The fix's simplified
    // `disabled={hasDefaultProfile}` closes this: once ANY of this card's own profiles
    // holds default status, the button stays disabled regardless of that profile's
    // current selectability.
    it('disables "Set as App Default" (menu item) when this card already holds default status via an unselectable profile, even though a sibling profile in the same card is selectable', () => {
        const profiles = [
            { ...readyProfile, name: 'Clara Bell - A', is_default: true, engine: 'nonexistent-engine' },
            { ...readyProfile, name: 'Clara Bell - B', is_default: false, engine: 'xtts' },
        ];
        render(<VoiceCatalogCard {...baseProps} profiles={profiles} />);
        expect(screen.getByTestId('menu-item-Set as App Default')).toBeDisabled();
    });

    it('a different card whose own voice does not currently hold default status shows its menu item enabled', () => {
        const profiles = [{ ...readyProfile, name: 'Other Voice', is_default: false }];
        render(<VoiceCatalogCard {...baseProps} profiles={profiles} />);
        expect(screen.getByTestId('menu-item-Set as App Default')).not.toBeDisabled();
    });

    // ---------------------------------------------------------------------------
    // Delete — moved into the top-right kebab (task 002 consolidation; originally a
    // direct card action per task 006, corrected per persona findings)
    // ---------------------------------------------------------------------------

    it('renders "Delete" inside the overflow menu (not as a standalone direct action)', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.getByTestId('menu-item-Delete')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /delete voice/i })).not.toBeInTheDocument();
    });

    it('clicking "Delete" (menu item) fires requestConfirm', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByTestId('menu-item-Delete'));
        expect(baseProps.requestConfirm).toHaveBeenCalledWith(expect.objectContaining({
            isDestructive: true,
        }));
    });

    // ---------------------------------------------------------------------------
    // Overflow menu — Rename/Export/Set-as-App-Default/Delete (task 002 consolidation)
    // ---------------------------------------------------------------------------

    it('action menu contains Build voice/Rename/Export/Set-as-App-Default/Delete — Open in Voice Lab/Edit Metadata/Edit Recording Script/Voice Settings remain removed', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.getByTestId('menu-item-Build voice')).toBeInTheDocument();
        expect(screen.getByTestId('menu-item-Rename Voice')).toBeInTheDocument();
        expect(screen.getByTestId('menu-item-Export Voice Bundle')).toBeInTheDocument();
        expect(screen.getByTestId('menu-item-Set as App Default')).toBeInTheDocument();
        expect(screen.getByTestId('menu-item-Delete')).toBeInTheDocument();
        expect(screen.queryByTestId('menu-item-Set as Default')).not.toBeInTheDocument();
        expect(screen.queryByTestId('menu-item-Open in Voice Lab')).not.toBeInTheDocument();
        expect(screen.queryByTestId('menu-item-Edit Metadata')).not.toBeInTheDocument();
        expect(screen.queryByTestId('menu-item-Edit Recording Script')).not.toBeInTheDocument();
        expect(screen.queryByTestId('menu-item-Voice Settings')).not.toBeInTheDocument();
    });

    it('clicking the voice name navigates to Voice Lab', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByTestId('voice-catalog-card-name-btn'));
        expect(baseProps.onNavigateToLab).toHaveBeenCalledWith('sp-1');
    });

    // ---------------------------------------------------------------------------
    // A11Y-3 — the card body carries no role/tabIndex of its own (so it never
    // nests interactive descendants inside another interactive role), but DOES
    // navigate on click as a mouse convenience (user-reported: name-only click
    // target wasn't discoverable) — deferring to a nested control's own handler
    // rather than double-firing.
    // ---------------------------------------------------------------------------

    it('the card body wrapper carries no button role/tabIndex, but clicking its dead space navigates', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        const body = screen.getByTestId('voice-catalog-card-body');
        expect(body).not.toHaveAttribute('role');
        expect(body).not.toHaveAttribute('tabindex');
        fireEvent.click(body);
        expect(baseProps.onNavigateToLab).toHaveBeenCalledWith('sp-1');
    });

    it('clicking a nested interactive control (play button) does not also fire body navigation', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByLabelText('Play preview'));
        expect(baseProps.onNavigateToLab).not.toHaveBeenCalled();
    });

    it('in select mode, clicking the body dead space toggles selection instead of navigating', () => {
        const onToggleSelect = vi.fn();
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} selectable onToggleSelect={onToggleSelect} />);
        const body = screen.getByTestId('voice-catalog-card-body');
        fireEvent.click(body);
        expect(onToggleSelect).toHaveBeenCalled();
        expect(baseProps.onNavigateToLab).not.toHaveBeenCalled();
    });

    it('the voice name is a real, independently focusable <button>', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        const nameBtn = screen.getByTestId('voice-catalog-card-name-btn');
        expect(nameBtn.tagName).toBe('BUTTON');
        nameBtn.focus();
        expect(nameBtn).toHaveFocus();
    });

    it('pressing Enter/Space on the voice name navigates to Voice Lab (native button activation)', async () => {
        const user = userEvent.setup();
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        const nameBtn = screen.getByTestId('voice-catalog-card-name-btn');
        nameBtn.focus();
        await user.keyboard('{Enter}');
        expect(baseProps.onNavigateToLab).toHaveBeenCalledWith('sp-1');
        baseProps.onNavigateToLab.mockClear();
        await user.keyboard(' ');
        expect(baseProps.onNavigateToLab).toHaveBeenCalledWith('sp-1');
    });

    // ---------------------------------------------------------------------------
    // Bulk-select mode (persona fast-follow: Large Catalog Curator)
    // ---------------------------------------------------------------------------

    it('does not render a selection checkbox when selectable is not set', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.queryByLabelText('Select Clara Bell checkbox')).not.toBeInTheDocument();
    });

    it('renders a selection checkbox reflecting `selected` when selectable is true', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} selectable selected />);
        const checkbox = screen.getByLabelText('Select Clara Bell checkbox').querySelector('input');
        expect(checkbox).toBeChecked();
    });

    it('clicking the checkbox fires onToggleSelect and does not navigate', () => {
        const onToggleSelect = vi.fn();
        render(
            <VoiceCatalogCard
                {...baseProps}
                profiles={[readyProfile]}
                selectable
                onToggleSelect={onToggleSelect}
            />
        );
        fireEvent.click(screen.getByLabelText('Select Clara Bell checkbox').querySelector('input')!);
        expect(onToggleSelect).toHaveBeenCalledTimes(1);
        expect(baseProps.onNavigateToLab).not.toHaveBeenCalled();
    });

    it('clicking the voice name toggles selection instead of navigating when selectable', () => {
        const onToggleSelect = vi.fn();
        render(
            <VoiceCatalogCard
                {...baseProps}
                profiles={[readyProfile]}
                selectable
                onToggleSelect={onToggleSelect}
            />
        );
        fireEvent.click(screen.getByTestId('voice-catalog-card-name-btn'));
        expect(onToggleSelect).toHaveBeenCalledTimes(1);
        expect(baseProps.onNavigateToLab).not.toHaveBeenCalled();
    });

    it('Rename Voice fires onRenameClick', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByTestId('menu-item-Rename Voice'));
        expect(baseProps.onRenameClick).toHaveBeenCalledWith(speaker);
    });

    it('shows UntaggedBadge that still fires onEditMetadata (Edit Metadata itself moved to the detail page, but the untagged-badge affordance stays)', () => {
        const untaggedMeta: VoiceMetadata = { ...metadata, is_untagged: true, attributes: undefined, tags: [] };
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} metadata={untaggedMeta} />);
        fireEvent.click(screen.getByRole('button', { name: /missing attributes/i }));
        expect(baseProps.onEditMetadata).toHaveBeenCalled();
    });

    it('Export Voice Bundle fires onExportVoice', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByTestId('menu-item-Export Voice Bundle'));
        expect(baseProps.onExportVoice).toHaveBeenCalledWith('Clara Bell');
    });

    // ---------------------------------------------------------------------------
    // Preview button — mocked playerBus
    // ---------------------------------------------------------------------------

    it('preview button is disabled when no preview_url', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[noSamplesProfile]} />);
        const btn = screen.getByRole('button', { name: 'Play preview' });
        expect(btn).toBeDisabled();
    });

    it('preview button calls loadAndPlay when profile has preview_url', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Play preview' }));
        expect(loadAndPlay).toHaveBeenCalledWith(expect.objectContaining({
            scope: 'preview',
            audioUrl: '/preview/clara.mp3',
        }));
    });

    it('preview button shows Pause and calls pause when already playing', () => {
        (usePlayerBus as ReturnType<typeof vi.fn>).mockReturnValue({
            scope: 'preview',
            audioUrl: '/preview/clara.mp3',
            playing: true,
        });
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        const btn = screen.getByRole('button', { name: 'Pause preview' });
        fireEvent.click(btn);
        expect(pauseBusMock).toHaveBeenCalled();
    });

    // ---------------------------------------------------------------------------
    // INV-FOCUS — the avatar play overlay must be keyboard/touch reachable, never
    // hover-only (task 002)
    // ---------------------------------------------------------------------------

    it('the avatar play overlay is present and focusable without any prior hover/mouseover event', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        const btn = screen.getByRole('button', { name: 'Play preview' });
        // No hover/mouseEnter fired anywhere above — getByRole finding it in the
        // accessibility tree already proves it's not display:none/hidden-gated.
        expect(btn).toBeInTheDocument();
        expect(btn).not.toHaveAttribute('tabindex', '-1');
        btn.focus();
        expect(btn).toHaveFocus();
    });

    it('activating the avatar play overlay via click does not also trigger card-body navigation', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Play preview' }));
        expect(baseProps.onNavigateToLab).not.toHaveBeenCalled();
    });
});
