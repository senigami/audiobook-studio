import React, { useState, useEffect, useRef } from 'react';
import type { SpeakerProfile, TtsEngine } from '@/types';
import {
    Trash2, Play, Loader2, RefreshCw, FileEdit,
    Pause, Sliders, MoreVertical
} from 'lucide-react';
import { motion } from 'framer-motion';
import { SpeedPopover } from '@/pages/Voices/components/VoiceUtils';
import { useVariantActions } from '@/hooks/useVariantActions';
import { SampleManager } from '@/pages/Voices/components/SampleManager';
import { VersionHistoryPanel } from '@/pages/Voices/components/VersionHistoryPanel';
import { formatVoiceEngineLabel, getVariantDisplayName, getVoiceProfileEngine } from '@/utils/voiceProfiles';
import { TagAutocompleteInput } from '@/pages/Voices/components/metadata/TagAutocompleteInput';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';

const PERFORMANCE_TAG_STARTER_VOCABULARY = ['happy', 'sad', 'angry', 'calm', 'slow', 'fast', 'measured'];

interface VariantEditorProps {
    profile: SpeakerProfile;
    isTesting: boolean;
    testStatus?: any;
    onTest: (name: string) => void;
    onDeleteVariant: (name: string) => void;
    onMoveVariant: (profile: SpeakerProfile) => void;
    onRefresh: () => void;
    onEditTestText: (profile: SpeakerProfile) => void;
    onBuildNow: (name: string, files: File[], speakerId?: string, variantName?: string) => Promise<boolean>;
    requestConfirm: (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean; isAlert?: boolean }) => void;
    voiceName: string;
    showControlsInline?: boolean;
    buildingProfiles: Record<string, boolean>;
    engines?: TtsEngine[];
    /** Tags already used by this voice's other variants, for the suggestions
     *  dropdown — aggregated + deduplicated by the caller (VariantsSection). */
    tagSuggestions?: string[];
}

