/**
 * VoiceLabPage.tsx — R5-T5
 *
 * Full-page workspace at /voices/:id.
 * Header: ← back link, avatar, name, pills, description, "Edit metadata" button.
 * PhaseStepper driven by getVoicePhase.
 * Body: placeholder section anchors filled by T6–T8.
 *
 * Data: re-fetches via api.listVoicesWithMetadata + speaker profiles from initialData
 * passed as props from App.tsx (same as VoicesTab).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { User, ArrowLeft, Pencil } from 'lucide-react';
import type { SpeakerProfile, TtsEngine, VoiceMetadata, Job } from '@/types';
import { api } from '@/api';
import { VoicePillRow } from '@/pages/Voices/components/VoicePills';
import { voicePillsFromMetadata } from '@/pages/Voices/components/VoicePills';
import { getVoicePhase } from '@/pages/Voices/voicePhase';
import { PhaseStepper } from '@/pages/VoiceLab/components/PhaseStepper';
import { MetadataEditorModal } from '@/pages/Voices/components/MetadataEditorModal';
import { VoiceIconControls } from '@/pages/VoiceLab/components/VoiceIconControls';

// Sections filled by T6–T8 (lazy imports)
const SamplesSection = React.lazy(() =>
    import('@/pages/VoiceLab/components/SamplesSection').then(m => ({ default: m.SamplesSection }))
);
const VariantsSection = React.lazy(() =>
    import('@/pages/VoiceLab/components/VariantsSection').then(m => ({ default: m.VariantsSection }))
);
const TestSection = React.lazy(() =>
    import('@/pages/VoiceLab/components/TestSection').then(m => ({ default: m.TestSection }))
);

export interface VoiceLabPageProps {
    speakerProfiles: SpeakerProfile[];
    engines: TtsEngine[];
    jobs: Record<string, Job>;
    testProgress: Record<string, { progress: number; started_at?: number }>;
    onRefresh: () => void;
}

const SectionFallback: React.FC = () => (
    <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</div>
);

export const VoiceLabPage: React.FC<VoiceLabPageProps> = ({
    speakerProfiles,
    engines,
    jobs,
    testProgress,
    onRefresh,
}) => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Metadata list — hydrated from the metadata endpoint
    const [voiceMetadataList, setVoiceMetadataList] = useState<VoiceMetadata[]>([]);
    const [metadataEditorOpen, setMetadataEditorOpen] = useState(false);

    const fetchMetadata = useCallback(async () => {
        try {
            const list = await api.listVoicesWithMetadata();
            if (Array.isArray(list)) setVoiceMetadataList(list);
        } catch {
            // Non-fatal
        }
    }, []);

    useEffect(() => {
        void fetchMetadata();
    }, [fetchMetadata]);

    // Derive voice data for this id
    const metadata = id
        ? voiceMetadataList.find(m => m.id === id) ?? null
        : null;

    // All profiles belonging to this voice group (by speaker_id matching)
    const profiles = id
        ? speakerProfiles.filter(p => p.speaker_id === id)
        : [];

    // Unknown id → redirect
    useEffect(() => {
        if (voiceMetadataList.length > 0 && id && !voiceMetadataList.some(m => m.id === id)) {
            navigate('/voices', { replace: true });
        }
    }, [voiceMetadataList, id, navigate]);

    const phase = getVoicePhase(profiles, engines, {});
    const pills = metadata ? voicePillsFromMetadata(metadata) : [];
    const iconUrl = metadata?.image ? `/api/voices/${encodeURIComponent(id!)}/icon` : null;

    // Export — direct download of the voice bundle (same as catalog card)
    const handleExport = () => {
        if (!metadata?.name) return;
        const url = api.exportVoiceBundleUrl(metadata.name, false);
        window.open(url, '_blank');
    };

    // Delete — navigate back on success
    const handleDelete = useCallback(() => {
        if (!profiles[0]) return;
        const deleteUrl = id
            ? `/api/speakers/${id}`
            : `/api/speaker-profiles/${encodeURIComponent(profiles[0]?.name || '')}`;
        fetch(deleteUrl, { method: 'DELETE' }).then(resp => {
            if (resp.ok) {
                onRefresh();
                navigate('/voices', { replace: true });
            }
        });
    }, [id, profiles, onRefresh, navigate]);

    const handleMetadataSaved = useCallback((updated: VoiceMetadata) => {
        setVoiceMetadataList(prev =>
            prev.some(m => m.id === updated.id)
                ? prev.map(m => m.id === updated.id ? updated : m)
                : [...prev, updated]
        );
    }, []);

    if (!id) return null;

    return (
        <div className="voice-lab-page">
            {/* Back link */}
            <button
                type="button"
                onClick={() => navigate('/voices')}
                className="btn-ghost voice-lab-page__back"
            >
                <ArrowLeft size={14} />
                Voices
            </button>

            {/* Header */}
            <div className="voice-lab-page__header">
                {/* Avatar */}
                <div className="voice-lab-page__avatar">
                    {iconUrl ? (
                        <img
                            src={iconUrl}
                            alt={`${metadata?.name || 'Voice'} icon`}
                            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                        />
                    ) : (
                        <User size={24} />
                    )}
                </div>

                {/* Name + pills + description */}
                <div className="voice-lab-page__header-body">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <h1 className="voice-lab-page__name">
                            {metadata?.name ?? '…'}
                        </h1>
                        <button
                            type="button"
                            onClick={() => setMetadataEditorOpen(true)}
                            className="btn-ghost voice-lab-page__edit-meta-btn"
                            aria-label="Edit metadata"
                        >
                            <Pencil size={13} />
                            Edit metadata
                        </button>
                    </div>

                    {pills.length > 0 && (
                        <div style={{ marginTop: '4px' }}>
                            <VoicePillRow pills={pills} />
                        </div>
                    )}

                    {metadata?.description && (
                        <p className="voice-lab-page__description">{metadata.description}</p>
                    )}

                    {/* Icon controls — upload + copy prompt */}
                    <VoiceIconControls
                        voiceId={id}
                        metadata={metadata}
                        onIconUploaded={(imagePath) => {
                            // Update local metadata to refresh avatar
                            setVoiceMetadataList(prev =>
                                prev.map(m => m.id === id ? { ...m, image: imagePath } : m)
                            );
                        }}
                    />
                </div>
            </div>

            {/* Phase stepper */}
            <div className="voice-lab-page__stepper-row">
                <PhaseStepper phase={phase} />
            </div>

            <div className="voice-lab-page__sections">
                {/* Samples section — T6 */}
                <React.Suspense fallback={<SectionFallback />}>
                    <SamplesSection
                        profiles={profiles}
                        onRefresh={onRefresh}
                    />
                </React.Suspense>

                {/* Variants section — T6 */}
                <React.Suspense fallback={<SectionFallback />}>
                    <VariantsSection
                        speakerName={metadata?.name ?? ''}
                        profiles={profiles}
                        engines={engines}
                        buildingProfiles={{}}
                        testProgress={testProgress}
                        onRefresh={onRefresh}
                        onBuildNow={async () => false}
                        requestConfirm={() => undefined}
                    />
                </React.Suspense>

                {/* Test section — T8 */}
                <React.Suspense fallback={<SectionFallback />}>
                    <TestSection
                        profiles={profiles}
                        engines={engines}
                        testProgress={testProgress}
                        jobs={jobs}
                        onTest={async (name: string) => {
                            await fetch(`/api/speaker-profiles/${encodeURIComponent(name)}/test`, { method: 'POST' });
                            onRefresh();
                        }}
                        onRefresh={onRefresh}
                    />
                </React.Suspense>

                {/* Export + Delete row */}
                <div className="voice-lab-page__footer-actions">
                    <div className="voice-lab-page__footer-group">
                        <span className="voice-lab-section-label">Export</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={handleExport}
                                disabled={!metadata?.name}
                                className="btn-glass"
                                style={{ height: '36px', padding: '0 16px', fontSize: '0.85rem', borderRadius: '10px' }}
                            >
                                Export bundle (.zip)
                            </button>
                            {/* HF publish — planned placeholder only */}
                            <span
                                title="Publish to Hugging Face — planned"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 10px',
                                    borderRadius: '999px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    background: 'var(--surface-alt)',
                                    color: 'var(--text-muted)',
                                    border: '1px solid var(--border)',
                                    opacity: 0.7,
                                    cursor: 'default',
                                    userSelect: 'none',
                                }}
                            >
                                Publish to Hugging Face
                                <span style={{
                                    padding: '1px 6px',
                                    borderRadius: '999px',
                                    fontSize: '0.6rem',
                                    fontWeight: 800,
                                    background: 'var(--warning-tint-bg)',
                                    color: 'var(--warning-text)',
                                    letterSpacing: '0.04em',
                                }}>
                                    planned
                                </span>
                            </span>
                        </div>
                    </div>

                    <div className="voice-lab-page__footer-group voice-lab-page__footer-group--danger">
                        <button
                            type="button"
                            onClick={() => {
                                if (window.confirm(
                                    `Delete voice '${metadata?.name ?? id}' and all ${profiles.length} variant${profiles.length !== 1 ? 's' : ''}? This cannot be undone.`
                                )) {
                                    handleDelete();
                                }
                            }}
                            className="btn-ghost"
                            style={{
                                color: 'var(--error)',
                                height: '36px',
                                padding: '0 16px',
                                fontSize: '0.85rem',
                                borderRadius: '10px',
                                border: '1px solid var(--error)',
                            }}
                        >
                            Delete voice
                        </button>
                    </div>
                </div>
            </div>

            {/* Metadata editor modal */}
            <MetadataEditorModal
                isOpen={metadataEditorOpen}
                voice={metadata ?? (id ? { id, name: id, is_untagged: true } : null)}
                onClose={() => setMetadataEditorOpen(false)}
                onSaved={handleMetadataSaved}
            />
        </div>
    );
};
