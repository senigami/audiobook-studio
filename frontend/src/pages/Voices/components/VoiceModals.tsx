import React from 'react';
import { motion } from 'framer-motion';
import { GlassInput } from '@/components/forms/GlassInput';
import { VoiceDropzone } from '@/components/forms/VoiceDropzone';
import SearchableSelect from '@/components/forms/SearchableSelect';
import type { TtsEngine, VoiceEngine } from '@/types';

const engineSelectStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '12px',
    background: 'var(--surface-alt)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    outline: 'none',
    cursor: 'pointer'
};

interface NewVoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    value: string;
    onChange: (val: string) => void;
    engine: VoiceEngine;
    onEngineChange: (val: VoiceEngine) => void;
    engines?: TtsEngine[];
    onSubmit: () => void;
    isCreating: boolean;
    sampleFiles?: File[];
    onSampleFilesChange?: (files: File[]) => void;
}

export const NewVoiceModal: React.FC<NewVoiceModalProps> = ({ isOpen, onClose, value, onChange, engine, onEngineChange, engines = [], onSubmit, isCreating, sampleFiles = [], onSampleFilesChange }) => {
    if (!isOpen) return null;
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--overlay-backdrop)',
            backdropFilter: 'blur(4px)'
        }}>
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{
                    width: 'min(520px, calc(100vw - 2rem))',
                    background: 'var(--surface)',
                    borderRadius: '24px',
                    padding: '24px',
                    boxShadow: 'var(--shadow-lg)',
                    border: '1px solid var(--border)'
                }}
            >
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>Create New Voice</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                    Give your voice a name and optionally upload samples now. You can also add samples after creation.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>VOICE NAME</label>
                    <GlassInput
                        autoFocus
                        placeholder="e.g. Victor the Vampire"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && value.trim()) {
                                onSubmit();
                            }
                        }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                    <label htmlFor="new-voice-engine" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>ENGINE</label>
                    <select id="new-voice-engine" value={engine} onChange={(e) => onEngineChange(e.target.value as VoiceEngine)} style={engineSelectStyle}>
                        {engines.filter(e => e.enabled).length === 0 ? (
                            <option value="">No enabled engines available</option>
                        ) : (
                            <>
                                {engines.filter(e => e.enabled).map((e, idx) => (
                                    <option key={`${e.engine_id}-${idx}`} value={e.engine_id}>{e.display_name} {e.status !== 'ready' ? '(🚫 Needs Setup)' : ''}</option>
                                ))}
                            </>
                        )}
                    </select>
                </div>

                {onSampleFilesChange && (
                    <div style={{ marginBottom: '24px' }}>
                        <VoiceDropzone
                            files={sampleFiles}
                            onFilesChange={onSampleFilesChange}
                        />
                    </div>
                )}

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={onClose} className="btn-ghost" style={{ flex: 1, height: '44px', borderRadius: '12px' }}>Cancel</button>
                    <button
                        disabled={!value.trim() || isCreating}
                        onClick={onSubmit}
                        className="btn-primary"
                        style={{ flex: 1, height: '44px', borderRadius: '12px' }}
                    >
                        {isCreating ? 'Creating...' : 'Create Voice'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

interface RenameVoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    originalName: string;
    value: string;
    onChange: (val: string) => void;
    onSubmit: () => void;
    isRenaming: boolean;
}

