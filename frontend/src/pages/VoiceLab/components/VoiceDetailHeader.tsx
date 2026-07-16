/**
 * VoiceDetailHeader.tsx — task 001 (voice-card-consolidation, P1);
 * action row consolidated + Play preview dropped by the voice-variants
 * design-critique follow-up (2026-07-15, H-2/H-3).
 *
 * Header for the voice detail page: avatar/name/tags/description, a single
 * overflow ActionMenu for Set default/Export/Publish/Delete, and a
 * persistent status strip (per-variant build state + last-test result)
 * that stays visible regardless of which tab is active (INV-VC-4).
 *
 * Set as App Default/Export bundle/Publish to Hugging Face/Delete voice
 * are folded into a single `ActionMenu` overflow (H-2, owner-approved):
 * the previous 5 equal-weight buttons (Play preview, Set default, Export,
 * Publish, Delete) overstated their relative importance. Delete is grouped
 * behind a divider as the destructive item, matching
 * `VoiceCatalogCard.tsx`'s ActionMenu ordering convention. "Play preview"
 * was dropped entirely rather than moved into the menu (H-3 partial,
 * owner-approved): the variant switcher's per-row play control and the
 * selected `VariantEditor`'s play/generate button already cover
 * per-variant audition, making "play the default variant" redundant here.
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
import { User, Star, Download, UploadCloud, Trash2, CheckCircle2, AlertTriangle, Circle, ClipboardCopy, AlertCircle } from 'lucide-react';
import type { SpeakerProfile, VoiceMetadata } from '@/types';
import { VoicePillRow, type PillSpec } from '@/pages/Voices/components/VoicePills';
import { ActionMenu } from '@/components/ui/ActionMenu';
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
    // Icon upload -- folded onto the avatar directly (task 003, voice-variants
    // round 2) instead of the standalone IconUpload section that used to live
    // in OverviewTab. `iconOverride` mirrors the local-state pattern the old
    // OverviewTab used (`setIconPath`) so the avatar reflects a just-uploaded
    // image immediately, without needing a new callback prop back to
    // VoiceLabPage -- same non-propagating behavior as before, just relocated.
    const [iconOverride, setIconOverride] = useState<string | null>(null);
    const [iconUploadError, setIconUploadError] = useState<string | null>(null);
    // Bug fix (user-reported, 2026-07-16): a successful upload replaced the
    // file server-side, but the <img> never re-fetched it -- the resolved
    // URL (`/api/voices/{id}/icon`) is identical before and after, so the
    // element's `src` attribute didn't change and the browser kept showing
    // its cached image until a full page reload. Bumping a version counter
    // on every successful upload and appending it as a cache-busting query
    // param forces a real re-fetch without needing a reload.
    const [iconVersion, setIconVersion] = useState(0);
    useEffect(() => {
        setIconOverride(null);
        setIconUploadError(null);
        setIconVersion(0);
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
        onSuccess: (image) => {
            setIconOverride(image);
            setIconVersion(v => v + 1);
        },
        onError: (msg) => setIconUploadError(msg),
    });

    const effectiveIconUrl = iconOverride
        ? `/api/voices/${encodeURIComponent(voiceId)}/icon?v=${iconVersion}`
        : iconUrl;

    const defaultProfile = profiles.find(p => p.is_default) ?? profiles[0] ?? null;

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

            {/* Primary actions -- consolidated into a single overflow menu
                (H-2): Set default/Export/Publish/Delete no longer render as
                5 equal-weight buttons. Delete is grouped behind a divider as
                the destructive item, matching VoiceCatalogCard's ActionMenu
                ordering convention. "Play preview" was dropped entirely
                (H-3 partial) rather than folded in here -- the variant
                switcher's per-row play control and the selected
                VariantEditor's play/generate button already cover
                per-variant audition. */}
            <div className="voice-detail-header__actions">
                <ActionMenu
                    items={[
                        {
                            label: defaultProfile?.is_default ? 'App default' : 'Set as App Default',
                            icon: Star,
                            disabled: !defaultProfile || defaultProfile.is_default,
                            onClick: handleSetDefault,
                        },
                        {
                            label: 'Export bundle (.zip)',
                            icon: Download,
                            disabled: !metadata?.name,
                            onClick: onExport,
                        },
                        {
                            label: 'Publish to Hugging Face',
                            icon: UploadCloud,
                            disabled: !metadata?.name,
                            onClick: onPublish,
                        },
                        { isDivider: true },
                        {
                            label: 'Delete voice',
                            icon: Trash2,
                            isDestructive: true,
                            onClick: onDelete,
                        },
                    ]}
                />
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
