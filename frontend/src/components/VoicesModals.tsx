import React from 'react';
import type { Speaker, SpeakerProfile, VoiceEngine, TtsEngine } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { RecordingGuide } from './RecordingGuide';
import {
    NewVoiceModal,
    RenameVoiceModal,
    AddVariantModal,
    MoveVariantModal,
    Drawer,
    ScriptEditor
} from './voices';
import { getVariantDisplayName } from '../utils/voiceProfiles';

interface VoicesModalsProps {
    // New Voice Modal
    isCreateModalOpen: boolean;
    setIsCreateModalOpen: (open: boolean) => void;
    newVoiceName: string;
    setNewVoiceName: (name: string) => void;
    newVoiceEngine: VoiceEngine;
    setNewVoiceEngine: (engine: VoiceEngine) => void;
    engines: TtsEngine[];
    isCreatingVoice: boolean;
    handleCreateVoice: () => void;

    // Rename Modal
    isRenameModalOpen: boolean;
    setIsRenameModalOpen: (open: boolean) => void;
    originalSpeakerName: string;
    newSpeakerName: string;
    setNewSpeakerName: (name: string) => void;
    isRenamingSpeaker: boolean;
    handleRenameSpeaker: () => void;

    // Add Variant Modal
    isAddVariantModalOpen: boolean;
    setIsAddVariantModalOpen: (open: boolean) => void;
    addVariantSpeaker: { speaker: Speaker } | null;
    newVariantNameModal: string;
    setNewVariantNameModal: (name: string) => void;
    newVariantEngine: VoiceEngine;
    setNewVariantEngine: (engine: VoiceEngine) => void;
    isAddingVariantModal: boolean;
    handleAddVariant: () => void;

    // Move Variant Modal
    isMoveVariantModalOpen: boolean;
    setIsMoveVariantModalOpen: (open: boolean) => void;
    moveVariantProfile: SpeakerProfile | null;
    allVoices: any[];
    selectedMoveSpeakerId: string;
    setSelectedMoveSpeakerId: (id: string) => void;
    isMovingVariant: boolean;
    handleMoveVariant: () => void;

    // Guide Drawer
    showGuide: boolean;
    setShowGuide: (show: boolean) => void;

    // Script Editor Drawer
    editingProfile: SpeakerProfile | null;
    setEditingProfile: (profile: SpeakerProfile | null) => void;
    variantName: string;
    setVariantName: (name: string) => void;
    editingEngine: VoiceEngine;
    setEditingEngine: (engine: VoiceEngine) => void;
    testText: string;
    setTestText: (text: string) => void;
    referenceSample: string;
    setReferenceSample: (sample: string) => void;
    voxtralVoiceId: string;
    setVoxtralVoiceId: (voiceId: string) => void;
    isSavingText: boolean;
    handleResetTestText: () => void;
    handleSaveTestText: () => void;

    // Global Confirm
    confirmConfig: any;
    setConfirmConfig: (config: any) => void;

    // Voice Bundle Export
    exportVoiceName: string | null;
    setExportVoiceName: (name: string | null) => void;
    includeSourceWavs: boolean;
    setIncludeSourceWavs: (include: boolean) => void;
    handleConfirmExportVoice: () => void;
    exportVoiceOptions: Array<{ value: string; label: string }>;
}