export const RenameVoiceModal: React.FC<RenameVoiceModalProps> = ({ isOpen, onClose, originalName, value, onChange, onSubmit, isRenaming }) => {
    if (!isOpen) return null;
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--overlay-backdrop)',
            backdropFilter: 'blur(4px)'
        }}>
            <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{
                    width: 'min(400px, calc(100vw - 2rem))',
                    background: 'var(--surface)',
                    borderRadius: '24px',
                    padding: '24px',
                    boxShadow: 'var(--shadow-lg)',
                    border: '1px solid var(--border)'
                }}
            >
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>
                    Rename Voice: <span style={{ color: 'var(--accent)' }}>{originalName}</span>
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                    Update the name for this voice. This will also update the prefix for all its variants.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>NEW NAME</label>
                    <GlassInput
                        autoFocus
                        placeholder="e.g. Victor the Vampire"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && value.trim() && !isRenaming) {
                                onSubmit();
                            }
                        }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={onClose} className="btn-ghost" style={{ flex: 1, height: '44px', borderRadius: '12px' }}>Cancel</button>
                    <button 
                        disabled={!value.trim() || isRenaming}
                        onClick={onSubmit}
                        className="btn-primary"
                        style={{ flex: 1, height: '44px', borderRadius: '12px' }}
                    >
                        {isRenaming ? 'Renaming...' : 'Rename Voice'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

interface AddVariantModalProps {
    isOpen: boolean;
    onClose: () => void;
    speakerName: string;
    value: string;
    onChange: (val: string) => void;
    engine: VoiceEngine;
    onEngineChange: (val: VoiceEngine) => void;
    engines?: TtsEngine[];
    onSubmit: () => void;
    isAdding: boolean;
}

export const AddVariantModal: React.FC<AddVariantModalProps> = ({ isOpen, onClose, speakerName, value, onChange, engine, onEngineChange, engines = [], onSubmit, isAdding }) => {
    if (!isOpen) return null;
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--overlay-backdrop)',
            backdropFilter: 'blur(4px)'
        }}>
            <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{
                    width: 'min(400px, calc(100vw - 2rem))',
                    background: 'var(--surface)',
                    borderRadius: '24px',
                    padding: '24px',
                    boxShadow: 'var(--shadow-lg)',
                    border: '1px solid var(--border)'
                }}
            >
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>Add Variant</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                    Create a new variant for voice <span style={{ color: 'var(--accent)', fontWeight: 700 }}>"{speakerName}"</span>.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>VARIANT NAME</label>
                    <GlassInput
                        autoFocus
                        placeholder="e.g. Variant 2"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && value.trim() && !isAdding) {
                                onSubmit();
                            }
                        }}
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                    <label htmlFor="add-variant-engine" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>ENGINE</label>
                    <select id="add-variant-engine" value={engine} onChange={(e) => onEngineChange(e.target.value as VoiceEngine)} style={engineSelectStyle}>
                        {engines.filter(e => e.enabled).length === 0 ? (
                            <option value="">No enabled engines available</option>
                        ) : (
                            <>
                                {engines.filter(e => e.enabled).map((e, idx) => (
                                    <option key={`${e.engine_id}-${idx}`} value={e.engine_id}>{e.display_name} {e.status !== 'ready' ? '(🚫 Needs Setup)' : ''}</option>
                                ))}
                            </>
                        )}
                    </select>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={onClose} className="btn-ghost" style={{ flex: 1, height: '44px', borderRadius: '12px' }}>Cancel</button>
                    <button 
                        disabled={!value.trim() || isAdding}
                        onClick={onSubmit}
                        className="btn-primary"
                        style={{ flex: 1, height: '44px', borderRadius: '12px' }}
                    >
                        {isAdding ? 'Adding...' : 'Add Variant'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

interface MoveVariantModalProps {
    isOpen: boolean;
    onClose: () => void;
    variantName: string;
    speakers: { id: string, name: string }[];
    selectedSpeakerId: string;
    onSelectSpeaker: (id: string) => void;
    onSubmit: () => void;
    isMoving: boolean;
}

export const MoveVariantModal: React.FC<MoveVariantModalProps> = ({ 
    isOpen, onClose, variantName, speakers, selectedSpeakerId, onSelectSpeaker, onSubmit, isMoving 
}) => {
    if (!isOpen) return null;
    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--overlay-backdrop)',
            backdropFilter: 'blur(4px)'
        }}>
            <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{
                    width: 'min(440px, calc(100vw - 2rem))',
                    background: 'var(--surface)',
                    borderRadius: '24px',
                    padding: '24px',
                    boxShadow: 'var(--shadow-lg)',
                    border: '1px solid var(--border)'
                }}
            >
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>Move Variant</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                    Move <span style={{ color: 'var(--accent)', fontWeight: 700 }}>"{variantName}"</span> to another speaker profile.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>SELECT TARGET SPEAKER</label>
                    <SearchableSelect
                        options={speakers}
                        value={selectedSpeakerId || 'none'}
                        onChange={(val) => onSelectSpeaker(val === 'none' ? '' : val)}
                        placeholder="Select a speaker..."
                        noneLabel="Select a speaker..."
                        showCreateNew={false}
                    />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={onClose} className="btn-ghost" style={{ flex: 1, height: '44px', borderRadius: '12px' }}>Cancel</button>
                    <button 
                        disabled={!selectedSpeakerId || isMoving}
                        onClick={onSubmit}
                        className="btn-primary"
                        style={{ flex: 1, height: '44px', borderRadius: '12px' }}
                    >
                        {isMoving ? 'Moving...' : 'Move Variant'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};
