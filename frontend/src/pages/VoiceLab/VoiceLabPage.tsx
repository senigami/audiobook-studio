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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { SpeakerProfile, TtsEngine, VoiceMetadata, Job } from '@/types';
import { api } from '@/api';
import { voicePillsFromMetadata } from '@/pages/Voices/components/VoicePills';
import { getVoicePhase } from '@/pages/Voices/voicePhase';
import { PhaseStepper } from '@/pages/VoiceLab/components/PhaseStepper';
import { PublishToHuggingFaceModal } from '@/pages/VoiceLab/components/PublishToHuggingFaceModal';
import { VoiceDetailHeader } from '@/pages/VoiceLab/components/VoiceDetailHeader';
import { VoiceDetailTabs, type VoiceDetailTabDef } from '@/pages/VoiceLab/components/VoiceDetailTabs';
import { OverviewTab } from '@/pages/VoiceLab/components/OverviewTab';
import { SamplesTab } from '@/pages/VoiceLab/components/SamplesTab';
import { VariantsTab } from '@/pages/VoiceLab/components/VariantsTab';
import { TestTab } from '@/pages/VoiceLab/components/TestTab';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { useVoiceManagement } from '@/hooks/useVoiceManagement';
import { getDefaultVoiceProfileName } from '@/utils/voiceProfiles';

// NOTE: VoiceIconControls (previously lazy-loaded and rendered directly below
// the phase stepper) is not rendered in this task. SamplesSection was
// relocated into the Samples tabpanel by task 003 (via SamplesTab);
// VariantsSection + VoiceSettingsPanel were relocated into the Variants
// tabpanel by task 004 (via VariantsTab); TestSection + ScriptEditor's
// test-text editing UI were relocated/folded into the Test tabpanel by task
// 005 (via TestTab) -- the old ScriptEditor drawer is retired.

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
    // Controlled active tab (task 005) -- lets the Variants tab's "Script"
    // button (VariantEditor) switch straight to the Test tab instead of
    // opening the retired ScriptEditor drawer.
    const [activeTabId, setActiveTabId] = useState('overview');
    // Preselects the Test tab's active variant when Script is activated from the Variants tab's
    // switcher (task 013) -- otherwise the Test tab falls back to its own default-variant logic.
    const [preselectedTestVariant, setPreselectedTestVariant] = useState<string | null>(null);
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

    // Voice Settings (promoted into the Variants tab, task 004) -- edits the
    // default variant's plugin settings. isSavingSettings is local since
    // useVoiceManagement's handleUpdateSettings doesn't track a busy flag.
    const [editingSettings, setEditingSettings] = useState<Record<string, any>>({});
    const [isSavingSettings, setIsSavingSettings] = useState(false);

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
    const { buildingProfiles, handleBuildNow, handleUpdateSettings } = useVoiceManagement(
        onRefresh,
        profiles,
        requestConfirm,
        jobs
    );

    const settingsProfileName = useMemo(() => getDefaultVoiceProfileName(profiles, engines), [profiles, engines]);
    const settingsProfile = profiles.find(p => p.name === settingsProfileName) ?? null;

    useEffect(() => {
        setEditingSettings(settingsProfile?.settings || {});
    }, [settingsProfile]);

    const handleSaveVoiceSettings = useCallback(async () => {
        if (!settingsProfile) return;
        setIsSavingSettings(true);
        try {
            const activeEngine = engines.find(e => e.engine_id === settingsProfile.engine);
            const allowedPluginSettings = new Set(activeEngine?.behavior?.synthesis_settings || []);
            const settingsToUpdate = Object.fromEntries(
                Object.entries(editingSettings || {}).filter(([key]) => allowedPluginSettings.has(key))
            );
            await handleUpdateSettings(settingsProfile.name, settingsToUpdate);
        } finally {
            setIsSavingSettings(false);
        }
    }, [settingsProfile, engines, editingSettings, handleUpdateSettings]);

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

    if (!id) return null;

    // Same untagged-voice fallback the modal used to pass through
    // (`metadata ?? { id, name: id, is_untagged: true }`) so a
    // not-yet-tagged voice still has a VoiceMetadata shape to edit inline.
    const overviewVoice: VoiceMetadata = metadata ?? { id, name: id, is_untagged: true };

    // Overview was relocated by task 002 (inline metadata editing, no modal);
    // Samples by task 003; Variants (+ Voice Settings, promoted from the old
    // card's overflow menu) by task 004; Test (+ ScriptEditor's test-text
    // editing UI, folded in) by task 005.
    const detailTabs: VoiceDetailTabDef[] = [
        {
            id: 'overview',
            label: 'Overview',
            content: <OverviewTab voice={overviewVoice} onSaved={handleMetadataSaved} />,
        },
        {
            id: 'samples',
            label: 'Samples',
            content: <SamplesTab profiles={profiles} onRefresh={onRefresh} />,
        },
        {
            id: 'variants',
            label: 'Variants',
            content: (
                <VariantsTab
                    speakerName={metadata?.name ?? ''}
                    profiles={profiles}
                    engines={engines}
                    buildingProfiles={buildingProfiles}
                    testProgress={testProgress}
                    onRefresh={onRefresh}
                    onBuildNow={handleBuildNow}
                    requestConfirm={requestConfirm}
                    onEditTestText={(profile) => {
                        setPreselectedTestVariant(profile.name);
                        setActiveTabId('test');
                    }}
                    settingsProfile={settingsProfile}
                    settings={editingSettings}
                    onSettingsChange={setEditingSettings}
                    isSavingSettings={isSavingSettings}
                    onSaveSettings={handleSaveVoiceSettings}
                />
            ),
        },
        {
            id: 'test',
            label: 'Test',
            content: (
                <TestTab
                    profiles={profiles}
                    engines={engines}
                    testProgress={testProgress}
                    jobs={jobs}
                    onTest={async (name) => {
                        await fetch(`/api/speaker-profiles/${encodeURIComponent(name)}/test`, { method: 'POST' });
                        onRefresh();
                    }}
                    onRefresh={onRefresh}
                    voiceName={metadata?.name ?? id}
                    attributes={metadata?.attributes}
                    preselectedVariantName={preselectedTestVariant}
                />
            ),
        },
    ];

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
                    if (window.confirm(
                        `Delete voice '${metadata?.name ?? id}' and all ${profiles.length} variant${profiles.length !== 1 ? 's' : ''}? This cannot be undone.`
                    )) {
                        handleDelete();
                    }
                }}
            />

            {/* Phase stepper */}
            <div className="voice-lab-page__stepper-row">
                <PhaseStepper phase={phase} />
            </div>

            <VoiceDetailTabs
                tabs={detailTabs}
                ariaLabel="Voice management"
                activeTabId={activeTabId}
                onTabChange={setActiveTabId}
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
