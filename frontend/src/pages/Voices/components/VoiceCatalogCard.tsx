/**
 * VoiceCatalogCard.tsx — R5-T3 (actions consolidated, task 002 voice-variants-round2)
 *
 * Grid card for the Voices catalog. Displays:
 * - Circular avatar (uploaded icon if available, else User lucide on accent tint), with a
 *   Play/Pause preview control revealed as a hover/focus overlay (never hover-only — see
 *   INV-FOCUS below)
 * - Default-voice star badge (top-left) and untagged badge
 * - Voice name
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

    const handlePreview = () => {
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

    // CTA handler
    const handleCta = () => {
        if (isBuilding) return; // already in flight — the button is disabled, but guard direct calls too
        if (cta.intent === 'build' && defaultProfile) {
            onBuildNow(defaultProfile.name, [], speaker.id || undefined, defaultProfile.variant_name || undefined)
                .then(ok => {
                    if (ok) emitToast(`Queued build for ${speaker.name}`);
                });
        } else {
            onNavigateToLab(speaker.id);
        }
    };

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

            {/* Default status — star badge, top-left (freeing the top-right corner for the
                kebab). Status indicator only, not a button: setting default is an action,
                done via the kebab's "Set as App Default" item. */}
            {hasDefaultProfile && (
                <span className="voice-catalog-card__default-star" aria-label="App default voice" title="App default voice">
                    <Star size={12} fill="currentColor" />
                </span>
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
              * Card body — name/avatar area is an explicit affordance for
              * opening Voice Lab (blocker 3), independent of the primary
              * CTA's phase-driven label/intent. Keyboard-accessible via
              * role="button" + Enter/Space, mirroring onNavigateToLab used
              * elsewhere on this card.
              *
              * In select mode, the body toggles selection instead of
              * navigating away — clicking a card while curating a bulk
              * action shouldn't leave the page.
              */}
            <div
                data-testid="voice-catalog-card-body"
                role="button"
                tabIndex={0}
                aria-label={selectable ? `Select ${speaker.name}` : `Open ${speaker.name} in Voice Lab`}
                onClick={() => (selectable ? onToggleSelect?.() : onNavigateToLab(speaker.id))}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (selectable) onToggleSelect?.();
                        else onNavigateToLab(speaker.id);
                    }
                }}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', width: '100%' }}
            >
                {/* Avatar — hosts the Play/Pause preview overlay (INV-FOCUS, see file header) */}
                <div className="voice-catalog-card__avatar">
                    {iconUrl ? (
                        <img src={iconUrl} alt={`${speaker.name} icon`} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                        <User size={20} />
                    )}
                    <button
                        type="button"
                        aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                        disabled={!previewUrl}
                        tabIndex={0}
                        onClick={(e) => {
                            e.stopPropagation();
                            handlePreview();
                        }}
                        onKeyDown={(e) => {
                            // Stop Enter/Space from bubbling to the card body's own
                            // navigate-on-Enter/Space handler — the button already
                            // handles its own activation natively.
                            e.stopPropagation();
                        }}
                        className="voice-catalog-card__avatar-play-btn"
                    >
                        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                </div>

                {/* Name */}
                <div className="voice-catalog-card__name">{speaker.name}</div>

                {/* Engine badge */}
                {activeEngine && (
                    <EngineBadge
                        label={engineBadgeLabel}
                        tone={engineBadgeTone}
                        size="sm"
                        style={{ marginBottom: '4px' }}
                    />
                )}

                {/* Pills */}
                {pills.length > 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <VoicePillRow pills={pills} max={3} />
                    </div>
                ) : isUntagged ? (
                    <div style={{ display: 'flex', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <UntaggedBadge onClick={onEditMetadata} />
                    </div>
                ) : null}

                {/* Description */}
                {metadata?.description && (
                    <p className="voice-catalog-card__description">{metadata.description}</p>
                )}
            </div>

            {/* Actions row — Build (or phase-appropriate CTA) is the sole always-visible
                action (OD-4). Play moved to a hover/focus overlay on the avatar; Rename,
                Export, Set as App Default, and Delete moved into the top-right kebab
                (task 002, INV-VC-2: all remain reachable). */}
            <div className="voice-catalog-card__actions">
                <button
                    type="button"
                    onClick={handleCta}
                    disabled={isBuilding}
                    className="btn-primary voice-catalog-card__cta-btn"
                >
                    {isBuilding && <Loader2 size={12} className="animate-spin" />}
                    {cta.label}
                </button>
            </div>
        </div>
    );
};
