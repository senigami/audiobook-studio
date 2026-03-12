import React, { useState, useEffect } from 'react';
import { 
    Search, Plus, User, Info
} from 'lucide-react';
import type { Speaker, SpeakerProfile } from '../types';
import { GlassInput } from './GlassInput';
import { GhostButton } from './GhostButton';
import { NarratorCard } from './voices/NarratorCard';
import { useVoiceManagement } from '../hooks/useVoiceManagement';






interface VoicesTabProps {
    onRefresh: () => void;
    speakerProfiles: SpeakerProfile[];
    testProgress: Record<string, { progress: number; started_at?: number }>;
}

import { VoicesModals } from './VoicesModals';

export const VoicesTab: React.FC<VoicesTabProps> = ({ onRefresh, speakerProfiles, testProgress }) => {
    const {
        speakers,
        testingProfile,
        buildingProfiles,
        fetchSpeakers,
        handleSetDefault,
        handleTest,
        handleBuildNow,
        handleDelete,
        formatError
    } = useVoiceManagement(onRefresh, speakerProfiles, (config) => setConfirmConfig(config));

    // --- Component Local State ---
    const [editingProfile, setEditingProfile] = useState<SpeakerProfile | null>(null);
    const [testText, setTestText] = useState('');
    const [variantName, setVariantName] = useState('');
    const [isSavingText, setIsSavingText] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
        isDestructive?: boolean;
        isAlert?: boolean;
    } | null>(null);

    // Sync state with editing profile
    useEffect(() => {
        if (editingProfile) {
            setTestText(editingProfile.test_text || '');
            setVariantName(editingProfile.variant_name || editingProfile.name);
        } else {
            setTestText('');
            setVariantName('');
        }
    }, [editingProfile]);

    // --- Voice Management Modals State ---
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAddVariantModalOpen, setIsAddVariantModalOpen] = useState(false);
    const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
    const [renameSpeakerId, setRenameSpeakerId] = useState<string | null>(null);
    const [originalSpeakerName, setOriginalSpeakerName] = useState('');
    const [addVariantSpeaker, setAddVariantSpeaker] = useState<{ speaker: Speaker, nextVariantNum: number } | null>(null);
    const [newVoiceName, setNewVoiceName] = useState('');
    const [newSpeakerName, setNewSpeakerName] = useState('');
    const [newVariantNameModal, setNewVariantNameModal] = useState('');
    const [isCreatingVoice, setIsCreatingVoice] = useState(false);
    const [isAddingVariantModal, setIsAddingVariantModal] = useState(false);
    const [isRenamingSpeaker, setIsRenamingSpeaker] = useState(false);
    const [expandedVoiceId, setExpandedVoiceId] = useState<string | null>(null);
    const [isMoveVariantModalOpen, setIsMoveVariantModalOpen] = useState(false);
    const [moveVariantProfile, setMoveVariantProfile] = useState<SpeakerProfile | null>(null);
    const [selectedMoveSpeakerId, setSelectedMoveSpeakerId] = useState<string>('');
    const [isMovingVariant, setIsMovingVariant] = useState(false);

    const handleRequestConfirm = (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean; isAlert?: boolean }) => {
        setConfirmConfig(config);
    };

    const handleSaveTestText = async () => {
        if (!editingProfile) return;
        setIsSavingText(true);
        try {
            const formData = new URLSearchParams();
            formData.append('text', testText);
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(editingProfile.name)}/test-text`, {
                method: 'POST',
                body: formData
            });

            if (resp.ok) {
                // Also handle name change if different
                const currentVariantDisplay = editingProfile.variant_name || editingProfile.name;
                if (variantName && variantName !== currentVariantDisplay) {
                    let newFullName = variantName;
                    if (editingProfile.speaker_id) {
                        const speaker = speakers.find((s: Speaker) => s.id === editingProfile.speaker_id);
                        if (speaker) {
                            newFullName = (variantName === 'Default' || variantName === speaker.name) ? speaker.name : `${speaker.name} - ${variantName}`;
                        }
                    }

                    const renameForm = new URLSearchParams();
                    renameForm.append('new_name', newFullName);
                    await fetch(`/api/speaker-profiles/${encodeURIComponent(editingProfile.name)}/rename`, {
                        method: 'POST',
                        body: renameForm
                    });
                }
                setEditingProfile(null);
                onRefresh();
            }
        } catch (e) {
            console.error('Failed to save profile', e);
        } finally {
            setIsSavingText(false);
        }
    };

    const handleResetTestText = async () => {
        if (!editingProfile) return;
        setIsSavingText(true);
        try {
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(editingProfile.name)}/reset-test-text`, {
                method: 'POST'
            });
            const result = await resp.json();
            if (result.status === 'ok') {
                setTestText(result.test_text);
                onRefresh();
            }
        } catch (e) {
            console.error('Failed to reset script', e);
        } finally {
            setIsSavingText(false);
        }
    };

    const handleCreateVoice = async () => {
        setIsCreatingVoice(true);
        try {
            const resp = await fetch('/api/speakers', {
                method: 'POST',
                body: new URLSearchParams({ name: newVoiceName.trim() })
            });
            if (resp.ok) {
                const data = await resp.json();
                setIsCreateModalOpen(false);
                setNewVoiceName('');
                await fetchSpeakers();
                if (data.id) setExpandedVoiceId(data.id);
            }
        } finally {
            setIsCreatingVoice(false);
        }
    };

    const handleRenameSpeaker = async () => {
        if (!renameSpeakerId) return;
        setIsRenamingSpeaker(true);
        try {
            const formData = new URLSearchParams();
            formData.append('id', renameSpeakerId);
            formData.append('name', newSpeakerName.trim());
            const resp = await fetch('/api/speakers', {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                setIsRenameModalOpen(false);
                fetchSpeakers();
            } else {
                const err = await resp.json();
                handleRequestConfirm({
                    title: 'Rename Failed',
                    message: formatError(err, 'An unknown error occurred while renaming the voice.'),
                    onConfirm: () => {},
                    isAlert: true
                });
            }
        } finally {
            setIsRenamingSpeaker(false);
        }
    };

    const handleAddVariant = async () => {
        if (!addVariantSpeaker) return;
        setIsAddingVariantModal(true);
        try {
            const formData = new URLSearchParams();
            formData.append('speaker_id', addVariantSpeaker.speaker.id);
            formData.append('variant_name', newVariantNameModal.trim());
            const resp = await fetch('/api/speaker-profiles', {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                setIsAddVariantModalOpen(false);
                setAddVariantSpeaker(null);
                setNewVariantNameModal('');
                onRefresh();
            } else {
                const err = await resp.json();
                handleRequestConfirm({
                    title: 'Add Variant Failed',
                    message: formatError(err, 'An unknown error occurred while adding the variant.'),
                    onConfirm: () => {},
                    isAlert: true
                });
            }
        } finally {
            setIsAddingVariantModal(false);
        }
    };

    const handleMoveVariant = async () => {
        setIsMovingVariant(true);
        try {
            let targetSpeakerId = selectedMoveSpeakerId;
            if (selectedMoveSpeakerId.startsWith('unassigned-')) {
                const targetProfileName = selectedMoveSpeakerId.replace('unassigned-', '');
                const targetVoiceEntry = allVoices.find(v => v.id === selectedMoveSpeakerId);
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
                    await fetch(`/api/speaker-profiles/${encodeURIComponent(targetProfileName)}/assign`, {
                        method: 'POST',
                        body: assignForm
                    });
                }
            }
            const formData = new URLSearchParams();
            formData.append('speaker_id', targetSpeakerId);
            if (moveVariantProfile) formData.append('variant_name', moveVariantProfile.variant_name || 'Default');
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(moveVariantProfile?.name || '')}/assign`, {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                setIsMoveVariantModalOpen(false);
                setMoveVariantProfile(null);
                onRefresh();
                fetchSpeakers();
            } else {
                const err = await resp.json();
                handleRequestConfirm({
                    title: 'Move Failed',
                    message: formatError(err, 'An unknown error occurred.'),
                    onConfirm: () => {},
                    isAlert: true
                });
            }
        } catch (err: any) {
            handleRequestConfirm({
                title: 'Move Failed',
                message: err.message || 'An error occurred.',
                onConfirm: () => {},
                isAlert: true
            });
        } finally {
            setIsMovingVariant(false);
        }
    };


    // --- Data Processing ---
    // Merge speakers and profiles into a unified Voice concept
    const allVoices = [
        ...speakers.map(s => ({
            id: s.id,
            name: s.name,
            profiles: speakerProfiles.filter(p => p.speaker_id === s.id)
        })),
        ...speakerProfiles
            .filter(p => !p.speaker_id)
            .map(p => ({
                id: `unassigned-${p.name}`,
                name: p.name,
                profiles: [p]
            }))
    ].sort((a, b) => a.name.localeCompare(b.name));

    const filteredVoices = allVoices.filter(v =>
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.profiles.some(p => (p.variant_name || p.name).toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="flex flex-col h-full bg-surface-dark overflow-hidden relative">
            <div className="flex-shrink-0 p-8 pt-6 pb-2">
                <div className="flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                <User className="text-accent" size={24} />
                                AI Voice Lab
                            </h2>
                            <p className="text-sm text-text-muted mt-1">Manage and train custom voice profiles</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <GhostButton icon={Info} onClick={() => setShowGuide(true)} label="Guide" />
                            <button
                                onClick={() => setIsCreateModalOpen(true)}
                                className="px-5 h-11 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-accent/20 active:scale-95 border border-white/10"
                            >
                                <Plus size={20} />
                                New Voice
                            </button>
                        </div>
                    </div>

                    <div className="relative group max-w-xl">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none transition-colors group-focus-within:text-accent text-text-muted">
                            <Search size={18} />
                        </div>
                        <GlassInput
                            placeholder="Search voices or variants..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-12 h-12 text-base bg-surface-light/50"
                        />
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar pt-4">
                <div className="grid grid-cols-1 gap-6 max-w-5xl">
                    {filteredVoices.length === 0 ? (
                        <div className="glass-panel p-16 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 rounded-2xl bg-surface-light border border-border-light flex items-center justify-center mb-4 text-text-muted">
                                <User size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-white">No voices found</h3>
                            <p className="text-text-muted max-w-xs mt-2">
                                {searchQuery ? `No results for "${searchQuery}"` : "Create your first custom voice to start building your library."}
                            </p>
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="mt-6 text-accent font-bold hover:underline"
                                >
                                    Clear search
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {filteredVoices.map(voice => (
                                <NarratorCard
                                    key={voice.id}
                                    speaker={{ id: voice.id.startsWith('unassigned-') ? '' : voice.id, name: voice.name, default_profile_name: voice.profiles[0]?.name || null, created_at: 0, updated_at: 0 }}
                                    profiles={voice.profiles}
                                    onRefresh={onRefresh}
                                    onTest={handleTest}
                                    onDelete={handleDelete}
                                    onMoveVariant={(p) => {
                                        setMoveVariantProfile(p);
                                        setSelectedMoveSpeakerId('');
                                        setIsMoveVariantModalOpen(true);
                                    }}
                                    onEditTestText={(p) => setEditingProfile(p)}
                                    onBuildNow={handleBuildNow}
                                    isTestingProfileId={testingProfile}
                                    testProgress={testProgress}
                                    requestConfirm={handleRequestConfirm}
                                    buildingProfiles={buildingProfiles}
                                    onAddVariantClick={(s, count) => {
                                        setAddVariantSpeaker({ speaker: s, nextVariantNum: count + 1 });
                                        setNewVariantNameModal(`Variant ${count + 1}`);
                                        setIsAddVariantModalOpen(true);
                                    }}
                                    onSetDefaultClick={handleSetDefault}
                                    onRenameClick={(s) => {
                                        setRenameSpeakerId(s.id);
                                        setOriginalSpeakerName(s.name);
                                        setNewSpeakerName(s.name);
                                        setIsRenameModalOpen(true);
                                    }}
                                    isExpanded={expandedVoiceId === voice.id}
                                    onToggleExpand={() => setExpandedVoiceId(expandedVoiceId === voice.id ? null : voice.id)}
                                />
                            ))}
                        </>
                    )}
                </div>
            </div>

            <VoicesModals
                isCreateModalOpen={isCreateModalOpen}
                setIsCreateModalOpen={setIsCreateModalOpen}
                newVoiceName={newVoiceName}
                setNewVoiceName={setNewVoiceName}
                isCreatingVoice={isCreatingVoice}
                handleCreateVoice={handleCreateVoice}
                isRenameModalOpen={isRenameModalOpen}
                setIsRenameModalOpen={setIsRenameModalOpen}
                originalSpeakerName={originalSpeakerName}
                newSpeakerName={newSpeakerName}
                setNewSpeakerName={setNewSpeakerName}
                isRenamingSpeaker={isRenamingSpeaker}
                handleRenameSpeaker={handleRenameSpeaker}
                isAddVariantModalOpen={isAddVariantModalOpen}
                setIsAddVariantModalOpen={setIsAddVariantModalOpen}
                addVariantSpeaker={addVariantSpeaker}
                newVariantNameModal={newVariantNameModal}
                setNewVariantNameModal={setNewVariantNameModal}
                isAddingVariantModal={isAddingVariantModal}
                handleAddVariant={handleAddVariant}
                isMoveVariantModalOpen={isMoveVariantModalOpen}
                setIsMoveVariantModalOpen={setIsMoveVariantModalOpen}
                moveVariantProfile={moveVariantProfile}
                allVoices={allVoices}
                selectedMoveSpeakerId={selectedMoveSpeakerId}
                setSelectedMoveSpeakerId={setSelectedMoveSpeakerId}
                isMovingVariant={isMovingVariant}
                handleMoveVariant={handleMoveVariant}
                showGuide={showGuide}
                setShowGuide={setShowGuide}
                editingProfile={editingProfile}
                setEditingProfile={setEditingProfile}
                variantName={variantName}
                setVariantName={setVariantName}
                testText={testText}
                setTestText={setTestText}
                isSavingText={isSavingText}
                handleResetTestText={handleResetTestText}
                handleSaveTestText={handleSaveTestText}
                confirmConfig={confirmConfig}
                setConfirmConfig={setConfirmConfig}
            />
        </div>
    );
};
