import { useState, useEffect, useMemo, useRef } from 'react';
import type { Speaker, SpeakerProfile, VoiceEngine, TtsEngine } from '../types';
import { getVariantDisplayName, isVoiceProfileSelectable } from '../utils/voiceProfiles';


export function useVoicesTabState({ speakerProfiles, engines }: { speakerProfiles: SpeakerProfile[], engines: TtsEngine[] }) {
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

    return {
        confirmConfig, setConfirmConfig,
        activeSpeakerProfiles, disabledSpeakerProfiles,
        editingProfile, setEditingProfile,
        testText, setTestText,
        variantName, setVariantName,
        editingEngine, setEditingEngine,
        referenceSample, setReferenceSample,
        voxtralVoiceId, setVoxtralVoiceId,
        isSavingText, setIsSavingText,
        showGuide, setShowGuide,
        searchQuery, setSearchQuery,
        isCreateModalOpen, setIsCreateModalOpen,
        isAddVariantModalOpen, setIsAddVariantModalOpen,
        isRenameModalOpen, setIsRenameModalOpen,
        renameSpeakerId, setRenameSpeakerId,
        originalSpeakerName, setOriginalSpeakerName,
        newSpeakerName, setNewSpeakerName,
        newVoiceName, setNewVoiceName,
        newVoiceEngine, setNewVoiceEngine,
        addVariantSpeaker, setAddVariantSpeaker,
        newVariantNameModal, setNewVariantNameModal,
        newVariantEngine, setNewVariantEngine,
        isCreatingVoice, setIsCreatingVoice,
        isAddingVariantModal, setIsAddingVariantModal,
        isRenamingSpeaker, setIsRenamingSpeaker,
        expandedVoiceId, setExpandedVoiceId,
        isMoveVariantModalOpen, setIsMoveVariantModalOpen,
        moveVariantProfile, setMoveVariantProfile,
        selectedMoveSpeakerId, setSelectedMoveSpeakerId,
        isMovingVariant, setIsMovingVariant,
        engineFilter, setEngineFilter,
        exportVoiceName, setExportVoiceName,
        includeSourceWavs, setIncludeSourceWavs,
        isImportingVoice, setIsImportingVoice,
        importInputRef,
        handleRequestConfirm
    };
}
