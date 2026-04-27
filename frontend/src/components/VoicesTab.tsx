import React from 'react';
import type { Job, Settings, TtsEngine, SpeakerProfile } from '../types';
import { useVoiceManagement } from '../hooks/useVoiceManagement';
import { VoicesModals } from './VoicesModals';
import { useVoicesTabState } from '../hooks/useVoicesTabState';
import { useVoicesData } from '../hooks/useVoicesData';
import { useVoicesTabActions } from '../hooks/useVoicesTabActions';
import { VoicesTabHeader } from './voices/VoicesTabHeader';
import { VoicesTabContent } from './voices/VoicesTabContent';

interface VoicesTabProps {
    onRefresh: () => void | Promise<void>;
    speakerProfiles: SpeakerProfile[];
    testProgress: Record<string, { progress: number; started_at?: number }>;
    jobs?: Record<string, Job>;
    settings?: Settings;
    engines?: TtsEngine[];
}

export const VoicesTab: React.FC<VoicesTabProps> = ({ onRefresh, speakerProfiles, testProgress, jobs = {}, engines = [] }) => {
    const state = useVoicesTabState({ speakerProfiles, engines });

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
        exportVoiceName: state.exportVoiceName
    });

    const actions = useVoicesTabActions({
        state,
        management,
        onRefresh,
        engines,
        allVoices: data.allVoices
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            <VoicesTabHeader
                searchQuery={state.searchQuery}
                setSearchQuery={state.setSearchQuery}
                engineFilter={state.engineFilter}
                setEngineFilter={state.setEngineFilter}
                engineFilterOptions={data.engineFilterOptions}
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
            />

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
                    state.setNewVariantEngine(profiles[0]?.engine || 'xtts');
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
            />

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
                voxtralVoiceId={state.voxtralVoiceId}
                setVoxtralVoiceId={state.setVoxtralVoiceId}
                isSavingText={state.isSavingText}
                handleResetTestText={actions.handleResetTestText}
                handleSaveTestText={actions.handleSaveTestText}
                confirmConfig={state.confirmConfig}
                setConfirmConfig={state.setConfirmConfig}
                exportVoiceName={state.exportVoiceName}
                setExportVoiceName={state.setExportVoiceName}
                includeSourceWavs={state.includeSourceWavs}
                setIncludeSourceWavs={state.setIncludeSourceWavs}
                handleConfirmExportVoice={actions.handleConfirmExportVoice}
                exportVoiceOptions={data.exportVoiceOptions}
            />
        </div>
    );
};
