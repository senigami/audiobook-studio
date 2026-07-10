/**
 * VoiceCatalogCard.tsx — R5-T3
 *
 * Grid card for the Voices catalog. Displays:
 * - Circular avatar (uploaded icon if available, else User lucide on accent tint)
 * - default badge (top-right) and untagged badge
 * - Voice name
 * - VoicePillRow (max 3, overflow collapses)
 * - One-line description
 * - Preview (Play) button (routes through playerBus)
 * - Phase-appropriate primary CTA (from getPrimaryCta/getVoicePhase)
 * - ⋯ ActionMenu: Set as default / Edit Metadata / Edit Recording Script / Rename Voice / Export Voice Bundle / Delete Voice
 */
import React from 'react';
import { User, Star, Download, FileEdit, Trash2, Tag, Play, Pause, Mic } from 'lucide-react';
import type { Speaker, SpeakerProfile, TtsEngine, VoiceMetadata } from '@/types';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { VoicePillRow, UntaggedBadge, voicePillsFromMetadata } from '@/pages/Voices/components/VoicePills';
import { getVoicePhase, getPrimaryCta } from '@/pages/Voices/voicePhase';
import { usePlayerBus, loadAndPlay, pause as pauseBus } from '@/store/playerBus';
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
    onEditMetadata?: () => void;
    onEditTestText?: (profile: SpeakerProfile) => void;
    onRefresh: () => void;
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
    onEditTestText,
    onRefresh,
}) => {
    const playerBus = usePlayerBus();

    // Derive active/default profile
    const defaultProfile =
        profiles.find(p => p.is_default && isVoiceProfileSelectable(p, engines)) ||
        profiles.find(p => isVoiceProfileSelectable(p, engines)) ||
        profiles[0];

    const phase = getVoicePhase(profiles, engines, buildingProfiles);
    const cta = getPrimaryCta(phase);

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

    const engineBadgeBg = !activeEngineSelectable
        ? 'var(--accent-focus-ring)'
        : isCloudEngine
            ? 'var(--cloud-tint-bg)'
            : 'var(--accent-tint-bg)';
    const engineBadgeColor = !activeEngineSelectable
        ? 'var(--text-muted)'
        : isCloudEngine
            ? 'var(--cloud-color)'
            : 'var(--accent)';
    const engineBadgeLabel = activeEngineInfo?.display_name || formatVoiceEngineLabel(activeEngine || '');

    // CTA handler
    const handleCta = () => {
        if (cta.intent === 'build' && defaultProfile) {
            onBuildNow(defaultProfile.name, [], speaker.id || undefined, defaultProfile.variant_name || undefined);
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
    const iconUrl = metadata?.image ?? null;

    return (
        <div className="voice-catalog-card">
            {/* Default badge */}
            {hasDefaultProfile && (
                <span className="voice-catalog-card__default-badge" aria-label="Default voice">
                    ★ default
                </span>
            )}

            {/* Avatar */}
            <div className="voice-catalog-card__avatar">
                {iconUrl ? (
                    <img src={iconUrl} alt={`${speaker.name} icon`} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                    <User size={20} />
                )}
            </div>

            {/* Name */}
            <div className="voice-catalog-card__name">{speaker.name}</div>

            {/* Engine badge */}
            {activeEngine && (
                <span style={{
                    fontSize: '0.6rem',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-round)',
                    background: engineBadgeBg,
                    color: engineBadgeColor,
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    marginBottom: '4px',
                    display: 'inline-block',
                }}>
                    {engineBadgeLabel}
                </span>
            )}

            {/* Pills */}
            {pills.length > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <VoicePillRow pills={pills} max={3} />
                </div>
            ) : isUntagged ? (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <UntaggedBadge onClick={onEditMetadata} />
                </div>
            ) : null}

            {/* Description */}
            {metadata?.description && (
                <p className="voice-catalog-card__description">{metadata.description}</p>
            )}

            {/* Actions row */}
            <div className="voice-catalog-card__actions">
                {/* Preview */}
                <button
                    type="button"
                    aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                    disabled={!previewUrl}
                    onClick={handlePreview}
                    className="btn-glass voice-catalog-card__preview-btn"
                >
                    {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                    {isPlaying ? 'Pause' : 'Play'}
                </button>

                {/* Primary CTA */}
                <button
                    type="button"
                    onClick={handleCta}
                    className="btn-primary voice-catalog-card__cta-btn"
                >
                    {cta.label}
                </button>

                {/* Overflow menu */}
                <ActionMenu
                    items={[
                        {
                            label: 'Set as Default',
                            icon: Star,
                            disabled: hasDefaultProfile && profiles.find(p => p.is_default)?.name === defaultProfile?.name,
                            onClick: () => defaultProfile && onSetDefaultClick(defaultProfile.name),
                        },
                        {
                            label: 'Edit Metadata',
                            icon: Tag,
                            onClick: () => onEditMetadata?.(),
                        },
                        {
                            label: 'Edit Recording Script',
                            icon: Mic,
                            onClick: () => defaultProfile && onEditTestText?.(defaultProfile),
                        },
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
                        {
                            label: 'Delete Voice (all variants)',
                            icon: Trash2,
                            onClick: handleDelete,
                            isDestructive: true,
                        },
                    ]}
                />
            </div>
        </div>
    );
};
