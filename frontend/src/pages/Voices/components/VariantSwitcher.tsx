/**
 * VariantSwitcher.tsx — voice-variant-tagging-and-ia task 008
 *
 * Count-based variant switcher: renders a horizontal roving-tabindex tab
 * strip when a character has <=4 variants, or a vertical roving-tabindex
 * rail otherwise (see 01-map.md "Parts" > Variant switcher, Connection 7).
 * Both modes share one row subcomponent (name, engine·speed, performance-tag
 * chips, play/pause, default-star) so the two layouts can never drift apart
 * on default-star/tag-chip behavior.
 *
 * Keyboard handling is adapted from `VoiceDetailTabs.tsx`'s roving-tabindex
 * tablist pattern (ArrowLeft/ArrowRight + Home/End, automatic activation,
 * sr-only aria-live announcement) — this component reuses that exact shape,
 * switching to ArrowUp/ArrowDown + `aria-orientation="vertical"` in rail
 * mode per this task's spec.
 *
 * The default-star (INV-DEFAULT-1/INV-DEFAULT-2) is deliberately NOT the
 * same visual treatment as selection state, and NOT the same color/label as
 * the unrelated catalog-card global app-default control (task 011).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Play, Pause, Star } from 'lucide-react';
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
        // role="tab" on a div rather than <button>, so the default-star's real
        // <button> below is never a nested-button (invalid HTML).
        <div
            ref={registerRef}
            role="tab"
            id={`variant-switcher-tab-${profile.name}`}
            aria-controls={`variant-switcher-panel-${profile.name}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={
                'variant-switcher__item' +
                (orientation === 'vertical' ? ' variant-switcher__item--rail' : ' variant-switcher__item--strip') +
                (isActive ? ' variant-switcher__item--active' : '')
            }
            onClick={onActivate}
            onKeyDown={(e) => {
                // `role="tab"` lives on a div here (not a native <button>) so the
                // default-star's real <button> below is never a nested-button —
                // restore native button Enter/Space activation semantics.
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
                    ? `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`
                    : undefined,
                borderBottom: orientation === 'horizontal'
                    ? `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`
                    : undefined,
            }}
        >
            <span
                className="variant-switcher__play"
                role="button"
                tabIndex={0}
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
                    width: 24,
                    height: 24,
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
                    width: 24,
                    height: 24,
                    flexShrink: 0,
                    padding: 0,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: isDefault ? 'var(--accent)' : 'var(--text-muted)',
                }}
            >
                <Star size={14} fill={isDefault ? 'var(--accent)' : 'none'} />
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
        setAnnouncement(`${label} panel selected`);
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
                role="tablist"
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
                convention rather than moving focus off the tablist. */}
            <div className="sr-only" role="status" aria-live="polite">
                {announcement}
            </div>
        </div>
    );
};
