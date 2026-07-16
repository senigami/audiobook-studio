/**
 * VoiceCatalogCard.tsx — R5-T3 (actions consolidated, task 002 voice-variants-round2)
 *
 * Grid card for the Voices catalog. Displays:
 * - Circular avatar (uploaded icon if available, else User lucide on accent tint), with a
 *   Play/Pause preview control revealed as a hover/focus overlay (never hover-only — see
 *   INV-FOCUS below)
 * - Default-voice star badge (top-left) and untagged badge
 * - Voice name — a real `<button>`, the sole navigate-to-Voice-Lab (or, in select mode,
 *   toggle-selection) affordance in the body (see A11Y-3 note below)
 * - VoicePillRow (max 3, overflow collapses)
 * - One-line description
 * - Build (or phase-appropriate primary CTA, from getPrimaryCta/getVoicePhase) — the sole
 *   always-visible action button
 * - ⋯ ActionMenu (top-right): Rename Voice / Export Voice Bundle / Set as App Default / Delete
 *
 * "Open in Voice Lab" (redundant with the card body/CTA, which already navigate there),
 * "Edit Metadata" (→ VoiceLabPage Overview tab), "Edit Recording Script" (→ Test tab), and
 * "Voice Settings" (→ Variants tab) were relocated to the consolidated voice detail page
 * (task 006, voice-card-consolidation plan) — see VoiceDetailTabs/VoiceLabPage.
 *
 * A11Y-3 (design-critique follow-up): the card body used to be one `role="button"` div
 * wrapping the avatar/name/pills/description, nesting the avatar's real play `<button>`,
 * `VoicePillRow`'s own "+N more" toggle button, and `UntaggedBadge`'s click target inside
 * another button/role — invalid ARIA (interactive content inside a button) and confusing
 * for assistive tech. The navigate-to-Voice-Lab (or toggle-selection) affordance is now
 * scoped to just the name `<button>`; the body wrapper itself carries no role/handlers.
 *
 * INV-FOCUS (design-system.md §8.1 focus-visible rule): the avatar's Play/Pause overlay is
 * a real, always-in-DOM, always-tabbable `<button>` — visibility is gated by CSS `opacity`
 * (0 at rest, 1 on `.voice-catalog-card__avatar:hover` or the button's own `:focus-visible`),
 * never by `display: none`/`visibility: hidden`, so it stays reachable via Tab and touch
 * regardless of hover state.
 */
