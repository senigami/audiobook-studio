import React from 'react';
import type { Speaker, SpeakerProfile, Job, VoiceEngine, Settings, TtsEngine } from '../types';
import { useVoiceManagement } from '../hooks/useVoiceManagement';
import { VoicesModals } from './VoicesModals';
import { formatVoiceEngineLabel, getVariantDisplayName, getVoiceProfileEngine, isDefaultVoiceProfile } from '../utils/voiceProfiles';
import { api } from '../api';
import { useVoicesTabState } from '../hooks/useVoicesTabState';
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

    const {
        speakers,
        buildingProfiles,
        fetchSpeakers,
        handleSetDefault,
        handleTest,
        handleBuildNow,
        handleDelete,
        handleUpdateEngine,
        handleUpdateSettings,
        formatError
    } = useVoiceManagement(onRefresh, state.activeSpeakerProfiles, (config) => state.setConfirmConfig(config), jobs);

    // --- Data Processing ---
    const buildVoiceGroups = (profiles: SpeakerProfile[]) => {
        const groupedVoices = (speakers || []).map(speaker => {
            const pList = profiles.filter(p => p.speaker_id === speaker.id);
            if (pList.length === 0) return null;
            return {
                id: speaker.id,
                name: speaker.name,
                profiles: pList
            };
        }).filter(Boolean) as Array<{ id: string; name: string; profiles: SpeakerProfile[] }>;

        const unassigned = profiles.filter(p => !p.speaker_id || !speakers.some(s => s.id === p.speaker_id));
        const unassignedGroups: Record<string, SpeakerProfile[]> = {};
        unassigned.forEach(p => {
            let groupKey = p.speaker_id || '';
            const looksLikeUuid = groupKey.length === 36 && groupKey.includes('-');
            if (!groupKey || looksLikeUuid) {
                groupKey = p.name.includes(' - ') ? p.name.split(' - ')[0] : p.name.split('_')[0];
            }
            if (!unassignedGroups[groupKey]) unassignedGroups[groupKey] = [];
            unassignedGroups[groupKey].push(p);
        });

        const unassignedVoices = Object.entries(unassignedGroups).map(([groupKey, groupedProfiles]) => ({
            id: `unassigned-${groupKey}`,
            name: groupKey,
            profiles: groupedProfiles,
            isUnassigned: true
        }));

        return [...groupedVoices, ...unassignedVoices];
    };

    const activeVoices = buildVoiceGroups(state.activeSpeakerProfiles);
    const disabledVoices = buildVoiceGroups(state.disabledSpeakerProfiles);
    const allVoices = activeVoices;
    
    const exportVoiceOptions = activeVoices
        .filter(voice => !(voice as any).isUnassigned)
        .map(voice => ({
            value: voice.name,
            label: voice.name
        }))
        .filter((option, index, self) => self.findIndex(candidate => candidate.value === option.value) === index);
    
    if (state.exportVoiceName && !exportVoiceOptions.some(option => option.value === state.exportVoiceName)) {
        exportVoiceOptions.unshift({
            value: state.exportVoiceName,
            label: state.exportVoiceName
        });
    }

    const voices = state.engineFilter === 'disabled' ? disabledVoices : activeVoices;

    const filteredVoices = voices.filter(v => {
        const query = state.searchQuery.toLowerCase();
        const matchesSearch = v.name.toLowerCase().includes(query) || 
               v.profiles.some((p: SpeakerProfile) => getVariantDisplayName(p).toLowerCase().includes(query));
        const matchesEngine = state.engineFilter === 'all' || state.engineFilter === 'disabled' || v.profiles.some((p: SpeakerProfile) => getVoiceProfileEngine(p) === state.engineFilter);
        return matchesSearch && matchesEngine;
    }).sort((a, b) => a.name.localeCompare(b.name));

    const engineCounts = state.activeSpeakerProfiles.reduce((acc, profile) => {
        const engine = getVoiceProfileEngine(profile) || 'unknown';
        acc[engine] = (acc[engine] || 0) + 1;
        return acc;
    }, { xtts: 0 } as Record<string, number>);

    const disabledCount = state.disabledSpeakerProfiles.length;

    const engineFilterOptions: Array<{ key: 'all' | 'disabled' | VoiceEngine; label: string }> = [
        { key: 'all', label: `All (${state.activeSpeakerProfiles.length})` },
        ...(engineCounts.xtts > 0 ? [{ key: 'xtts' as const, label: `XTTS (${engineCounts.xtts})` }] : []),
        ...engines.filter(e => e.engine_id !== 'xtts' && e.enabled && e.status === 'ready').map(e => ({
            key: e.engine_id as VoiceEngine,
            label: `${e.display_name || formatVoiceEngineLabel(e.engine_id)} (${engineCounts[e.engine_id as VoiceEngine] || 0})`
        })),
        ...(disabledCount > 0 ? [{ key: 'disabled' as const, label: `Disabled (${disabledCount})` }] : [])
    ];

    // --- Action Handlers ---
    const handleSaveTestText = async () => {
        if (!state.editingProfile) return;
        state.setIsSavingText(true);
        try {
            const settingsToUpdate: Record<string, any> = {
                test_text: state.testText,
                engine: state.editingEngine
            };

            const activeEngine = engines.find(e => e.engine_id === state.editingEngine);
            if (activeEngine?.cloud) {
                settingsToUpdate.reference_sample = state.referenceSample || null;
                settingsToUpdate.voxtral_voice_id = state.voxtralVoiceId;
            }

            const success = await handleUpdateSettings(state.editingProfile.name, settingsToUpdate);

            if (success) {
                const currentVariantDisplay = getVariantDisplayName(state.editingProfile);
                if (state.variantName && state.variantName !== currentVariantDisplay) {
                    if (isDefaultVoiceProfile(state.editingProfile)) {
                        const variantForm = new URLSearchParams();
                        variantForm.append('variant_name', state.variantName);
                        await fetch(`/api/speaker-profiles/${encodeURIComponent(state.editingProfile.name)}/variant-name`, {
                            method: 'POST',
                            body: variantForm
                        });
                    } else {
                        let newFullName = state.variantName;
                        if (state.editingProfile.speaker_id) {
                            const speaker = speakers.find((s: Speaker) => s.id === state.editingProfile?.speaker_id);
                            if (speaker) {
                                newFullName = (state.variantName === 'Default' || state.variantName === speaker.name) ? speaker.name : `${speaker.name} - ${state.variantName}`;
                            }
                        }

                        const renameForm = new URLSearchParams();
                        renameForm.append('new_name', newFullName);
                        await fetch(`/api/speaker-profiles/${encodeURIComponent(state.editingProfile.name)}/rename`, {
                            method: 'POST',
                            body: renameForm
                        });
                    }
                }
                state.setEditingProfile(null);
                onRefresh();
            }
        } catch (e) {
            console.error('Failed to save profile', e);
        } finally {
            state.setIsSavingText(false);
        }
    };

    const handleResetTestText = async () => {
        if (!state.editingProfile) return;
        state.setIsSavingText(true);
        try {
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(state.editingProfile.name)}/reset-test-text`, {
                method: 'POST'
            });
            const result = await resp.json();
            if (result.status === 'ok' || result.status === 'success') {
                state.setTestText(result.test_text);
                state.setEditingProfile(null);
                onRefresh();
            }
        } catch (e) {
            console.error('Failed to reset script', e);
        } finally {
            state.setIsSavingText(false);
        }
    };

    const handleCreateVoice = async () => {
        state.setIsCreatingVoice(true);
        const nameToUse = state.newVoiceName.trim();
        try {
            const resp = await fetch('/api/speakers', {
                method: 'POST',
                body: new URLSearchParams({ name: nameToUse })
            });
            if (resp.ok) {
                if (state.newVoiceEngine !== 'xtts') {
                    await handleUpdateEngine(nameToUse, state.newVoiceEngine);
                }
                const data = await resp.json();
                state.setIsCreateModalOpen(false);
                state.setNewVoiceName('');
                state.setNewVoiceEngine('xtts');
                await fetchSpeakers();
                if (data.id) state.setExpandedVoiceId(data.id);
            }
        } finally {
            state.setIsCreatingVoice(false);
        }
    };

    const handleRenameSpeaker = async () => {
        if (!state.renameSpeakerId && !state.originalSpeakerName) return;
        state.setIsRenamingSpeaker(true);
        try {
            const formData = new URLSearchParams();
            formData.append('id', state.renameSpeakerId || '');
            formData.append('new_name', state.newSpeakerName.trim());
            const url = state.renameSpeakerId 
                ? `/api/speakers/${state.renameSpeakerId}` 
                : `/api/speaker-profiles/${encodeURIComponent(state.originalSpeakerName)}/rename`;
            
            const resp = await fetch(url, {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                const renamedTo = state.newSpeakerName.trim();
                state.setIsRenameModalOpen(false);
                if (!state.renameSpeakerId) {
                    state.setExpandedVoiceId(prev => prev === `unassigned-${state.originalSpeakerName}` ? `unassigned-${renamedTo}` : prev);
                }
                await Promise.all([Promise.resolve(onRefresh()), fetchSpeakers()]);
            } else {
                const err = await resp.json();
                state.handleRequestConfirm({
                    title: 'Rename Failed',
                    message: formatError(err, 'An unknown error occurred while renaming the voice.'),
                    onConfirm: () => {},
                    isAlert: true
                });
            }
        } finally {
            state.setIsRenamingSpeaker(false);
        }
    };

    const handleAddVariant = async () => {
        if (!state.addVariantSpeaker || (!state.addVariantSpeaker.speaker.id && !state.addVariantSpeaker.speaker.name)) return;
        const vName = state.newVariantNameModal.trim();
        if (!vName) {
            state.handleRequestConfirm({
                title: 'Invalid Name',
                message: 'Please enter a name for the variant.',
                onConfirm: () => {},
                isAlert: true
            });
            return;
        }
        state.setIsAddingVariantModal(true);
        try {
            const formData = new URLSearchParams();
            const sid = state.addVariantSpeaker.speaker.id || state.addVariantSpeaker.speaker.name;
            formData.append('speaker_id', sid);
            formData.append('variant_name', vName);
            formData.append('engine', state.newVariantEngine);
            const resp = await fetch('/api/speaker-profiles', {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                state.setIsAddVariantModalOpen(false);
                state.setAddVariantSpeaker(null);
                state.setNewVariantNameModal('');
                state.setNewVariantEngine('xtts');
                const expandedId = (sid.includes('-') && sid.length === 36) ? sid : `unassigned-${sid}`;
                state.setExpandedVoiceId(expandedId);
                onRefresh();
            } else {
                const err = await resp.json();
                state.handleRequestConfirm({
                    title: 'Add Variant Failed',
                    message: formatError(err, 'An unknown error occurred while adding the variant.'),
                    onConfirm: () => {},
                    isAlert: true
                });
            }
        } finally {
            state.setIsAddingVariantModal(false);
        }
    };

    const handleMoveVariant = async () => {
        state.setIsMovingVariant(true);
        try {
            let targetSpeakerId = state.selectedMoveSpeakerId;
            if (state.selectedMoveSpeakerId.startsWith('unassigned-')) {
                const targetVoiceEntry = allVoices.find(v => v.id === state.selectedMoveSpeakerId);
                if (targetVoiceEntry) {
                    const createResp = await fetch('/api/speakers', {
                        method: 'POST',
                        body: new URLSearchParams({ name: targetVoiceEntry.name })
                    });
                    if (!createResp.ok) throw new Error('Failed to create speaker');
                    const newSpeaker = await createResp.json();
                    targetSpeakerId = newSpeaker.id;
                    const assignForm = new URLSearchParams();
                    assignForm.append('speaker_id', targetSpeakerId);
                    assignForm.append('variant_name', 'Default');
                    await fetch(`/api/speaker-profiles/${encodeURIComponent(targetVoiceEntry.name)}/assign`, {
                        method: 'POST',
                        body: assignForm
                    });
                }
            }
            const formData = new URLSearchParams();
            formData.append('speaker_id', targetSpeakerId);
            if (state.moveVariantProfile) formData.append('variant_name', state.moveVariantProfile.variant_name || 'Default');
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(state.moveVariantProfile?.name || '')}/assign`, {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                state.setIsMoveVariantModalOpen(false);
                state.setMoveVariantProfile(null);
                onRefresh();
                fetchSpeakers();
            } else {
                const err = await resp.json();
                state.handleRequestConfirm({
                    title: 'Move Failed',
                    message: formatError(err, 'An unknown error occurred.'),
                    onConfirm: () => {},
                    isAlert: true
                });
            }
        } catch (err: any) {
            state.handleRequestConfirm({
                title: 'Move Failed',
                message: err.message || 'An error occurred.',
                onConfirm: () => {},
                isAlert: true
            });
        } finally {
            state.setIsMovingVariant(false);
        }
    };

    const handleConfirmExportVoice = () => {
        if (!state.exportVoiceName) return;
        const url = api.exportVoiceBundleUrl(state.exportVoiceName, state.includeSourceWavs);
        window.open(url, '_blank');
        state.setExportVoiceName(null);
        state.setIncludeSourceWavs(false);
    };

    const handleImportVoiceBundle = async (file: File | null) => {
        if (!file) return;
        state.setIsImportingVoice(true);
        try {
            const result = await api.importVoiceBundle(file);
            await Promise.all([Promise.resolve(onRefresh()), fetchSpeakers()]);
            state.handleRequestConfirm({
                title: 'Voice Imported',
                message: result.was_renamed
                    ? `Imported "${result.original_voice_name}" as "${result.voice_name}".`
                    : `Imported "${result.voice_name}".`,
                onConfirm: () => {},
                isAlert: true
            });
        } catch (err: any) {
            state.handleRequestConfirm({
                title: 'Import Failed',
                message: err?.message || 'The selected voice bundle could not be imported.',
                onConfirm: () => {},
                isAlert: true
            });
        } finally {
            state.setIsImportingVoice(false);
            if (state.importInputRef.current) state.importInputRef.current.value = '';
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            <VoicesTabHeader
                searchQuery={state.searchQuery}
                setSearchQuery={state.setSearchQuery}
                engineFilter={state.engineFilter}
                setEngineFilter={state.setEngineFilter}
                engineFilterOptions={engineFilterOptions}
                isImportingVoice={state.isImportingVoice}
                exportVoiceDisabled={exportVoiceOptions.length === 0}
                importInputRef={state.importInputRef}
                onImportClick={(event) => void handleImportVoiceBundle(event.target.files?.[0] || null)}
                onExportClick={() => {
                    if (exportVoiceOptions.length === 0) return;
                    state.setExportVoiceName(exportVoiceOptions[0].value);
                    state.setIncludeSourceWavs(false);
                }}
                onCreateClick={() => state.setIsCreateModalOpen(true)}
                onGuideClick={() => state.setShowGuide(true)}
            />

            <VoicesTabContent
                voices={voices}
                filteredVoices={filteredVoices}
                engineFilter={state.engineFilter}
                onRefresh={onRefresh}
                handleTest={handleTest}
                handleDelete={handleDelete}
                handleBuildNow={handleBuildNow}
                testProgress={testProgress}
                handleRequestConfirm={state.handleRequestConfirm}
                buildingProfiles={buildingProfiles}
                onSetDefault={handleSetDefault}
                onRename={(s) => {
                    state.setRenameSpeakerId(s.id);
                    state.setOriginalSpeakerName(s.name);
                    state.setNewSpeakerName(s.name);
                    state.setIsRenameModalOpen(true);
                }}
                onAddVariant={(s, profiles) => {
                    state.setAddVariantSpeaker({ speaker: s, nextVariantNum: profiles.length + 1 });
                    state.setNewVariantNameModal(`Variant ${profiles.length + 1}`);
                    state.setNewVariantEngine((getVoiceProfileEngine(profiles[0]) || 'xtts') as VoiceEngine);
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
                handleCreateVoice={handleCreateVoice}
                isRenameModalOpen={state.isRenameModalOpen}
                setIsRenameModalOpen={state.setIsRenameModalOpen}
                originalSpeakerName={state.originalSpeakerName}
                newSpeakerName={state.newSpeakerName}
                setNewSpeakerName={state.setNewSpeakerName}
                isRenamingSpeaker={state.isRenamingSpeaker}
                handleRenameSpeaker={handleRenameSpeaker}
                isAddVariantModalOpen={state.isAddVariantModalOpen}
                setIsAddVariantModalOpen={state.setIsAddVariantModalOpen}
                addVariantSpeaker={state.addVariantSpeaker}
                newVariantNameModal={state.newVariantNameModal}
                setNewVariantNameModal={state.setNewVariantNameModal}
                newVariantEngine={state.newVariantEngine}
                setNewVariantEngine={state.setNewVariantEngine}
                isAddingVariantModal={state.isAddingVariantModal}
                handleAddVariant={handleAddVariant}
                isMoveVariantModalOpen={state.isMoveVariantModalOpen}
                setIsMoveVariantModalOpen={state.setIsMoveVariantModalOpen}
                moveVariantProfile={state.moveVariantProfile}
                allVoices={allVoices}
                selectedMoveSpeakerId={state.selectedMoveSpeakerId}
                setSelectedMoveSpeakerId={state.setSelectedMoveSpeakerId}
                isMovingVariant={state.isMovingVariant}
                handleMoveVariant={handleMoveVariant}
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
                handleResetTestText={handleResetTestText}
                handleSaveTestText={handleSaveTestText}
                confirmConfig={state.confirmConfig}
                setConfirmConfig={state.setConfirmConfig}
                exportVoiceName={state.exportVoiceName}
                setExportVoiceName={state.setExportVoiceName}
                includeSourceWavs={state.includeSourceWavs}
                setIncludeSourceWavs={state.setIncludeSourceWavs}
                handleConfirmExportVoice={handleConfirmExportVoice}
                exportVoiceOptions={exportVoiceOptions}
            />
        </div>
    );
};