export const VoicesModals: React.FC<VoicesModalsProps> = (props) => {
    return (
        <>
            <NewVoiceModal
                isOpen={props.isCreateModalOpen}
                onClose={() => props.setIsCreateModalOpen(false)}
                value={props.newVoiceName}
                onChange={props.setNewVoiceName}
                engine={props.newVoiceEngine}
                onEngineChange={props.setNewVoiceEngine}
                engines={props.engines}
                onSubmit={props.handleCreateVoice}
                isCreating={props.isCreatingVoice}
            />

            <RenameVoiceModal
                isOpen={props.isRenameModalOpen}
                onClose={() => props.setIsRenameModalOpen(false)}
                originalName={props.originalSpeakerName}
                value={props.newSpeakerName}
                onChange={props.setNewSpeakerName}
                isRenaming={props.isRenamingSpeaker}
                onSubmit={props.handleRenameSpeaker}
            />

            <AddVariantModal
                isOpen={props.isAddVariantModalOpen}
                onClose={() => props.setIsAddVariantModalOpen(false)}
                speakerName={props.addVariantSpeaker?.speaker.name || ''}
                value={props.newVariantNameModal}
                onChange={props.setNewVariantNameModal}
                engine={props.newVariantEngine}
                onEngineChange={props.setNewVariantEngine}
                engines={props.engines}
                isAdding={props.isAddingVariantModal}
                onSubmit={props.handleAddVariant}
            />

            <MoveVariantModal
                isOpen={props.isMoveVariantModalOpen}
                onClose={() => props.setIsMoveVariantModalOpen(false)}
                variantName={getVariantDisplayName(props.moveVariantProfile)}
                speakers={props.allVoices.filter(v => {
                    if (props.moveVariantProfile?.speaker_id && v.id === props.moveVariantProfile.speaker_id) return false;
                    if (!props.moveVariantProfile?.speaker_id && v.id === `unassigned-${props.moveVariantProfile?.name}`) return false;
                    return true;
                })}
                selectedSpeakerId={props.selectedMoveSpeakerId}
                onSelectSpeaker={props.setSelectedMoveSpeakerId}
                isMoving={props.isMovingVariant}
                onSubmit={props.handleMoveVariant}
            />

            <Drawer 
                isOpen={props.showGuide} 
                onClose={() => props.setShowGuide(false)} 
                title="Recording Guide"
            >
                <RecordingGuide />
            </Drawer>

            <Drawer
                isOpen={!!props.editingProfile}
                onClose={() => props.setEditingProfile(null)}
                title={`Edit: ${props.variantName || getVariantDisplayName(props.editingProfile)}`}
            >
                <ScriptEditor
                    variantName={props.variantName}
                    onVariantNameChange={props.setVariantName}
                    engine={props.editingEngine}
                    onEngineChange={props.setEditingEngine}
                    engines={props.engines}
                    testText={props.testText}
                    onTestTextChange={props.setTestText}
                    referenceSample={props.referenceSample}
                    onReferenceSampleChange={props.setReferenceSample}
                    availableSamples={props.editingProfile?.samples || []}
                    voxtralVoiceId={props.voxtralVoiceId}
                    onVoxtralVoiceIdChange={props.setVoxtralVoiceId}
                    onResetTestText={props.handleResetTestText}
                    onSave={props.handleSaveTestText}
                    isSaving={props.isSavingText}
                />
            </Drawer>

            {props.exportVoiceName && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 1900,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.5rem'
                }}>
                    <div
                        onClick={() => props.setExportVoiceName(null)}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(15, 23, 42, 0.4)',
                            backdropFilter: 'blur(8px)'
                        }}
                    />
                    <div style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: '440px',
                        background: 'var(--surface)',
                        borderRadius: '20px',
                        boxShadow: 'var(--shadow-xl)',
                        border: '1px solid var(--border)',
                        padding: '2rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.25rem'
                    }}>
                        <div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>
                                Export Voice Bundle
                            </h3>
                            <p style={{ fontSize: '0.925rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                                Export a voice bundle with all variants, metadata, previews, and model files.
                            </p>
                        </div>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                Voice to export
                            </span>
                            <select
                                value={props.exportVoiceName || ''}
                                onChange={(event) => props.setExportVoiceName(event.target.value || null)}
                                style={{
                                    width: '100%',
                                    padding: '0.85rem 1rem',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface-light)',
                                    color: 'var(--text-primary)',
                                    fontWeight: 600
                                }}
                            >
                                {props.exportVoiceOptions.map(option => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '12px',
                            borderRadius: '12px',
                            border: '1px solid var(--border)',
                            background: 'var(--surface-light)',
                            cursor: 'pointer'
                        }}>
                            <input
                                type="checkbox"
                                checked={props.includeSourceWavs}
                                onChange={(event) => props.setIncludeSourceWavs(event.target.checked)}
                            />
                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                Include source WAV samples
                            </span>
                        </label>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '0.25rem' }}>
                            <button
                                onClick={() => props.setExportVoiceName(null)}
                                className="btn-ghost"
                                style={{ flex: 1, padding: '0.75rem', borderRadius: '12px' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={props.handleConfirmExportVoice}
                                className="btn-primary"
                                disabled={!props.exportVoiceName}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: '12px' }}
                            >
                                Download Bundle
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={!!props.confirmConfig}
                title={props.confirmConfig?.title || ''}
                message={props.confirmConfig?.message || ''}
                isDestructive={props.confirmConfig?.isDestructive}
                isAlert={props.confirmConfig?.isAlert}
                onConfirm={() => {
                    props.confirmConfig?.onConfirm();
                    props.setConfirmConfig(null);
                }}
                onCancel={() => props.setConfirmConfig(null)}
            />
        </>
    );
};
