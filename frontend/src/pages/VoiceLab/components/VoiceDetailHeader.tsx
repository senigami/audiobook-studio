/**
 * VoiceDetailHeader.tsx — task 001 (voice-card-consolidation, P1)
 *
 * Header for the voice detail page: avatar/name/tags/description, the
 * consolidated primary actions (Play preview / Set as default / Export
 * bundle, per the map's "Target shape"), and a persistent status strip
 * (per-variant build state + last-test result) that stays visible
 * regardless of which tab is active (INV-VC-4).
 *
 * Publish-to-Hugging-Face and Delete voice are relocated here unchanged
 * from `VoiceLabPage.tsx`'s previous footer (`:262-311`) rather than
 * dropped -- the map's target-shape pseudocode only calls out
 * Play preview/Set default/Export as the primary trio, but this task's
 * "Out of scope" note defers tab CONTENT (002-005), not these existing
 * page-level actions, and INV-VC-2 (no functionality loss) still applies
 * during this transitional shell. Flagged here since it's a judgment call
 * not spelled out in the target shape.
 *
 * Status strip data note: `SpeakerProfile` has no persisted "last test
 * pass/fail timestamp" field today (checked `api/types.ts`) -- only
 * `preview_url` (a test was generated) and readiness/rebuild flags. Rather
 * than fabricate a timestamp that doesn't exist, the strip reports build
 * state (via `is_ready`/`is_rebuild_required`) and whether a test preview
 * exists per variant, with no invented timestamp.
 *
 * The "Edit metadata" trigger (previously here, opening
 * `MetadataEditorModal`) was removed by task 002: metadata is now always
 * editable inline in the Overview tabpanel, so there is nothing left for
 * a header button to open.
 */
import React, { useEffect, useState } from 'react';
import { User, Play, Pause, Star, Download, UploadCloud, Trash2, CheckCircle2, AlertTriangle, Circle, ClipboardCopy, AlertCircle } from 'lucide-react';
import type { SpeakerProfile, VoiceMetadata } from '@/types';
import { VoicePillRow, type PillSpec } from '@/pages/Voices/components/VoicePills';
import { usePlayerBus, loadAndPlay, pause as pauseBus } from '@/store/playerBus';
import { useIconUpload } from '@/pages/Voices/components/metadata/IconUpload';
import { IconCropModal } from '@/pages/Voices/components/metadata/IconCropModal';
import { buildIconPrompt } from '@/pages/VoiceLab/iconPrompt';

export interface VoiceDetailHeaderProps {
    voiceId: string;
    metadata: VoiceMetadata | null;
    iconUrl: string | null;
    pills: PillSpec[];
    isMobile: boolean;
    profiles: SpeakerProfile[];
    onSetDefault: (profileName: string) => void;
    onExport: () => void;
    onPublish: () => void;
    onDelete: () => void;
}

