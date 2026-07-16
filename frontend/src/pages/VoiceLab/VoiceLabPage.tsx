/**
 * VoiceLabPage.tsx — R5-T5
 *
 * Full-page workspace at /voices/:id.
 * Header: ← back link, avatar, name, pills, description. Metadata editing
 * moved inline into the Overview tabpanel (task 002) -- no header trigger
 * or modal.
 * PhaseStepper driven by getVoicePhase.
 * Body: placeholder section anchors filled by T6–T8.
 *
 * Data: re-fetches via api.listVoicesWithMetadata + speaker profiles from initialData
 * passed as props from App.tsx (same as VoicesTab).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import type { SpeakerProfile, TtsEngine, VoiceMetadata, Job } from '@/types';
import { api } from '@/api';
import { voicePillsFromMetadata } from '@/pages/Voices/components/VoicePills';
import { getVoicePhase } from '@/pages/Voices/voicePhase';
import { PhaseStepper } from '@/pages/VoiceLab/components/PhaseStepper';
import { PublishToHuggingFaceModal } from '@/pages/VoiceLab/components/PublishToHuggingFaceModal';
import { VoiceDetailHeader } from '@/pages/VoiceLab/components/VoiceDetailHeader';
import { OverviewTab } from '@/pages/VoiceLab/components/OverviewTab';
import { VariantsTab } from '@/pages/VoiceLab/components/VariantsTab';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { useVoiceManagement } from '@/hooks/useVoiceManagement';

// NOTE: VoiceIconControls (previously lazy-loaded and rendered directly below
// the phase stepper) is not rendered in this task. SamplesSection was
// relocated into the Samples tabpanel by task 003 (via SamplesTab);
// VariantsSection + VoiceSettingsPanel were relocated into the Variants
// tabpanel by task 004 (via VariantsTab); TestSection + ScriptEditor's
// test-text editing UI were relocated/folded into the Test tabpanel by task
// 005 (via TestTab) -- the old ScriptEditor drawer is retired.
//
// voices-variants-round2 task 008 ("retire tabs"): the Samples/Variants/Test
// tab shell -- the generic ARIA-tabs primitive this page used to mount -- is
// removed entirely. `VariantsTab` (which composes `VariantsSection`) is now
// the only navigation surface rendered below the Overview disclosure (task
// 007). Task 009 then moved engine-config + test-text editing (previously
// promoted here as a separate Voice Settings panel, and folded into the now-
// deleted `TestTab`) directly into `VariantEditor`, scoped per-variant --
// `VariantsTab` no longer needs any settings-related props from this page.

export interface VoiceLabPageProps {
    speakerProfiles: SpeakerProfile[];
    engines: TtsEngine[];
    jobs: Record<string, Job>;
    testProgress: Record<string, { progress: number; started_at?: number }>;
    onRefresh: () => void;
}

export const VoiceLabPage: React.FC<VoiceLabPageProps> = ({
    speakerProfiles,
    engines,
    jobs,
    testProgress,
    onRefresh,
}) => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Mobile tag-pill wall fix (HIG review item 4a): at narrow widths, an
    // untruncated attribute pill row could wrap into ~8 rows. Cap it with
    // VoicePillRow's existing "+N more" expandable toggle below the same
    // 640px breakpoint already used elsewhere in this theme (book.css,
    // publish.css) — desktop layout is untouched.
    const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 640 : false));
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 640);
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Metadata list — hydrated from the metadata endpoint
    const [voiceMetadataList, setVoiceMetadataList] = useState<VoiceMetadata[]>([]);
    const [publishModalOpen, setPublishModalOpen] = useState(false);

    // Confirm dialog state -- real requestConfirm plumbing for the Variants
    // tab (task 004 R3 fix), same pattern as VoicesModals.tsx/VoicesPage.tsx's
    // ConfirmModal + confirmConfig.
    const [confirmConfig, setConfirmConfig] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
        isDestructive?: boolean;
        isAlert?: boolean;
    } | null>(null);
    const requestConfirm = useCallback((config: {
        title: string;
        message: string;
        onConfirm: () => void;
        isDestructive?: boolean;
        isAlert?: boolean;
    }) => setConfirmConfig(config), []);

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

    // Memoized: an unmemoized filter() here creates a new array reference every
    // render, which useVoiceManagement's effect treats as "profiles changed" and
    // refetches /api/speakers -> setState -> rerender -> refetch, forever.
    const profiles = useMemo(
        () => (id ? speakerProfiles.filter(p => p.speaker_id === id) : []),
        [id, speakerProfiles]
    );

    // Real rebuild/build-tracking/confirm plumbing for the Variants tab
    // (task 004 R3 fix) -- the same hook VoicesPage.tsx uses, rather than the
    // pre-task-001 VoiceLabPage's inert `buildingProfiles={{}}` /
    // `onBuildNow={async () => false}` / `requestConfirm={() => undefined}`
    // stubs (confirmed a live bug -- see task 004's completion report).
    const { buildingProfiles, handleBuildNow } = useVoiceManagement(
        onRefresh,
        profiles,
        requestConfirm,
        jobs
    );

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

    // Set default — mirrors hooks/useVoiceManagement.ts's handleSetDefault
    // (POST /api/settings/default-speaker), inlined here (self-contained,
    // like handleDelete above) since VoiceLabPage doesn't receive that hook
    // as a prop today and this task's scope doesn't add new props.
    const handleSetDefault = useCallback((profileName: string) => {
        const formData = new URLSearchParams();
        formData.append('name', profileName);
        fetch('/api/settings/default-speaker', { method: 'POST', body: formData }).then(resp => {
            if (resp.ok) onRefresh();
        });
    }, [onRefresh]);

    const handleMetadataSaved = useCallback((updated: VoiceMetadata) => {
        setVoiceMetadataList(prev =>
            prev.some(m => m.id === updated.id)
                ? prev.map(m => m.id === updated.id ? updated : m)
                : [...prev, updated]
        );
    }, []);

    // Overview disclosure default state (owner decision, voice-variants
    // design-critique follow-up, 2026-07-15): defaults open ONLY when
    // required metadata fields (class/gender/age) are missing -- otherwise
    // collapsed. Computed once per voice from its metadata completeness
    // (mirrors OverviewTab's own `requiredMissing` check) as soon as
    // metadata for this id is available; a later metadata refresh (e.g.
    // after Save) must not fight the user's own manual expand/collapse, so
    // the ref below guards it to run once per voice id, not once per
    // metadata object.
    const [overviewOpen, setOverviewOpen] = useState(true);
    const overviewOpenInitializedFor = useRef<string | null>(null);
    useEffect(() => {
        if (!id || !metadata) return;
        if (overviewOpenInitializedFor.current === id) return;
        overviewOpenInitializedFor.current = id;
        const attrs = metadata.attributes;
        const requiredMissing = !attrs?.class || !attrs?.gender || !attrs?.age;
        setOverviewOpen(requiredMissing);
    }, [id, metadata]);

    if (!id) return null;

    // Same untagged-voice fallback the modal used to pass through
    // (`metadata ?? { id, name: id, is_untagged: true }`) so a
    // not-yet-tagged voice still has a VoiceMetadata shape to edit inline.
    const overviewVoice: VoiceMetadata = metadata ?? { id, name: id, is_untagged: true };

    // Overview was relocated by task 002 (inline metadata editing, no modal),
    // then pulled out of the tab shell entirely by task 007 into a standalone
    // disclosure panel (below, above the Variants section) -- Samples by task
    // 003; Variants (+ Voice Settings, promoted from the old card's overflow
    // menu) by task 004; Test (+ ScriptEditor's test-text editing UI, folded
    // in) by task 005. Task 008 (voices-variants-round2) then removed the
    // Samples/Variants/Test tab shell entirely -- VariantsTab is now the only
    // navigation surface rendered directly below the disclosure.

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

            <VoiceDetailHeader
                voiceId={id}
                metadata={metadata}
                iconUrl={iconUrl}
                pills={pills}
                isMobile={isMobile}
                profiles={profiles}
                onSetDefault={handleSetDefault}
                onExport={handleExport}
                onPublish={() => setPublishModalOpen(true)}
                onDelete={() => {
                    requestConfirm({
                        title: 'Delete voice',
                        message: `Delete voice '${metadata?.name ?? id}' and all ${profiles.length} variant${profiles.length !== 1 ? 's' : ''}? This cannot be undone.`,
                        isDestructive: true,
                        onConfirm: handleDelete,
                    });
                }}
            />

            {/* Phase stepper */}
            <div className="voice-lab-page__stepper-row">
                <PhaseStepper phase={phase} />
            </div>

            {/* Voice-level fields (description, languages, class/gender/age,
                many-value fields, free tags) -- pulled out of the tab shell by
                task 007 into a standalone disclosure. Default open/collapsed
                state is metadata-completeness-driven (see overviewOpen above)
                rather than always-open; the disclosure is otherwise
                controlled by the user via onToggle. */}
            <details
                className="voice-lab-page__overview-disclosure"
                open={overviewOpen}
                onToggle={e => setOverviewOpen(e.currentTarget.open)}
            >
                <summary className="voice-lab-page__overview-summary">
                    <ChevronDown size={16} />
                    Voice details
                </summary>
                <div className="voice-lab-page__overview-body">
                    <OverviewTab voice={overviewVoice} onSaved={handleMetadataSaved} />
                </div>
            </details>

            {/* Task 008 (voices-variants-round2): the Samples/Variants/Test tab
                shell is retired -- VariantsTab (VariantsSection) is the sole
                navigation surface below the disclosure above. Task 009 moved
                the Script action's engine-config/test-text editing in-place
                into VariantEditor, so selection no longer needs to be lifted
                here (VariantsSection's own uncontrolled selection state is
                enough) -- `attributes` is threaded down for the Script
                panel's test-text seeding (F1.4). */}
            <VariantsTab
                speakerName={metadata?.name ?? ''}
                profiles={profiles}
                engines={engines}
                buildingProfiles={buildingProfiles}
                testProgress={testProgress}
                onRefresh={onRefresh}
                onBuildNow={handleBuildNow}
                requestConfirm={requestConfirm}
                attributes={metadata?.attributes}
            />

            {/* Publish to Hugging Face modal */}
            <PublishToHuggingFaceModal
                isOpen={publishModalOpen}
                voiceId={id}
                voiceName={metadata?.name ?? id}
                onClose={() => setPublishModalOpen(false)}
            />

            {/* Confirm dialog -- backs the Variants tab's requestConfirm (task 004) */}
            <ConfirmModal
                isOpen={!!confirmConfig}
                title={confirmConfig?.title || ''}
                message={confirmConfig?.message || ''}
                onConfirm={() => { confirmConfig?.onConfirm(); setConfirmConfig(null); }}
                onCancel={() => setConfirmConfig(null)}
                isDestructive={confirmConfig?.isDestructive}
                isAlert={confirmConfig?.isAlert}
            />
        </div>
    );
};
