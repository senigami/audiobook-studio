/**
 * VariantSwitcher.tsx — voice-variant-tagging-and-ia task 008
 * (ARIA re-model: design-critique follow-up, 2026-07-15 — see
 * docs/code-map/queue/ for the changelog entry)
 *
 * Count-based variant switcher: renders a horizontal roving-tabindex
 * strip when a character has <=4 variants, or a vertical roving-tabindex
 * rail otherwise (see 01-map.md "Parts" > Variant switcher, Connection 7).
 * Both modes share one row subcomponent (name, engine·speed, performance-tag
 * chips, play/pause, default-star) so the two layouts can never drift apart
 * on default-star/tag-chip behavior.
 *
 * This is a single-select list of variants, not a set of tab panels — it is
 * modeled as `role="listbox"` + `role="option"` (matching the existing
 * listbox/option/roving-tabindex convention in
 * `ChapterWorkspaceHeader.tsx`'s chapter-switcher dropdown) rather than
 * `role="tablist"`/`"tab"`. The earlier tab modeling fabricated
 * `aria-controls="variant-switcher-panel-*"` pointing at an element that
 * never existed (no matching `VariantEditor` panel had that id/role) — a
 * real bug, not just a lint nit. The sr-only aria-live announcement below
 * already tells screen-reader users which variant is now shown, so no
 * `aria-owns`/panel id was reintroduced to replace it.
 *
 * Keyboard handling (ArrowLeft/ArrowRight + Home/End in strip mode,
 * ArrowUp/ArrowDown + `aria-orientation="vertical"` in rail mode, automatic
 * activation, sr-only aria-live announcement) is unchanged from the
 * original tab-pattern version — only the roles/ids changed, not the nav
 * model. Roving tabindex now also governs the row's nested play/default-star
 * controls (`tabIndex={isActive ? 0 : -1}` on all three), so an inactive
 * row contributes zero Tab stops — previously its play button and
 * default-star were always focusable regardless of row state, producing
 * 2+ Tab stops per row including inactive ones and defeating the roving
 * pattern entirely. Arrow to a row to activate it (and its controls);
 * Tab from there reaches that row's play button, then its default-star,
 * then exits the widget.
 *
 * The default-star (INV-DEFAULT-1/INV-DEFAULT-2) is deliberately NOT the
 * same visual treatment as selection state, and NOT the same color/label as
 * the unrelated catalog-card global app-default control (task 011).
 *
 * H-4 (design-critique follow-up): color alone (accent-blue here vs. amber on
 * the catalog card's app-default star) isn't a reliable differentiator, so
 * this control uses a distinct icon shape too — `BadgeCheck` ("primary pick"
 * within this voice's variants) rather than `Star` ("app default" status,
 * which stays a `Star` on VoiceCatalogCard).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Play, Pause, BadgeCheck } from 'lucide-react';
import type { SpeakerProfile } from '@/types';
import { VoicePillRow, type PillSpec } from '@/pages/Voices/components/VoicePills';
import { usePlayerBus, loadAndPlay, play, pause } from '@/store/playerBus';

export interface VariantSwitcherProps {
    profiles: SpeakerProfile[];
    selectedVariantName: string;
    onSelect: (variantName: string) => void;
    onSetDefault: (variantName: string) => void;
    voiceName: string;
}

/** Threshold: <=4 variants renders the horizontal strip, >4 renders the vertical rail. */
const STRIP_THRESHOLD = 4;

function tagsPillsFor(profile: SpeakerProfile): PillSpec[] {
    return (profile.performance_tags ?? [])
        .filter(tag => typeof tag === 'string' && tag.trim())
        .map(tag => ({ label: tag, category: 'tag', key: 'performance_tags' }));
}

// ---------------------------------------------------------------------------
// Shared per-item row
// ---------------------------------------------------------------------------