export const VoiceDetailHeader: React.FC<VoiceDetailHeaderProps> = ({
    voiceId,
    metadata,
    iconUrl,
    pills,
    isMobile,
    profiles,
    onSetDefault,
    onExport,
    onPublish,
    onDelete,
}) => {
    const playerBus = usePlayerBus();

    // Icon upload -- folded onto the avatar directly (task 003, voice-variants
    // round 2) instead of the standalone IconUpload section that used to live
    // in OverviewTab. `iconOverride` mirrors the local-state pattern the old
    // OverviewTab used (`setIconPath`) so the avatar reflects a just-uploaded
    // image immediately, without needing a new callback prop back to
    // VoiceLabPage -- same non-propagating behavior as before, just relocated.
    const [iconOverride, setIconOverride] = useState<string | null>(null);
    const [iconUploadError, setIconUploadError] = useState<string | null>(null);
    useEffect(() => {
        setIconOverride(null);
        setIconUploadError(null);
    }, [voiceId]);

    const {
        uploading: iconUploading,
        cropFile,
        setCropFile,
        isDragging,
        copyError,
        inputRef: iconInputRef,
        handleCopyPrompt,
        handleInputChange: handleIconInputChange,
        handleDragOver: handleIconDragOver,
        handleDragLeave: handleIconDragLeave,
        handleDrop: handleIconDrop,
        handleCropped,
    } = useIconUpload({
        voiceId,
        metadata,
        onSuccess: (image) => setIconOverride(image),
        onError: (msg) => setIconUploadError(msg),
    });

    const effectiveIconUrl = iconOverride
        ? `/api/voices/${encodeURIComponent(voiceId)}/icon`
        : iconUrl;

    const defaultProfile = profiles.find(p => p.is_default) ?? profiles[0] ?? null;
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
                title: metadata?.name ?? 'Voice',
                subtitle: 'Voice preview',
                audioUrl: previewUrl,
            });
        }
    };

    const handleSetDefault = () => {
        if (!defaultProfile || defaultProfile.is_default) return;
        onSetDefault(defaultProfile.name);
    };

    return (
        <header className="voice-detail-header">
            <div className="voice-detail-header__identity">
                <div className="voice-detail-header__avatar-block">
                    <div
                        className="voice-lab-page__avatar"
                        onDragOver={handleIconDragOver}
                        onDragLeave={handleIconDragLeave}
                        onDrop={handleIconDrop}
                        style={isDragging ? { border: '2px dashed var(--accent)', background: 'var(--accent-glow)' } : undefined}
                    >
                        {effectiveIconUrl ? (
                            <img
                                src={effectiveIconUrl}
                                alt={`${metadata?.name || 'Voice'} icon`}
                                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                            />
                        ) : (
                            <User size={24} />
                        )}
                    </div>
                    <div className="voice-detail-header__icon-actions">
                        <button
                            type="button"
                            disabled={iconUploading}
                            onClick={() => iconInputRef.current?.click()}
                            className="btn-glass metadata-icon-upload__btn voice-detail-header__icon-btn"
                        >
                            {iconUploading ? 'Uploading…' : (effectiveIconUrl ? 'Replace icon' : 'Upload icon')}
                        </button>
                        <button
                            type="button"
                            onClick={handleCopyPrompt}
                            className="btn-glass metadata-icon-upload__prompt-btn"
                            aria-label="Copy icon generation prompt"
                            title={buildIconPrompt(metadata ?? null)}
                        >
                            <ClipboardCopy size={14} />
                        </button>
                    </div>
                    {isDragging && (
                        <p className="metadata-field-hint">Drop to upload</p>
                    )}
                    {copyError && (
                        <span role="alert" className="metadata-icon-upload__copy-error">
                            {copyError}
                        </span>
                    )}
                    {iconUploadError && (
                        <div className="metadata-editor-modal__icon-error" role="alert">
                            <AlertCircle size={14} />
                            {iconUploadError}
                        </div>
                    )}
                    <input
                        ref={iconInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        aria-label="Upload voice icon"
                        style={{ display: 'none' }}
                        onChange={handleIconInputChange}
                    />
                    {cropFile && (
                        <IconCropModal
                            file={cropFile}
                            onCancel={() => setCropFile(null)}
                            onCropped={handleCropped}
                        />
                    )}
                </div>

                <div className="voice-lab-page__header-body">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h1 className="voice-lab-page__name">
                            {metadata?.name ?? '…'}
                        </h1>
                    </div>

                    {pills.length > 0 && (
                        <div style={{ marginTop: '4px' }}>
                            <VoicePillRow pills={pills} max={isMobile ? 6 : 0} />
                        </div>
                    )}

                    {metadata?.description && (
                        <p className="voice-lab-page__description">{metadata.description}</p>
                    )}
                </div>
            </div>

            {/* Primary actions */}
            <div className="voice-detail-header__actions">
                <button
                    type="button"
                    onClick={handlePreview}
                    disabled={!previewUrl}
                    className="btn-glass"
                    aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                >
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    {isPlaying ? 'Pause preview' : 'Play preview'}
                </button>
                <button
                    type="button"
                    onClick={handleSetDefault}
                    disabled={!defaultProfile || defaultProfile.is_default}
                    className="btn-glass"
                    title="Used app-wide when no voice is specified"
                >
                    <Star size={14} />
                    {defaultProfile?.is_default ? 'App default' : 'Set as App Default'}
                </button>
                <button
                    type="button"
                    onClick={onExport}
                    disabled={!metadata?.name}
                    className="btn-glass"
                >
                    <Download size={14} />
                    Export bundle (.zip)
                </button>
                <button
                    type="button"
                    onClick={onPublish}
                    disabled={!metadata?.name}
                    className="btn-glass"
                >
                    <UploadCloud size={14} />
                    Publish to Hugging Face
                </button>
                <button
                    type="button"
                    onClick={onDelete}
                    className="btn-ghost voice-detail-header__delete-btn"
                >
                    <Trash2 size={14} />
                    Delete voice
                </button>
            </div>

            {/* Persistent status strip (INV-VC-4): stays visible regardless of
                active tab -- rendered here, in the header, not inside a tabpanel. */}
            <div className="voice-detail-header__status-strip" aria-live="polite">
                {profiles.length === 0 ? (
                    <span className="voice-detail-header__status-item voice-detail-header__status-item--muted">
                        <Circle size={12} />
                        No variants yet
                    </span>
                ) : (
                    profiles.map(profile => {
                        const needsRebuild = !!profile.is_rebuild_required;
                        const isReady = profile.is_ready !== false && !needsRebuild;
                        const hasTested = !!profile.preview_url;
                        return (
                            <span key={profile.name} className="voice-detail-header__status-item">
                                {needsRebuild ? (
                                    <AlertTriangle size={12} className="voice-detail-header__status-icon--warning" />
                                ) : isReady ? (
                                    <CheckCircle2 size={12} className="voice-detail-header__status-icon--success" />
                                ) : (
                                    <Circle size={12} />
                                )}
                                <span className="voice-detail-header__status-variant">
                                    {profile.variant_name ?? 'Default'}
                                </span>
                                <span className="voice-detail-header__status-detail">
                                    {needsRebuild
                                        ? 'Needs rebuild'
                                        : isReady
                                            ? (hasTested ? 'Built · tested' : 'Built · not tested')
                                            : 'Not built'}
                                </span>
                            </span>
                        );
                    })
                )}
            </div>
        </header>
    );
};