import React from 'react';
import { User, Star, Download, FileEdit, Trash2, Play, Pause, Loader2 } from 'lucide-react';
import type { Speaker, SpeakerProfile, TtsEngine, VoiceMetadata } from '@/types';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { EngineBadge } from '@/components/ui/EngineBadge';
import { VoicePillRow, UntaggedBadge, voicePillsFromMetadata } from '@/pages/Voices/components/VoicePills';
import { getVoicePhase, getPrimaryCta } from '@/pages/Voices/voicePhase';
import { usePlayerBus, loadAndPlay, pause as pauseBus } from '@/store/playerBus';
import { emitToast } from '@/utils/toast';
import { formatVoiceEngineLabel, getVoiceProfileEngine, isVoiceProfileSelectable } from '@/utils/voiceProfiles';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VoiceCatalogCardProps {
    speaker: Speaker;
    profiles: SpeakerProfile[];
    engines: TtsEngine[];
    buildingProfiles: Record<string, boolean>;
    testProgress: Record<string, { progress: number; started_at?: number }>;
    metadata?: VoiceMetadata;
    /** Called when primary CTA "Build voice" is clicked */
    onBuildNow: (name: string, files: File[], speakerId?: string, variantName?: string) => Promise<boolean>;
    onNavigateToLab: (voiceId: string) => void;
    onSetDefaultClick: (profileName: string) => void;
    onRenameClick: (speaker: Speaker) => void;
    onExportVoice?: (voiceName: string) => void;
    requestConfirm: (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean }) => void;
    /** Still used for the untagged-badge affordance in the card body; Edit Metadata is no
     * longer a menu item (relocated to the VoiceLabPage Overview tab, task 006). */
    onEditMetadata?: () => void;
    onRefresh: () => void;
    /** Multi-select (bulk delete/export) — omit to render the card in its normal single-voice mode. */
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VoiceCatalogCard: React.FC<VoiceCatalogCardProps> = ({
    speaker,
    profiles,
    engines,
    buildingProfiles,
    metadata,
    onBuildNow,
    onNavigateToLab,
    onSetDefaultClick,
    onRenameClick,
    onExportVoice,
    requestConfirm,
    onEditMetadata,
    onRefresh,
    selectable = false,
    selected = false,
    onToggleSelect,
}) => {
    const playerBus = usePlayerBus();

    // Derive active/default profile
    const defaultProfile =
        profiles.find(p => p.is_default && isVoiceProfileSelectable(p, engines)) ||
        profiles.find(p => isVoiceProfileSelectable(p, engines)) ||
        profiles[0];

    const phase = getVoicePhase(profiles, engines, buildingProfiles);
    const cta = getPrimaryCta(phase);
    const isBuilding = phase === 'building';

    const pills = metadata ? voicePillsFromMetadata(metadata) : [];
    const isUntagged = metadata?.is_untagged ?? (!metadata);
    const hasDefaultProfile = profiles.some(p => p.is_default);

    // Preview — route through playerBus (ADR-0010)
    const previewUrl = defaultProfile?.preview_url ?? null;
    const isPlaying =
        playerBus.scope === 'preview' &&
        playerBus.audioUrl === previewUrl &&
        playerBus.playing;

    // Owner-requested (2026-07-16): Build voice is no longer a separate
    // always-visible CTA — clicking Play now triggers a build first if the
    // voice isn't built yet, then plays once ready, so the avatar's play
    // control is the single action a user needs on the card (everything else
    // lives in the kebab or is reached by clicking through to Voice Lab, per
    // the card body's own navigate-on-click). Falls through to the ordinary
    // play/pause toggle once cta.intent isn't 'build' (already built).
    const handlePreview = () => {
        if (isBuilding) return; // already in flight — button is disabled, but guard direct calls too
        if (cta.intent === 'build' && defaultProfile) {
            onBuildNow(defaultProfile.name, [], speaker.id || undefined, defaultProfile.variant_name || undefined)
                .then(ok => {
                    if (ok) emitToast(`Queued build for ${speaker.name}`);
                });
            return;
        }
        if (!previewUrl) return;
        if (isPlaying) {
            pauseBus();
        } else {
            loadAndPlay({
                scope: 'preview',
                title: speaker.name,
                subtitle: 'Voice preview',
                audioUrl: previewUrl,
            });
        }
    };

    // Engine badge
    const activeEngine = getVoiceProfileEngine(defaultProfile) || null;
    const activeEngineInfo = engines.find(e => e.engine_id === activeEngine);
    const activeEngineSelectable = defaultProfile ? isVoiceProfileSelectable(defaultProfile, engines) : false;
    const isCloudEngine = activeEngineInfo?.cloud === true;

    const engineBadgeTone = !activeEngineSelectable ? 'muted' : isCloudEngine ? 'cloud' : 'accent';
    const engineBadgeLabel = activeEngineInfo?.display_name || formatVoiceEngineLabel(activeEngine || '');

    // Delete
    const handleDelete = () => {
        requestConfirm({
            title: 'Delete voice?',
            message: `Delete voice '${speaker.name}' and all ${profiles.length} variant${profiles.length !== 1 ? 's' : ''}? This cannot be undone.`,
            isDestructive: true,
            onConfirm: () => {
                const deleteUrl = speaker.id
                    ? `/api/speakers/${speaker.id}`
                    : `/api/speaker-profiles/${encodeURIComponent(profiles[0]?.name || '')}`;
                fetch(deleteUrl, { method: 'DELETE' }).then(resp => {
                    if (resp.ok) onRefresh();
                });
            },
        });
    };

    // Voice icon
    const iconUrl = metadata?.image ? `/api/voices/${encodeURIComponent(speaker.id)}/icon` : null;

    return (
        <div className="voice-catalog-card">
            {/* Selection checkbox — top-left, mirrors the default-badge's top-right corner
                placement. Only rendered in bulk-select mode (persona fast-follow: Large
                Catalog Curator, one-card-at-a-time destructive/organizational actions). */}
            {selectable && (
                <label
                    className="voice-catalog-card__select-checkbox"
                    aria-label={`Select ${speaker.name} checkbox`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect?.()}
                    />
                </label>
            )}

            {/* Overflow menu — top-right. Rename / Export / Set as App Default / Delete
                (task 002: consolidated out of the always-visible actions row). */}
            <div className="voice-catalog-card__menu">
                <ActionMenu
                    items={[
                        {
                            label: 'Rename Voice',
                            icon: FileEdit,
                            onClick: () => onRenameClick(speaker),
                        },
                        {
                            label: 'Export Voice Bundle',
                            icon: Download,
                            onClick: () => onExportVoice?.(speaker.name),
                        },
                        { isDivider: true },
                        {
                            label: 'Set as App Default',
                            icon: Star,
                            disabled: hasDefaultProfile,
                            onClick: () => defaultProfile && onSetDefaultClick(defaultProfile.name),
                        },
                        { isDivider: true },
                        {
                            label: 'Delete',
                            icon: Trash2,
                            isDestructive: true,
                            onClick: handleDelete,
                        },
                    ]}
                />
            </div>

            {/*
              * Card body — wrapper for the avatar, name, pills, and description.
              * A11Y-3: this used to be a single role="button" spanning the whole
              * body, which nested the avatar's real play <button>, VoicePillRow's
              * own "+N more" toggle button, and UntaggedBadge's click target
              * inside another button/role — invalid ARIA (interactive content
              * inside a button) and confusing for screen readers. The
              * keyboard-accessible navigate-to-Voice-Lab affordance is the name
              * button below (a real <button>, no nested interactives).
              *
              * User-reported follow-up: scoping the click target to just the
              * name text left no obvious way to open a voice with the mouse.
              * The body wrapper below adds a plain (no role/tabIndex) onClick
              * that navigates for clicks anywhere in its "dead space" — but
              * defers to a nested interactive element's own handler (checked via
              * closest('button, [role="button"], a')) rather than double-firing,
              * so the play button/pills toggle/untagged badge still work exactly
              * as before. This container makes no ARIA role claim, so it doesn't
              * reintroduce A11Y-3 — it's a mouse-convenience affordance layered
              * on top of the real keyboard-operable name button, not a
              * replacement for it.
              */}
            <div
                data-testid="voice-catalog-card-body"
                className="voice-catalog-card__body"
                onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('button, [role="button"], a')) return;
                    if (selectable) onToggleSelect?.();
                    else onNavigateToLab(speaker.id);
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}
            >
                {/* Header row (owner-requested layout, 2026-07-16): star + avatar in a
                    left column, name/engine/pills in a right column — replaces the
                    prior fully-centered stack. The default-star (previously an
                    absolutely-positioned card-level badge) now sits inline directly
                    above the avatar, still a status indicator only (not a button —
                    setting default is an action, done via the kebab's "Set as App
                    Default" item). H-4: this app-default `Star` and
                    VariantSwitcher's per-variant-default control differ by icon shape
                    (`Star` vs. `BadgeCheck`), not color alone. */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', width: '100%', textAlign: 'left' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        {hasDefaultProfile && (
                            <span className="voice-catalog-card__default-star" aria-label="App default voice" title="App default voice">
                                <Star size={12} fill="currentColor" />
                            </span>
                        )}
                        {/* Avatar — hosts the Play/Pause preview overlay (INV-FOCUS, see file header) */}
                        <div className="voice-catalog-card__avatar" style={{ marginTop: hasDefaultProfile ? '4px' : 0 }}>
                            {iconUrl ? (
                                <img src={iconUrl} alt={`${speaker.name} icon`} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                                <User size={20} />
                            )}
                            <button
                                type="button"
                                aria-label={
                                    isBuilding ? 'Building…'
                                        : cta.intent === 'build' ? 'Build voice'
                                            : isPlaying ? 'Pause preview' : 'Play preview'
                                }
                                disabled={isBuilding || (cta.intent !== 'build' && !previewUrl)}
                                tabIndex={0}
                                onClick={handlePreview}
                                className="voice-catalog-card__avatar-play-btn"
                            >
                                {isBuilding ? <Loader2 size={14} className="animate-spin" />
                                    : isPlaying ? <Pause size={14} /> : <Play size={14} />}
                            </button>
                        </div>
                    </div>

                    <div style={{ minWidth: 0, flex: 1, paddingTop: '2px' }}>
                        {/* Name — the sole navigate-to-Voice-Lab (or, in select mode,
                            toggle-selection) affordance, a real <button> with no nested
                            interactive descendants (A11Y-3). */}
                        <button
                            type="button"
                            data-testid="voice-catalog-card-name-btn"
                            aria-label={selectable ? `Select ${speaker.name}` : `Open ${speaker.name} in Voice Lab`}
                            onClick={() => (selectable ? onToggleSelect?.() : onNavigateToLab(speaker.id))}
                            className="voice-catalog-card__name"
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, display: 'block' }}
                        >
                            {speaker.name}
                        </button>

                        {/* Engine — directly under the name (owner-requested placement,
                            matches the order the card already used before this
                            layout change, just re-positioned). */}
                        {activeEngine && (
                            <EngineBadge
                                label={engineBadgeLabel}
                                tone={engineBadgeTone}
                                size="sm"
                                style={{ marginTop: '2px' }}
                            />
                        )}

                        {/* Pills */}
                        {pills.length > 0 ? (
                            <div style={{ display: 'flex', marginTop: '6px', flexWrap: 'wrap' }}>
                                <VoicePillRow pills={pills} max={3} />
                            </div>
                        ) : isUntagged ? (
                            <div style={{ display: 'flex', marginTop: '6px' }}>
                                <UntaggedBadge onClick={onEditMetadata} />
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Description — full card width, below the header row. */}
                {metadata?.description && (
                    <p className="voice-catalog-card__description" style={{ textAlign: 'left' }}>{metadata.description}</p>
                )}
            </div>

        </div>
    );
};