interface VariantSwitcherItemProps {
    profile: SpeakerProfile;
    isActive: boolean;
    isDefault: boolean;
    isPlaying: boolean;
    orientation: 'horizontal' | 'vertical';
    voiceName: string;
    onActivate: () => void;
    onSetDefault: () => void;
    onTogglePlay: (e: React.MouseEvent) => void;
    registerRef: (el: HTMLDivElement | null) => void;
}

const VariantSwitcherItem: React.FC<VariantSwitcherItemProps> = ({
    profile,
    isActive,
    isDefault,
    isPlaying,
    orientation,
    voiceName,
    onActivate,
    onSetDefault,
    onTogglePlay,
    registerRef,
}) => {
    const label = profile.variant_name || 'Default';
    const engineSpeed = `${profile.engine ?? 'xtts'} · ${(profile.speed ?? 1).toFixed(1)}x`;
    const pills = tagsPillsFor(profile);

    return (
        // role="option" on a div rather than <button>, so the default-star's
        // real <button> below is never a nested-button (invalid HTML).
        <div
            ref={registerRef}
            role="option"
            id={`variant-switcher-option-${profile.name}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={
                'variant-switcher__item' +
                (orientation === 'vertical' ? ' variant-switcher__item--rail' : ' variant-switcher__item--strip') +
                (isActive ? ' variant-switcher__item--active' : '')
            }
            onClick={onActivate}
            onKeyDown={(e) => {
                // `role="option"` lives on a div here (not a native <button>) so
                // the default-star's real <button> below is never a
                // nested-button — restore native button Enter/Space activation
                // semantics.
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onActivate();
                }
            }}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2)',
                background: 'none',
                borderRadius: 'var(--radius-md, 8px)',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: orientation === 'vertical' ? '100%' : undefined,
                borderLeft: orientation === 'vertical'
                    ? `3px solid ${isActive ? 'var(--action-primary)' : 'transparent'}`
                    : undefined,
                borderBottom: orientation === 'horizontal'
                    ? `2px solid ${isActive ? 'var(--action-primary)' : 'transparent'}`
                    : undefined,
            }}
        >
            <span
                className="variant-switcher__play"
                role="button"
                // Roving-tabindex extends to this row's nested controls: only
                // the active row's play button is a Tab stop (an inactive
                // row contributes zero Tab stops, not 2+ — see file header).
                tabIndex={isActive ? 0 : -1}
                aria-label={isPlaying ? `Pause ${label} preview` : `Play ${label} preview`}
                onClick={onTogglePlay}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onTogglePlay(e as unknown as React.MouseEvent);
                    }
                }}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    // WCAG 2.5.5 touch-target minimum (was 24px — matches the
                    // catalog-card play-overlay fix's 44px floor).
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    borderRadius: 'var(--radius-round)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                }}
            >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </span>

            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                <span className="variant-switcher__name" style={{ fontSize: 'var(--type-body)', fontWeight: 600 }}>
                    {label}
                </span>
                <span
                    className="variant-switcher__engine-speed"
                    style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}
                >
                    {engineSpeed}
                </span>
                {pills.length > 0 && <VoicePillRow pills={pills} max={2} />}
            </span>

            <button
                type="button"
                // Roving-tabindex extends to this row's nested controls: only
                // the active row's default-star is a Tab stop (see file header).
                tabIndex={isActive ? 0 : -1}
                aria-pressed={isDefault}
                aria-label={`Default variant for ${voiceName}`}
                onClick={(e) => {
                    e.stopPropagation();
                    onSetDefault();
                }}
                className="variant-switcher__default-star"
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    // WCAG 2.5.5 touch-target minimum (was 24px — matches the
                    // catalog-card play-overlay fix's 44px floor).
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    padding: 0,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: isDefault ? 'var(--action-primary)' : 'var(--text-muted)',
                }}
            >
                <BadgeCheck size={14} fill={isDefault ? 'var(--action-primary)' : 'none'} />
            </button>
        </div>
    );
};

// ---------------------------------------------------------------------------
// VariantSwitcher
// ---------------------------------------------------------------------------

export const VariantSwitcher: React.FC<VariantSwitcherProps> = ({
    profiles,
    selectedVariantName,
    onSelect,
    onSetDefault,
    voiceName,
}) => {
    const isStrip = profiles.length <= STRIP_THRESHOLD;
    const orientation: 'horizontal' | 'vertical' = isStrip ? 'horizontal' : 'vertical';

    const [announcement, setAnnouncement] = useState('');
    const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const playerBus = usePlayerBus();

    const activeIndex = useMemo(
        () => Math.max(0, profiles.findIndex(p => p.name === selectedVariantName)),
        [profiles, selectedVariantName]
    );

    const activate = useCallback((name: string, focusTrigger: boolean) => {
        onSelect(name);
        const profile = profiles.find(p => p.name === name);
        const label = profile?.variant_name || 'Default';
        setAnnouncement(`${label} selected`);
        if (focusTrigger) itemRefs.current[name]?.focus();
    }, [onSelect, profiles]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (profiles.length === 0) return;
        const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
        const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
        let nextIndex: number | null = null;
        switch (e.key) {
            case nextKey:
                nextIndex = (activeIndex + 1) % profiles.length;
                break;
            case prevKey:
                nextIndex = (activeIndex - 1 + profiles.length) % profiles.length;
                break;
            case 'Home':
                nextIndex = 0;
                break;
            case 'End':
                nextIndex = profiles.length - 1;
                break;
            default:
                return;
        }
        e.preventDefault();
        const next = profiles[nextIndex];
        if (next) activate(next.name, true);
    };

    const handleTogglePlay = useCallback((profile: SpeakerProfile) => (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!profile.preview_url) return;
        const isThisPlaying =
            playerBus.scope === 'preview' &&
            playerBus.audioUrl === profile.preview_url &&
            playerBus.playing;
        if (isThisPlaying) {
            pause();
        } else if (playerBus.scope === 'preview' && playerBus.audioUrl === profile.preview_url) {
            play();
        } else {
            loadAndPlay({
                scope: 'preview',
                title: profile.variant_name || 'Default Variant',
                subtitle: profile.name,
                audioUrl: profile.preview_url,
            });
        }
    }, [playerBus.scope, playerBus.audioUrl, playerBus.playing]);

    return (
        <div
            className={
                'variant-switcher' +
                (isStrip ? ' variant-switcher--strip' : ' variant-switcher--rail')
            }
            data-testid={isStrip ? 'variant-switcher-strip' : 'variant-switcher-rail'}
        >
            <div
                role="listbox"
                aria-label={`${voiceName} variants`}
                aria-orientation={orientation}
                className="variant-switcher__list"
                onKeyDown={handleKeyDown}
                style={{
                    display: 'flex',
                    flexDirection: isStrip ? 'row' : 'column',
                    gap: 'var(--space-1)',
                }}
            >
                {profiles.map(profile => {
                    const isActive = profile.name === selectedVariantName;
                    const isDefault = !!profile.is_variant_default;
                    const isPlaying =
                        playerBus.scope === 'preview' &&
                        playerBus.audioUrl === profile.preview_url &&
                        playerBus.playing;
                    return (
                        <VariantSwitcherItem
                            key={profile.name}
                            profile={profile}
                            isActive={isActive}
                            isDefault={isDefault}
                            isPlaying={isPlaying}
                            orientation={orientation}
                            voiceName={voiceName}
                            onActivate={() => activate(profile.name, false)}
                            onSetDefault={() => onSetDefault(profile.name)}
                            onTogglePlay={handleTogglePlay(profile)}
                            registerRef={el => { itemRefs.current[profile.name] = el; }}
                        />
                    );
                })}
            </div>

            {/* sr-only announcement on selection change, mirroring VoiceDetailTabs'
                convention rather than moving focus off the listbox. This is also
                the accessible association between the selection and the panel
                rendered below — no aria-controls/aria-owns needed. */}
            <div className="sr-only" role="status" aria-live="polite">
                {announcement}
            </div>
        </div>
    );
};
