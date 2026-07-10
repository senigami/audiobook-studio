import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Job, Settings, TtsEngine, SpeakerProfile, VoiceMetadata } from '@/types';
import { useVoiceManagement } from '@/hooks/useVoiceManagement';
import { VoicesModals } from '@/components/VoicesModals';
import { useVoicesTabState } from '@/hooks/useVoicesTabState';
import { useVoicesData } from '@/hooks/useVoicesData';
import { useVoicesTabActions } from '@/hooks/useVoicesTabActions';
import { VoicesTabHeader } from '@/pages/Voices/components/VoicesTabHeader';
import type { VoicesTab as VoicesTabId } from '@/pages/Voices/components/VoicesTabHeader';
import { VoicesTabContent } from '@/pages/Voices/components/VoicesTabContent';
import { HuggingFaceDiscover } from '@/pages/Voices/components/HuggingFaceDiscover';
import { MetadataEditorModal } from '@/pages/Voices/components/MetadataEditorModal';
import { getDefaultEngineId, isVoiceProfileSelectable } from '@/utils/voiceProfiles';
import { api } from '@/api';

// ---------------------------------------------------------------------------
// Taxonomy facet options for class/gender/age (subset used as filter pills)
// ---------------------------------------------------------------------------
const CLASS_OPTIONS = [
    { id: 'human', label: 'Human' },
    { id: 'synthetic', label: 'Synthetic' },
    { id: 'creature', label: 'Creature' },
    { id: 'character', label: 'Character' },
    { id: 'deity', label: 'Deity' },
];
const GENDER_OPTIONS = [
    { id: 'feminine', label: 'Feminine' },
    { id: 'masculine', label: 'Masculine' },
    { id: 'neutral', label: 'Neutral' },
    { id: 'ambiguous', label: 'Ambiguous' },
];
const AGE_OPTIONS = [
    { id: 'child', label: 'Child' },
    { id: 'teen', label: 'Teen' },
    { id: 'young-adult', label: 'Young adult' },
    { id: 'adult', label: 'Adult' },
    { id: 'middle-aged', label: 'Middle-aged' },
    { id: 'senior', label: 'Senior' },
    { id: 'ageless', label: 'Ageless' },
];

/**
 * Resolve the VoiceMetadata for `editingProfile` — reuses the exact id-first/name-fallback
 * convention as `handleEditMetadata` in this file — drives ScriptEditor's "Suggest from voice
 * qualities" button (INV-4). Exported (pure, no hooks) so this stable-primitive matching can be
 * unit tested directly against stale/rebuilt `voiceGroups` arrays.
 *
 * Matches on `editingProfile.name` (the stable primitive key already used elsewhere for this
 * profile — e.g. handleUpdateSettings/rename/reset-test-text all key off it), not on reference
 * identity: `data.activeVoices`/`disabledVoices` are rebuilt from `speakerProfiles`, which gets
 * entirely new object references on every refetchHome() (unrelated websocket events elsewhere in
 * the app trigger this), so a `.includes(editingProfile)` reference-equality search would
 * silently go stale mid-session.
 */
export function resolveEditingVoiceMetadata(
    editingProfile: SpeakerProfile | null | undefined,
    voiceGroups: Array<{ id: string; name: string; profiles: SpeakerProfile[] }>,
    voiceMetadataMap: Map<string, VoiceMetadata>,
    voiceMetadataList: VoiceMetadata[]
): VoiceMetadata | undefined {
    if (!editingProfile) return undefined;
    const group = voiceGroups.find(v => v.profiles.some(p => p.name === editingProfile.name));
    if (!group) return undefined;
    return voiceMetadataMap.get(group.id) ?? voiceMetadataList.find(m => m.name === group.name);
}

interface VoicesTabProps {
    onRefresh: () => void | Promise<void>;
    speakerProfiles: SpeakerProfile[];
    testProgress: Record<string, { progress: number; started_at?: number }>;
    jobs?: Record<string, Job>;
    settings?: Settings;
    engines?: TtsEngine[];
}

