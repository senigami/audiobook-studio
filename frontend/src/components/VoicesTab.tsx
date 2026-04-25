import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Search, Plus, User, Info, Upload, Download
} from 'lucide-react';
import type { Speaker, SpeakerProfile, Job, VoiceEngine, Settings, TtsEngine } from '../types';
import { GlassInput } from './GlassInput';
import { GhostButton } from './GhostButton';
import { NarratorCard } from './voices/NarratorCard';
import { useVoiceManagement } from '../hooks/useVoiceManagement';
import { VoicesModals } from './VoicesModals';
import { formatVoiceEngineLabel, getVariantDisplayName, getVoiceProfileEngine, isDefaultVoiceProfile, isVoiceProfileSelectable } from '../utils/voiceProfiles';
import { api } from '../api';

interface VoicesTabProps {
    onRefresh: () => void | Promise<void>;
    speakerProfiles: SpeakerProfile[];
    testProgress: Record<string, { progress: number; started_at?: number }>;
    jobs?: Record<string, Job>;
    settings?: Settings;
    engines?: TtsEngine[];
}

export const VoicesTab: React.FC<VoicesTabProps> = ({ onRefresh, speakerProfiles, testProgress, jobs = {}, engines = [] }) => {
    const [confirmConfig, setConfirmConfig] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
        isDestructive?: boolean;
        isAlert?: boolean;
    } | null>(null);

    const activeSpeakerProfiles = useMemo(
        () => speakerProfiles.filter(profile => isVoiceProfileSelectable(profile, engines)),
        [speakerProfiles, engines]
    );
    const disabledSpeakerProfiles = useMemo(
        () => speakerProfiles.filter(profile => !isVoiceProfileSelectable(profile, engines)),
        [speakerProfiles, engines]
    );

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
    } = useVoiceManagement(onRefresh, activeSpeakerProfiles, (config) => setConfirmConfig(config), jobs);

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
            setEditingEngine(editingProfile.engine || '');
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
    const [engineFilter, setEngineFilter] = useState<'all' | 'disabled' | VoiceEngine>('all');
    const [exportVoiceName, setExportVoiceName] = useState<string | null>(null);
    const [includeSourceWavs, setIncludeSourceWavs] = useState(false);
    const [isImportingVoice, setIsImportingVoice] = useState(false);
    const importInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const isEngineActive = (eid: string) => {
            const engine = engines.find(e => e.engine_id === eid);
            return Boolean(engine?.enabled && engine.status === 'ready');
        };

        if (!isEngineActive(newVoiceEngine)) setNewVoiceEngine('xtts');
        if (!isEngineActive(newVariantEngine)) setNewVariantEngine('xtts');
        if (engineFilter === 'disabled') {
            if (disabledSpeakerProfiles.length === 0) setEngineFilter('all');
            return;
        }
        if (engineFilter !== 'all' && !isEngineActive(engineFilter)) setEngineFilter('all');
    }, [engines, newVoiceEngine, newVariantEngine, engineFilter, disabledSpeakerProfiles.length]);

    const handleRequestConfirm = (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean; isAlert?: boolean }) => {
        setConfirmConfig(config);
    };

    const handleSaveTestText = async () => {
        if (!editingProfile) return;
        setIsSavingText(true);
        try {
            const settingsToUpdate: Record<string, any> = {
                test_text: testText,
                engine: editingEngine
            };

            const activeEngine = engines.find(e => e.engine_id === editingEngine);
            if (activeEngine?.cloud) {
                settingsToUpdate.reference_sample = referenceSample || null;
                settingsToUpdate.voxtral_voice_id = voxtralVoiceId;
            }

            const success = await handleUpdateSettings(editingProfile.name, settingsToUpdate);

            if (success) {
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

    const handleConfirmExportVoice = () => {
        if (!exportVoiceName) return;
        const url = api.exportVoiceBundleUrl(exportVoiceName, includeSourceWavs);
        window.open(url, '_blank');
        setExportVoiceName(null);
        setIncludeSourceWavs(false);
    };

    const handleImportVoiceBundle = async (file: File | null) => {
        if (!file) return;
        setIsImportingVoice(true);
        try {
            const result = await api.importVoiceBundle(file);
            await Promise.all([Promise.resolve(onRefresh()), fetchSpeakers()]);
            handleRequestConfirm({
                title: 'Voice Imported',
                message: result.was_renamed
                    ? `Imported "${result.original_voice_name}" as "${result.voice_name}".`
                    : `Imported "${result.voice_name}".`,
                onConfirm: () => {},
                isAlert: true
            });
        } catch (err: any) {
            handleRequestConfirm({
                title: 'Import Failed',
                message: err?.message || 'The selected voice bundle could not be imported.',
                onConfirm: () => {},
                isAlert: true
            });
        } finally {
            setIsImportingVoice(false);
            if (importInputRef.current) importInputRef.current.value = '';
        }
    };

    // --- Data Processing ---
    const buildVoiceGroups = (profiles: SpeakerProfile[]) => {
        const groupedVoices = (speakers || []).map(speaker => {
            const pList = profiles.filter(p => p.speaker_id === speaker.id);
            if (pList.length === 0) {
                return null;
            }
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

    const activeVoices = buildVoiceGroups(activeSpeakerProfiles);
    const disabledVoices = buildVoiceGroups(disabledSpeakerProfiles);
    const allVoices = activeVoices;
    const exportVoiceOptions = activeVoices
        .filter(voice => !(voice as any).isUnassigned)
        .map(voice => ({
            value: voice.name,
            label: voice.name
        }))
        .filter((option, index, self) => self.findIndex(candidate => candidate.value === option.value) === index);
    if (exportVoiceName && !exportVoiceOptions.some(option => option.value === exportVoiceName)) {
        exportVoiceOptions.unshift({
            value: exportVoiceName,
            label: exportVoiceName
        });
    }
    const voices = engineFilter === 'disabled' ? disabledVoices : activeVoices;

    const filteredVoices = voices.filter(v => {
        const query = searchQuery.toLowerCase();
        const matchesSearch = v.name.toLowerCase().includes(query) || 
               v.profiles.some(p => getVariantDisplayName(p).toLowerCase().includes(query));
        const matchesEngine = engineFilter === 'all' || engineFilter === 'disabled' || v.profiles.some(p => getVoiceProfileEngine(p) === engineFilter);
        return matchesSearch && matchesEngine;
    }).sort((a, b) => a.name.localeCompare(b.name));

    const engineCounts = activeSpeakerProfiles.reduce((acc, profile) => {
        const engine = getVoiceProfileEngine(profile) || 'unknown';
        acc[engine] = (acc[engine] || 0) + 1;
        return acc;
    }, { xtts: 0 } as Record<string, number>);

    const disabledCount = disabledSpeakerProfiles.length;

    const engineFilterOptions: Array<{ key: 'all' | 'disabled' | VoiceEngine; label: string }> = [
        { key: 'all', label: `All (${activeSpeakerProfiles.length})` },
        ...(engineCounts.xtts > 0 ? [{ key: 'xtts' as const, label: `XTTS (${engineCounts.xtts})` }] : []),
        ...engines.filter(e => e.engine_id !== 'xtts' && e.enabled && e.status === 'ready').map(e => ({
            key: e.engine_id as VoiceEngine,
            label: `${e.display_name || formatVoiceEngineLabel(e.engine_id)} (${engineCounts[e.engine_id as VoiceEngine] || 0})`
        })),
        ...(disabledCount > 0 ? [{ key: 'disabled' as const, label: `Disabled (${disabledCount})` }] : [])
    ];

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
                        {engineFilterOptions.map((option) => {
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
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".zip,application/zip"
                        aria-label="Import voice bundle file"
                        style={{ display: 'none' }}
                        onChange={(event) => void handleImportVoiceBundle(event.target.files?.[0] || null)}
                    />
                    <GhostButton
                        onClick={() => {
                            if (exportVoiceOptions.length === 0) return;
                            setExportVoiceName(exportVoiceOptions[0].value);
                            setIncludeSourceWavs(false);
                        }}
                        icon={Download}
                        label="Export Voice"
                        disabled={exportVoiceOptions.length === 0}
                    />
                    <GhostButton
                        onClick={() => importInputRef.current?.click()}
                        icon={Upload}
                        label={isImportingVoice ? 'Importing...' : 'Import Voice'}
                        disabled={isImportingVoice}
                    />

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
                    {voices.length === 0 ? (
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
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>
                                {engineFilter === 'disabled' ? 'No Disabled Voices' : 'No Voices Yet'}
                            </h3>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '320px', margin: '0 auto 24px' }}>
                                {engineFilter === 'disabled'
                                    ? 'Every voice is currently active. Disable an engine in Settings to see its voices here.'
                                    : 'Create your first voice to start generating premium AI audio.'}
                            </p>
                            {engineFilter !== 'disabled' && (
                                <button 
                                    onClick={() => setIsCreateModalOpen(true)}
                                    className="btn-primary" 
                                    style={{ gap: '8px', padding: '0 24px', height: '44px', borderRadius: '12px' }}
                                >
                                    <Plus size={20} />
                                    Create New Voice
                                </button>
                            )}
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
                                        setNewVariantEngine((getVoiceProfileEngine(voice.profiles[0]) || 'xtts') as VoiceEngine);
                                        setIsAddVariantModalOpen(true);
                                    }}
                                    onSetDefaultClick={handleSetDefault}
                                    onRenameClick={(s) => {
                                        setRenameSpeakerId(s.id);
                                        setOriginalSpeakerName(s.name);
                                        setNewSpeakerName(s.name);
                                        setIsRenameModalOpen(true);
                                    }}
                                    onExportVoice={(voiceName) => {
                                        setExportVoiceName(voiceName);
                                        setIncludeSourceWavs(false);
                                    }}
                                    isExpanded={expandedVoiceId === voice.id}
                                    onToggleExpand={() => setExpandedVoiceId(expandedVoiceId === voice.id ? null : voice.id)}
                                    engines={engines}
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
                engines={engines}
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
                exportVoiceName={exportVoiceName}
                setExportVoiceName={setExportVoiceName}
                includeSourceWavs={includeSourceWavs}
                setIncludeSourceWavs={setIncludeSourceWavs}
                handleConfirmExportVoice={handleConfirmExportVoice}
                exportVoiceOptions={exportVoiceOptions}
            />
        </div>
    );
};
