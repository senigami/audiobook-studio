import React, { useState, useEffect } from 'react';
import { 
    Search, Plus, User, Info
} from 'lucide-react';
import type { Speaker, SpeakerProfile, Job, VoiceEngine } from '../types';
import { GlassInput } from './GlassInput';
import { GhostButton } from './GhostButton';
import { NarratorCard } from './voices/NarratorCard';
import { useVoiceManagement } from '../hooks/useVoiceManagement';
import { VoicesModals } from './VoicesModals';
import { getVariantDisplayName, isDefaultVoiceProfile } from '../utils/voiceProfiles';

interface VoicesTabProps {
    onRefresh: () => void | Promise<void>;
    speakerProfiles: SpeakerProfile[];
    testProgress: Record<string, { progress: number; started_at?: number }>;
    jobs?: Record<string, Job>;
}

export const VoicesTab: React.FC<VoicesTabProps> = ({ onRefresh, speakerProfiles, testProgress, jobs = {} }) => {
    const [confirmConfig, setConfirmConfig] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
        isDestructive?: boolean;
        isAlert?: boolean;
    } | null>(null);

    const {
        speakers,
        buildingProfiles,
        fetchSpeakers,
        handleSetDefault,
        handleTest,
        handleBuildNow,
        handleDelete,
        handleUpdateEngine,
        handleUpdateReferenceSample,
        handleUpdateVoxtralVoiceId,
        formatError
    } = useVoiceManagement(onRefresh, speakerProfiles, (config) => setConfirmConfig(config), jobs);

    // --- Component Local State ---
    const [editingProfile, setEditingProfile] = useState<SpeakerProfile | null>(null);
    const [testText, setTestText] = useState('');
    const [variantName, setVariantName] = useState('');
    const [editingEngine, setEditingEngine] = useState<VoiceEngine>('xtts');
    const [referenceSample, setReferenceSample] = useState('');
    const [voxtralVoiceId, setVoxtralVoiceId] = useState('');
    const [isSavingText, setIsSavingText] = useState(false);
    const [showGuide, setShowGuide] = useState(false);

    // Sync state with editing profile
    useEffect(() => {
        if (editingProfile) {
            setTestText(editingProfile.test_text || '');
            setVariantName(getVariantDisplayName(editingProfile));
            setEditingEngine(editingProfile.engine || 'xtts');
            setReferenceSample(editingProfile.reference_sample || '');
            setVoxtralVoiceId(editingProfile.voxtral_voice_id || '');
        } else {
            setTestText('');
            setVariantName('');
            setEditingEngine('xtts');
            setReferenceSample('');
            setVoxtralVoiceId('');
        }
    }, [editingProfile, speakerProfiles]);

    // --- Voice Management Modals State ---
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAddVariantModalOpen, setIsAddVariantModalOpen] = useState(false);
    const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
    const [renameSpeakerId, setRenameSpeakerId] = useState<string | null>(null);
    const [originalSpeakerName, setOriginalSpeakerName] = useState('');
    const [newSpeakerName, setNewSpeakerName] = useState('');
    const [newVoiceName, setNewVoiceName] = useState('');
    const [newVoiceEngine, setNewVoiceEngine] = useState<VoiceEngine>('xtts');
    const [addVariantSpeaker, setAddVariantSpeaker] = useState<{ speaker: Speaker; nextVariantNum: number } | null>(null);
    const [newVariantNameModal, setNewVariantNameModal] = useState('');
    const [newVariantEngine, setNewVariantEngine] = useState<VoiceEngine>('xtts');
    const [isCreatingVoice, setIsCreatingVoice] = useState(false);
    const [isAddingVariantModal, setIsAddingVariantModal] = useState(false);
    const [isRenamingSpeaker, setIsRenamingSpeaker] = useState(false);
    const [expandedVoiceId, setExpandedVoiceId] = useState<string | null>(null);
    const [isMoveVariantModalOpen, setIsMoveVariantModalOpen] = useState(false);
    const [moveVariantProfile, setMoveVariantProfile] = useState<SpeakerProfile | null>(null);
    const [selectedMoveSpeakerId, setSelectedMoveSpeakerId] = useState<string>('');
    const [isMovingVariant, setIsMovingVariant] = useState(false);
    const [engineFilter, setEngineFilter] = useState<'all' | VoiceEngine>('all');

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
                if (editingEngine !== (editingProfile.engine || 'xtts')) {
                    await handleUpdateEngine(editingProfile.name, editingEngine);
                }
                if (editingEngine === 'voxtral') {
                    await handleUpdateReferenceSample(editingProfile.name, referenceSample || null);
                    await handleUpdateVoxtralVoiceId(editingProfile.name, voxtralVoiceId);
                } else {
                    if (editingProfile.reference_sample) {
                        await handleUpdateReferenceSample(editingProfile.name, null);
                    }
                    if (editingProfile.voxtral_voice_id) {
                        await handleUpdateVoxtralVoiceId(editingProfile.name, '');
                    }
                }
                // Also handle name change if different
                const currentVariantDisplay = getVariantDisplayName(editingProfile);
                if (variantName && variantName !== currentVariantDisplay) {
                    if (isDefaultVoiceProfile(editingProfile)) {
                        const variantForm = new URLSearchParams();
                        variantForm.append('variant_name', variantName);
                        await fetch(`/api/speaker-profiles/${encodeURIComponent(editingProfile.name)}/variant-name`, {
                            method: 'POST',
                            body: variantForm
                        });
                    } else {
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
            if (result.status === 'ok' || result.status === 'success') {
                setTestText(result.test_text);
                setEditingProfile(null);
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
        const nameToUse = newVoiceName.trim();
        try {
            const resp = await fetch('/api/speakers', {
                method: 'POST',
                body: new URLSearchParams({ name: nameToUse })
            });
            if (resp.ok) {
                if (newVoiceEngine !== 'xtts') {
                    await handleUpdateEngine(nameToUse, newVoiceEngine);
                }
                const data = await resp.json();
                setIsCreateModalOpen(false);
                setNewVoiceName('');
                setNewVoiceEngine('xtts');
                await fetchSpeakers();
                if (data.id) setExpandedVoiceId(data.id);
            }
        } finally {
            setIsCreatingVoice(false);
        }
    };

    const handleRenameSpeaker = async () => {
        if (!renameSpeakerId && !originalSpeakerName) return;
        setIsRenamingSpeaker(true);
        try {
            const formData = new URLSearchParams();
            formData.append('id', renameSpeakerId || '');
            formData.append('new_name', newSpeakerName.trim());
            const url = renameSpeakerId 
                ? `/api/speakers/${renameSpeakerId}` 
                : `/api/speaker-profiles/${encodeURIComponent(originalSpeakerName)}/rename`;
            
            const resp = await fetch(url, {
                method: 'POST', // Backend rename profile is POST
                body: formData
            });
            if (resp.ok) {
                const renamedTo = newSpeakerName.trim();
                setIsRenameModalOpen(false);
                if (!renameSpeakerId) {
                    setExpandedVoiceId(prev => prev === `unassigned-${originalSpeakerName}` ? `unassigned-${renamedTo}` : prev);
                }
                await Promise.all([Promise.resolve(onRefresh()), fetchSpeakers()]);
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
        if (!addVariantSpeaker || (!addVariantSpeaker.speaker.id && !addVariantSpeaker.speaker.name)) return;
        const vName = newVariantNameModal.trim();
        if (!vName) {
            handleRequestConfirm({
                title: 'Invalid Name',
                message: 'Please enter a name for the variant.',
                onConfirm: () => {},
                isAlert: true
            });
            return;
        }
        setIsAddingVariantModal(true);
        try {
            const formData = new URLSearchParams();
            const sid = addVariantSpeaker.speaker.id || addVariantSpeaker.speaker.name;
            formData.append('speaker_id', sid);
            formData.append('variant_name', vName);
            formData.append('engine', newVariantEngine);
            const resp = await fetch('/api/speaker-profiles', {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                setIsAddVariantModalOpen(false);
                setAddVariantSpeaker(null);
                setNewVariantNameModal('');
                setNewVariantEngine('xtts');
                const expandedId = (sid.includes('-') && sid.length === 36) ? sid : `unassigned-${sid}`;
                setExpandedVoiceId(expandedId);
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
    const voices = (speakers || []).map(speaker => {
        const pList = speakerProfiles.filter(p => p.speaker_id === speaker.id);
        if (pList.length === 0) {
            pList.push({
                name: speaker.name,
                speaker_id: speaker.id,
                variant_name: 'Default',
                wav_count: 0,
                speed: 1.0,
                is_default: false,
                preview_url: null,
                wav_files: [],
                engine: 'xtts'
            } as SpeakerProfile);
        }
        return {
            id: speaker.id,
            name: speaker.name,
            profiles: pList
        };
    });

    const unassigned = speakerProfiles.filter(p => !p.speaker_id || !speakers.some(s => s.id === p.speaker_id));
    const unassignedGroups: Record<string, SpeakerProfile[]> = {};
    unassigned.forEach(p => {
        // Use speaker_id as grouping key if it looks like a name (not a UUID)
        let groupKey = p.speaker_id;
        if (!groupKey || (groupKey.length === 36 && groupKey.includes('-'))) {
            // Fallback: use base name before first underscore
            groupKey = p.name.split('_')[0];
        }
        if (!unassignedGroups[groupKey]) unassignedGroups[groupKey] = [];
        unassignedGroups[groupKey].push(p);
    });

    const unassignedVoices = Object.entries(unassignedGroups).map(([groupKey, profiles]) => ({
        id: `unassigned-${groupKey}`,
        name: groupKey,
        profiles: profiles,
        isUnassigned: true
    }));

    const allVoices = [...voices, ...unassignedVoices];

    const filteredVoices = allVoices.filter(v => {
        const query = searchQuery.toLowerCase();
        const matchesSearch = v.name.toLowerCase().includes(query) || 
               v.profiles.some(p => getVariantDisplayName(p).toLowerCase().includes(query));
        const matchesEngine = engineFilter === 'all' || v.profiles.some(p => (p.engine || 'xtts') === engineFilter);
        return matchesSearch && matchesEngine;
    }).sort((a, b) => a.name.localeCompare(b.name));

    const engineCounts = speakerProfiles.reduce((acc, profile) => {
        const engine = profile.engine || 'xtts';
        acc[engine] = (acc[engine] || 0) + 1;
        return acc;
    }, { xtts: 0, voxtral: 0 } as Record<VoiceEngine, number>);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            {/* STYLES REVERTED TO MASTER DESIGN */}
            <div style={{ 
                padding: '1.25rem 2rem', 
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--surface-light)',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Voices</h2>
                    
                    <div style={{ position: 'relative' }}>
                        <GlassInput
                            icon={<Search size={16} />}
                            placeholder="Search voices..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="search-responsive"
                            style={{
                                width: '240px',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                            onFocus={(e) => {
                                e.currentTarget.style.width = '320px';
                            }}
                            onBlur={(e) => {
                                e.currentTarget.style.width = '240px';
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {([
                            { key: 'all', label: `All (${speakerProfiles.length})` },
                            { key: 'xtts', label: `XTTS (${engineCounts.xtts})` },
                            { key: 'voxtral', label: `Voxtral (${engineCounts.voxtral})` },
                        ] as const).map((option) => {
                            const active = engineFilter === option.key;
                            return (
                                <button
                                    key={option.key}
                                    onClick={() => setEngineFilter(option.key)}
                                    className={active ? 'btn-primary' : 'btn-glass'}
                                    style={{ height: '34px', borderRadius: '999px', padding: '0 12px', fontSize: '0.75rem', fontWeight: 800 }}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <GhostButton 
                        onClick={() => setIsCreateModalOpen(true)} 
                        icon={Plus}
                        label="New Voice"
                    />
                    
                    <div className="mobile-hide" style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />
                    
                    <GhostButton 
                        onClick={() => setShowGuide(true)} 
                        icon={Info}
                        label="Recording Guide"
                    />
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {allVoices.length === 0 ? (
                        <div style={{ 
                            padding: '60px', 
                            textAlign: 'center', 
                            background: 'rgba(var(--accent-rgb), 0.02)', 
                            borderRadius: '24px', 
                            border: '2px dashed var(--border)' 
                        }}>
                            <div style={{ 
                                width: '64px', 
                                height: '64px', 
                                borderRadius: '20px', 
                                background: 'var(--surface-alt)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                margin: '0 auto 20px',
                                color: 'var(--text-muted)'
                            }}>
                                <User size={32} />
                            </div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>No Voices Yet</h3>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '300px', margin: '0 auto 24px' }}>
                                Create your first voice to start generating premium AI audio.
                            </p>
                            <button 
                                onClick={() => setIsCreateModalOpen(true)}
                                className="btn-primary" 
                                style={{ gap: '8px', padding: '0 24px', height: '44px', borderRadius: '12px' }}
                            >
                                <Plus size={20} />
                                Create New Voice
                            </button>
                        </div>
                    ) : filteredVoices.length === 0 ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Search size={48} style={{ opacity: 0.2, marginBottom: '20px' }} />
                            <h3 style={{ margin: '0 0 10px', fontSize: '1.25rem' }}>No Matches Found</h3>
                            <p style={{ margin: 0 }}>Try adjusting your search query.</p>
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
                                    onEditTestText={setEditingProfile}
                                    onBuildNow={handleBuildNow}
                                    testProgress={testProgress}
                                    requestConfirm={handleRequestConfirm}
                                    buildingProfiles={buildingProfiles}
                                    onAddVariantClick={(s, count) => {
                                        setAddVariantSpeaker({ speaker: s, nextVariantNum: count + 1 });
                                        setNewVariantNameModal(`Variant ${count + 1}`);
                                        setNewVariantEngine((voice.profiles[0]?.engine || 'xtts') as VoiceEngine);
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
                newVoiceEngine={newVoiceEngine}
                setNewVoiceEngine={setNewVoiceEngine}
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
                newVariantEngine={newVariantEngine}
                setNewVariantEngine={setNewVariantEngine}
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
                editingEngine={editingEngine}
                setEditingEngine={setEditingEngine}
                testText={testText}
                setTestText={setTestText}
                referenceSample={referenceSample}
                setReferenceSample={setReferenceSample}
                voxtralVoiceId={voxtralVoiceId}
                setVoxtralVoiceId={setVoxtralVoiceId}
                isSavingText={isSavingText}
                handleResetTestText={handleResetTestText}
                handleSaveTestText={handleSaveTestText}
                confirmConfig={confirmConfig}
                setConfirmConfig={setConfirmConfig}
            />
        </div>
    );
};