export const VoicesTab: React.FC<VoicesTabProps> = ({ onRefresh, speakerProfiles, testProgress, jobs = {}, engines = [] }) => {
    const navigate = useNavigate();
    const state = useVoicesTabState({ speakerProfiles, engines });

    // ---------------------------------------------------------------------------
    // Local / Discover tab state — R5-T4
    // ---------------------------------------------------------------------------
    const [voicesTab, setVoicesTab] = useState<VoicesTabId>('local');

    // ---------------------------------------------------------------------------
    // Voice metadata — fetched from GET /api/voices/ (Phase C endpoint)
    // ---------------------------------------------------------------------------
    const [voiceMetadataList, setVoiceMetadataList] = useState<VoiceMetadata[]>([]);
    const [metadataEditorVoice, setMetadataEditorVoice] = useState<VoiceMetadata | null>(null);

    const fetchMetadata = useCallback(async () => {
        try {
            const list = await api.listVoicesWithMetadata();
            if (Array.isArray(list)) setVoiceMetadataList(list);
        } catch {
            // Non-fatal: metadata features degrade gracefully
        }
    }, []);

    useEffect(() => {
        void fetchMetadata();
    }, [fetchMetadata]);

    // Build a map keyed by voice id for O(1) lookup in filtering
    const voiceMetadataMap = useMemo<Map<string, VoiceMetadata>>(
        () => new Map(voiceMetadataList.map(m => [m.id, m])),
        [voiceMetadataList]
    );

    const management = useVoiceManagement(
        onRefresh,
        state.activeSpeakerProfiles,
        (config) => state.setConfirmConfig(config),
        jobs
    );

    const data = useVoicesData({
        speakers: management.speakers,
        activeSpeakerProfiles: state.activeSpeakerProfiles,
        disabledSpeakerProfiles: state.disabledSpeakerProfiles,
        engines,
        searchQuery: state.searchQuery,
        engineFilter: state.engineFilter,
        exportVoiceName: state.exportVoiceName,
        voiceMetadataMap,
        classFilter: state.classFilter,
        genderFilter: state.genderFilter,
        ageFilter: state.ageFilter,
    });

    const actions = useVoicesTabActions({
        state,
        management,
        onRefresh,
        engines,
        allVoices: data.allVoices
    });

    // Open metadata editor for a voice group (identified by group id = speaker id)
    const handleEditMetadata = useCallback((voiceGroupId: string, voiceName: string) => {
        // Try to find by id first, then fall back to name match
        const meta = voiceMetadataMap.get(voiceGroupId)
            ?? voiceMetadataList.find(m => m.name === voiceName)
            ?? { id: voiceGroupId, name: voiceName, is_untagged: true };
        setMetadataEditorVoice(meta);
    }, [voiceMetadataMap, voiceMetadataList]);

    // See resolveEditingVoiceMetadata above — drives ScriptEditor's "Suggest from voice
    // qualities" button (INV-4).
    const editingVoiceMetadata = useMemo<VoiceMetadata | undefined>(
        () => resolveEditingVoiceMetadata(state.editingProfile, [...data.activeVoices, ...data.disabledVoices], voiceMetadataMap, voiceMetadataList),
        [state.editingProfile, data.activeVoices, data.disabledVoices, voiceMetadataMap, voiceMetadataList]
    );

    const handleMetadataSaved = useCallback((updated: VoiceMetadata) => {
        setVoiceMetadataList(prev =>
            prev.some(m => m.id === updated.id)
                ? prev.map(m => m.id === updated.id ? updated : m)
                : [...prev, updated]
        );
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                Voices
            </h1>
            <VoicesTabHeader
                searchQuery={state.searchQuery}
                setSearchQuery={state.setSearchQuery}
                engineFilter={state.engineFilter}
                setEngineFilter={state.setEngineFilter}
                engineFilterOptions={data.engineFilterOptions}
                classFilter={state.classFilter}
                setClassFilter={state.setClassFilter}
                classOptions={CLASS_OPTIONS}
                genderFilter={state.genderFilter}
                setGenderFilter={state.setGenderFilter}
                genderOptions={GENDER_OPTIONS}
                ageFilter={state.ageFilter}
                setAgeFilter={state.setAgeFilter}
                ageOptions={AGE_OPTIONS}
                isImportingVoice={state.isImportingVoice}
                exportVoiceDisabled={data.exportVoiceOptions.length === 0}
                importInputRef={state.importInputRef}
                onImportClick={(event) => void actions.handleImportVoiceBundle(event.target.files?.[0] || null)}
                onExportClick={() => {
                    if (data.exportVoiceOptions.length === 0) return;
                    state.setExportVoiceName(data.exportVoiceOptions[0].value);
                    state.setIncludeSourceWavs(false);
                }}
                onCreateClick={() => state.setIsCreateModalOpen(true)}
                onGuideClick={() => state.setShowGuide(true)}
                activeTab={voicesTab}
                onTabChange={setVoicesTab}
            />

            {voicesTab === 'local' ? (
                <VoicesTabContent
                    voices={state.engineFilter === 'disabled' ? data.disabledVoices : data.activeVoices}
                    filteredVoices={data.filteredVoices}
                    engineFilter={state.engineFilter}
                    onRefresh={onRefresh}
                    handleTest={management.handleTest}
                    handleDelete={management.handleDelete}
                    handleBuildNow={management.handleBuildNow}
                    testProgress={testProgress}
                    handleRequestConfirm={state.handleRequestConfirm}
                    buildingProfiles={management.buildingProfiles}
                    onSetDefault={management.handleSetDefault}
                    onRename={(s) => {
                        state.setRenameSpeakerId(s.id);
                        state.setOriginalSpeakerName(s.name);
                        state.setNewSpeakerName(s.name);
                        state.setIsRenameModalOpen(true);
                    }}
                    onAddVariant={(s, profiles) => {
                        state.setAddVariantSpeaker({ speaker: s, nextVariantNum: profiles.length + 1 });
                        state.setNewVariantNameModal(`Variant ${profiles.length + 1}`);
                        state.setNewVariantEngine(
                            profiles.find(profile => isVoiceProfileSelectable(profile, engines))?.engine || getDefaultEngineId(engines),
                        );
                        state.setIsAddVariantModalOpen(true);
                    }}
                    onMoveVariant={(p) => {
                        state.setMoveVariantProfile(p);
                        state.setSelectedMoveSpeakerId('');
                        state.setIsMoveVariantModalOpen(true);
                    }}
                    onExportVoice={(voiceName) => {
                        state.setExportVoiceName(voiceName);
                        state.setIncludeSourceWavs(false);
                    }}
                    expandedVoiceId={state.expandedVoiceId}
                    setExpandedVoiceId={state.setExpandedVoiceId}
                    engines={engines}
                    onCreateClick={() => state.setIsCreateModalOpen(true)}
                    onEditTestText={state.setEditingProfile}
                    voiceMetadataMap={voiceMetadataMap}
                    onEditMetadata={handleEditMetadata}
                    onNavigateToLab={(id) => navigate(`/voices/${id}`)}
                />
            ) : (
                <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                        <HuggingFaceDiscover
                            onImported={() => {
                                void onRefresh();
                                void fetchMetadata();
                            }}
                        />
                    </div>
                </div>
            )}

            <VoicesModals
                isCreateModalOpen={state.isCreateModalOpen}
                setIsCreateModalOpen={state.setIsCreateModalOpen}
                newVoiceName={state.newVoiceName}
                setNewVoiceName={state.setNewVoiceName}
                newVoiceEngine={state.newVoiceEngine}
                setNewVoiceEngine={state.setNewVoiceEngine}
                engines={engines}
                isCreatingVoice={state.isCreatingVoice}
                handleCreateVoice={actions.handleCreateVoice}
                newVoiceSamples={state.newVoiceSamples}
                setNewVoiceSamples={state.setNewVoiceSamples}
                isRenameModalOpen={state.isRenameModalOpen}
                setIsRenameModalOpen={state.setIsRenameModalOpen}
                originalSpeakerName={state.originalSpeakerName}
                newSpeakerName={state.newSpeakerName}
                setNewSpeakerName={state.setNewSpeakerName}
                isRenamingSpeaker={state.isRenamingSpeaker}
                handleRenameSpeaker={actions.handleRenameSpeaker}
                isAddVariantModalOpen={state.isAddVariantModalOpen}
                setIsAddVariantModalOpen={state.setIsAddVariantModalOpen}
                addVariantSpeaker={state.addVariantSpeaker}
                newVariantNameModal={state.newVariantNameModal}
                setNewVariantNameModal={state.setNewVariantNameModal}
                newVariantEngine={state.newVariantEngine}
                setNewVariantEngine={state.setNewVariantEngine}
                isAddingVariantModal={state.isAddingVariantModal}
                handleAddVariant={actions.handleAddVariant}
                isMoveVariantModalOpen={state.isMoveVariantModalOpen}
                setIsMoveVariantModalOpen={state.setIsMoveVariantModalOpen}
                moveVariantProfile={state.moveVariantProfile}
                allVoices={data.allVoices}
                selectedMoveSpeakerId={state.selectedMoveSpeakerId}
                setSelectedMoveSpeakerId={state.setSelectedMoveSpeakerId}
                isMovingVariant={state.isMovingVariant}
                handleMoveVariant={actions.handleMoveVariant}
                showGuide={state.showGuide}
                setShowGuide={state.setShowGuide}
                editingProfile={state.editingProfile}
                setEditingProfile={state.setEditingProfile}
                variantName={state.variantName}
                setVariantName={state.setVariantName}
                editingEngine={state.editingEngine}
                setEditingEngine={state.setEditingEngine}
                testText={state.testText}
                setTestText={state.setTestText}
                referenceSample={state.referenceSample}
                setReferenceSample={state.setReferenceSample}
                engineVoiceId={state.engineVoiceId}
                setEngineVoiceId={state.setEngineVoiceId}
                editingSettings={state.editingSettings}
                setEditingSettings={state.setEditingSettings}
                isSavingText={state.isSavingText}
                handleResetTestText={actions.handleResetTestText}
                handleSaveTestText={actions.handleSaveTestText}
                editingVoiceMetadata={editingVoiceMetadata}
                confirmConfig={state.confirmConfig}
                setConfirmConfig={state.setConfirmConfig}
                exportVoiceName={state.exportVoiceName}
                setExportVoiceName={state.setExportVoiceName}
                includeSourceWavs={state.includeSourceWavs}
                setIncludeSourceWavs={state.setIncludeSourceWavs}
                handleConfirmExportVoice={actions.handleConfirmExportVoice}
                exportVoiceOptions={data.exportVoiceOptions}
            />

            <MetadataEditorModal
                isOpen={metadataEditorVoice !== null}
                voice={metadataEditorVoice}
                onClose={() => setMetadataEditorVoice(null)}
                onSaved={handleMetadataSaved}
            />
        </div>
    );
};