export const VariantEditor: React.FC<VariantEditorProps> = ({
    profile, isTesting, onTest, onDeleteVariant, onMoveVariant, onRefresh,
    onEditTestText, onBuildNow, requestConfirm, testStatus,
    voiceName, showControlsInline = false, buildingProfiles, engines = [],
    tagSuggestions = []
}) => {
    const engine = getVoiceProfileEngine(profile) || 'unknown';
    const activeEngine = engines.find(e => e.engine_id === engine);
    const engineUsable = engines.length === 0 ? true : Boolean(activeEngine?.enabled && activeEngine?.status === 'ready');
    const isRebuildEngine = activeEngine?.capabilities?.includes('voice_build');
    const isCloudEngine = activeEngine?.cloud === true;

    const hasBuildMaterial = Boolean(
        profile.has_latent ||
        profile.voice_asset_id ||
        profile.reference_sample ||
        (profile.wav_count > 0) ||
        (profile.samples?.length || 0) > 0
    );

    const canGeneratePreview = hasBuildMaterial && engineUsable;
    const canPreviewOrGenerate = !!profile.preview_url || canGeneratePreview;

    const {
        localSpeed,
        setLocalSpeed,
        isPlaying,
        playingSample,
        setCacheBuster,
        handlePlayClick,
        handleGeneratePreview,
        handlePlaySample,
        handleSpeedChange,
        handleDeleteSample,
        uploadFiles
    } = useVariantActions(profile, onRefresh, onTest, requestConfirm);

    const isBuilding = buildingProfiles[profile.name];
    const speedPillRef = useRef<HTMLButtonElement>(null);
    const speed = localSpeed ?? profile.speed;
    const playIconColor = isPlaying ? 'var(--surface)' : 'var(--text-primary)';
    const engineBadge = {
        label: activeEngine?.display_name || formatVoiceEngineLabel(engine),
        bg: isCloudEngine ? 'var(--cloud-tint-bg)' : 'var(--accent-tint-bg)',
        color: isCloudEngine ? 'var(--cloud-color)' : 'var(--accent)'
    };

    useEffect(() => {
        if (profile.preview_url) {
            setCacheBuster(Date.now());
        }
    }, [profile.preview_url, isTesting, setCacheBuster]);

    const handleRebuild = async () => {
        try {
            await onBuildNow(profile.name, [], profile.speaker_id || undefined, profile.variant_name || undefined);
        } catch (err) {
            console.error('Failed to rebuild', err);
        }
    };

    const handleSaveTags = async (newTags: string[]) => {
        try {
            await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ performance_tags: newTags }),
            });
        } catch (err) {
            console.error('Failed to save performance tags', err);
        }
        onRefresh();
    };

    const combinedTagSuggestions = Array.from(new Set([...tagSuggestions, ...PERFORMANCE_TAG_STARTER_VOCABULARY]));

    const [showSpeedPopover, setShowSpeedPopover] = useState(false);
    const [isSamplesExpanded, setIsSamplesExpanded] = useState(profile.wav_count === 0 || profile.samples?.length === 0);
    const [isRebuildRequired, setIsRebuildRequired] = useState(profile.is_rebuild_required || false);

    useEffect(() => {
        setIsRebuildRequired(profile.is_rebuild_required || false);
    }, [profile.is_rebuild_required, profile.name]);

    useEffect(() => {
        if (profile.wav_count === 0) {
            setIsSamplesExpanded(true);
        }
    }, [profile.wav_count, profile.name]);

    // Chrome demotion (task 009): Script, Move, Delete, and Rebuild/Regenerate
    // all consolidate into a single ActionMenu overflow. Rebuild/Regenerate is
    // still gated by the same enabled/disabled logic as before (hasBuildMaterial
    // + engineUsable + not mid-build/test) — it stays available whenever the
    // user could meaningfully trigger it, not only when isRebuildRequired.
    const rebuildOrGenerateItem: ActionMenuItem = isCloudEngine ? {
        label: isTesting ? 'Regenerating...' : (profile.preview_url ? 'Regenerate' : 'Generate'),
        icon: RefreshCw,
        onClick: handleGeneratePreview,
        disabled: !canGeneratePreview || isTesting,
    } : {
        label: isBuilding ? 'Rebuilding...' : (isTesting ? 'Generating...' : 'Rebuild'),
        icon: RefreshCw,
        onClick: handleRebuild,
        disabled: !hasBuildMaterial || !engineUsable || isBuilding || isTesting,
    };

    const actionMenuItems: ActionMenuItem[] = [
        {
            label: 'Script',
            icon: FileEdit,
            onClick: () => onEditTestText(profile),
        },
        rebuildOrGenerateItem,
        { isDivider: true },
        {
            label: 'Move Variant',
            icon: RefreshCw,
            onClick: () => onMoveVariant(profile),
        },
        {
            label: 'Delete Variant',
            icon: Trash2,
            isDestructive: true,
            onClick: () => {
                requestConfirm({
                    title: 'Delete variant?',
                    message: `Delete variant '${profile.variant_name || 'Default'}' from '${voiceName}'? This cannot be undone.`,
                    isDestructive: true,
                    onConfirm: () => onDeleteVariant(profile.name)
                });
            },
        },
    ];

    const renderControls = () => (
        <div className="variant-editor__controls-body">
            {isRebuildRequired && profile.rebuild_reasons && profile.rebuild_reasons.length > 0 && (
                <div className="variant-editor__rebuild-banner">
                    <div className="variant-editor__rebuild-icon">
                        <RefreshCw size={14} className={isBuilding ? "animate-spin" : ""} />
                    </div>
                    <div className="variant-editor__rebuild-copy">
                        <span className="variant-editor__rebuild-title">
                            Rebuild Recommended
                        </span>
                        <span className="variant-editor__rebuild-desc">
                            {profile.rebuild_reasons.map(r => r.replace('_', ' ').charAt(0).toUpperCase() + r.replace('_', ' ').slice(1)).join(', ')}
                        </span>
                    </div>
                </div>
            )}
            <SampleManager
                profile={profile}
                title={isCloudEngine ? 'Reference Samples' : 'Samples'}
                isSamplesExpanded={isSamplesExpanded}
                setIsSamplesExpanded={setIsSamplesExpanded}
                isRebuildRequired={isRebuildRequired}
                uploadFiles={uploadFiles}
                playingSample={playingSample}
                handlePlaySample={handlePlaySample}
                handleDeleteSample={handleDeleteSample}
            />
        </div>
    );

    return (
        <div className={showControlsInline ? "" : "glass-panel animate-in variant-editor__shell"}>
            <div className="variant-editor__header">
                <div className="variant-editor__controls-row">
                    {/* Variant name — rows are otherwise indistinguishable
                        (play/speed/engine badge/Script/Rebuild are identical
                        across every variant of the same voice). */}
                    <span className="variant-editor__variant-label">{getVariantDisplayName(profile)}</span>

                    <div className="variant-editor__play-btn-wrap">
                        <button
                            onClick={handlePlayClick}
                        className="btn-ghost hover-bg-subtle variant-editor__play-btn"
                        disabled={!canPreviewOrGenerate || isTesting}
                        title={!profile.preview_url && !engineUsable
                            ? `Engine ${activeEngine?.display_name || formatVoiceEngineLabel(engine)} is disabled or unavailable.`
                            : !hasBuildMaterial
                                ? 'Add at least one sample or keep a latent before generating a preview'
                                : profile.preview_url
                                    ? (isPlaying ? "Pause Sample" : "Play Sample")
                                    : "Generate Sample"}
                            style={{
                                background: isPlaying ? 'var(--accent)' : 'var(--surface)',
                                color: playIconColor,
                                border: isPlaying ? '1px solid var(--accent)' : '1px solid var(--border)',
                                boxShadow: isPlaying ? '0 0 0 3px var(--accent-glow)' : 'var(--shadow-sm)'
                            }}
                        >
                            {isTesting ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : isPlaying ? (
                                <Pause size={18} fill="currentColor" className="variant-editor__play-icon" />
                            ) : (
                                <Play size={18} fill="currentColor" className="variant-editor__play-icon" />
                            )}
                            {isPlaying && (
                                <motion.div
                                    layoutId="playing-pulse"
                                    className="variant-editor__play-pulse"
                                    style={{ border: `2px solid ${playIconColor}` }}
                                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                />
                            )}
                        </button>
                    </div>

                    <div className="variant-editor__divider" />

                    {!isCloudEngine && (
                        <>
                            <button
                                ref={speedPillRef}
                                onClick={() => setShowSpeedPopover(!showSpeedPopover)}
                                className="btn-ghost hover-bg-subtle variant-editor__speed-btn"
                            >
                                <Sliders size={12} className="variant-editor__speed-icon" />
                                {speed.toFixed(2)}x
                            </button>

                            {showSpeedPopover && (
                                <SpeedPopover
                                    value={speed}
                                    onChange={(v: number) => {
                                        setLocalSpeed(v);
                                        handleSpeedChange(v);
                                    }}
                                    triggerRef={speedPillRef}
                                    onClose={() => setShowSpeedPopover(false)}
                                />
                            )}
                        </>
                    )}

                    <span
                        className="variant-editor__engine-badge"
                        style={{ background: engineBadge.bg, color: engineBadge.color, border: `1px solid ${engineBadge.color}33` }}
                    >
                        {engineBadge.label}
                    </span>

                    <ActionMenu
                        items={actionMenuItems}
                        trigger={
                            <span
                                className="btn-ghost hover-bg-subtle variant-editor__more-btn"
                                title="More actions"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 32,
                                    height: 32,
                                    borderRadius: 'var(--radius-round)',
                                }}
                            >
                                <MoreVertical size={16} />
                            </span>
                        }
                    />
                </div>

                <div className="variant-editor__tags-row" style={{ marginTop: '0.5rem' }}>
                    <TagAutocompleteInput
                        tags={profile.performance_tags ?? []}
                        onChange={handleSaveTags}
                        suggestions={combinedTagSuggestions}
                        placeholder="Add a performance tag..."
                    />
                </div>
            </div>

            {isCloudEngine && (
                <div
                    className="variant-editor__cloud-copy"
                    style={{ padding: showControlsInline ? '0 1.25rem 1.25rem' : '1.25rem' }}
                >
                    {engineUsable
                        ? (isRebuildEngine
                            ? `${activeEngine?.display_name || engine} uses local rebuilds to prepare high-quality voice latents. Click Rebuild after adding samples to update the model.`
                            : `${activeEngine?.display_name || engine} uses reference audio or direct voice IDs for synthesis. Use play to hear the current preview, and regenerate to refresh it after changes.`)
                        : `This voice is assigned to ${activeEngine?.display_name || engine}, but it is currently disabled or unavailable. You can play existing previews, but new generation is blocked.`}
                </div>
            )}

            {isTesting && (
                <div style={{ padding: showControlsInline ? '0 0 1.25rem' : '1.25rem' }}>
                    <div className="variant-editor__progress-track">
                        <div style={{ height: '100%', width: `${testStatus?.progress || 0}%`, background: 'var(--accent)', transition: 'width 0.3s ease' }} />
                    </div>
                </div>
            )}

            {renderControls()}

            <VersionHistoryPanel
                voiceName={profile.name}
                onPromoted={onRefresh}
                requestConfirm={requestConfirm}
            />
        </div>
    );
};
