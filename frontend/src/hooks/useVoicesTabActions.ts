import { type Speaker, type TtsEngine } from '../types';
import { getVariantDisplayName, isDefaultVoiceProfile } from '../utils/voiceProfiles';
import { api } from '../api';

interface UseVoicesTabActionsProps {
    state: any; // Result from useVoicesTabState
    management: any; // Result from useVoiceManagement
    onRefresh: () => void | Promise<void>;
    engines: TtsEngine[];
    allVoices: any[];
}

export function useVoicesTabActions({
    state,
    management,
    onRefresh,
    engines,
    allVoices
}: UseVoicesTabActionsProps) {
    const {
        fetchSpeakers,
        handleUpdateEngine,
        handleUpdateSettings,
        formatError
    } = management;

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
                            const speaker = management.speakers.find((s: Speaker) => s.id === state.editingProfile?.speaker_id);
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
                    state.setExpandedVoiceId((prev: string | null) => prev === `unassigned-${state.originalSpeakerName}` ? `unassigned-${renamedTo}` : prev);
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

    return {
        handleSaveTestText,
        handleResetTestText,
        handleCreateVoice,
        handleRenameSpeaker,
        handleAddVariant,
        handleMoveVariant,
        handleConfirmExportVoice,
        handleImportVoiceBundle
    };
}
