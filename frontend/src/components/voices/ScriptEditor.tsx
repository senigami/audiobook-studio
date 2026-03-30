import React from 'react';
import { RotateCcw, Loader2 } from 'lucide-react';
import { GlassInput } from '../GlassInput';
import type { VoiceEngine } from '../../types';

interface ScriptEditorProps {
    variantName: string;
    onVariantNameChange: (val: string) => void;
    engine: VoiceEngine;
    onEngineChange: (val: VoiceEngine) => void;
    voxtralEnabled: boolean;
    testText: string;
    onTestTextChange: (val: string) => void;
    referenceSample: string;
    onReferenceSampleChange: (val: string) => void;
    availableSamples: string[];
    voxtralVoiceId: string;
    onVoxtralVoiceIdChange: (val: string) => void;
    onResetTestText: () => void;
    onSave: () => void;
    isSaving: boolean;
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({
    variantName,
    onVariantNameChange,
    engine,
    onEngineChange,
    voxtralEnabled,
    testText,
    onTestTextChange,
    referenceSample,
    onReferenceSampleChange,
    availableSamples,
    voxtralVoiceId,
    onVoxtralVoiceIdChange,
    onResetTestText,
    onSave,
    isSaving
}) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '1.5rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>VARIANT NAME</label>
                    <GlassInput
                        placeholder="Variant name"
                        value={variantName}
                        onChange={(e) => onVariantNameChange(e.target.value)}
                    />
                    <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Changing the variant label updates how this profile appears in the app. Use <strong>Rename Voice</strong> if you want to rename the voice itself.
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '1.5rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>ENGINE</label>
                    <select
                        aria-label="Engine"
                        value={engine}
                        onChange={(e) => onEngineChange(e.target.value as VoiceEngine)}
                        style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '12px',
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text)',
                            fontSize: '0.95rem',
                        }}
                    >
                        <option value="xtts">XTTS</option>
                        {(voxtralEnabled || engine === 'voxtral') && (
                            <option value="voxtral">
                                {voxtralEnabled ? 'Voxtral (Cloud)' : 'Voxtral (Cloud, disabled in Settings)'}
                            </option>
                        )}
                    </select>
                    {!voxtralEnabled && engine === 'voxtral' && (
                        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            This profile is still assigned to Voxtral, but cloud voices are currently turned off in Settings. You can keep it as-is or switch it back to XTTS manually.
                        </p>
                    )}
                </div>

                {engine === 'voxtral' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>REFERENCE SAMPLE</label>
                            <select
                                aria-label="Reference Sample"
                                value={referenceSample}
                                onChange={(e) => onReferenceSampleChange(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface)',
                                    color: 'var(--text)',
                                    fontSize: '0.95rem',
                                }}
                            >
                                <option value="">Use profile samples automatically</option>
                                {availableSamples.map((sample) => (
                                    <option key={sample} value={sample}>{sample}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>SAVED VOXTRAL VOICE ID</label>
                            <GlassInput
                                placeholder="Optional saved voice id"
                                value={voxtralVoiceId}
                                onChange={(e) => onVoxtralVoiceIdChange(e.target.value)}
                            />
                        </div>

                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                            Voxtral sends preview text and reference audio to Mistral when used. Leave this voice on XTTS if you want fully local generation.
                        </p>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>PREVIEW TEXT SCRIPT</label>
                    <button 
                        onClick={onResetTestText} 
                        className="btn-ghost"
                        style={{ fontSize: '0.7rem', height: '28px', padding: '0 8px' }}
                    >
                        <RotateCcw size={12} style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                        Reset to Default
                    </button>
                </div>
                <textarea
                    value={testText}
                    onChange={(e) => onTestTextChange(e.target.value)}
                    style={{
                        width: '100%',
                        minHeight: '200px',
                        padding: '1rem',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        fontSize: '0.95rem',
                        lineHeight: '1.6',
                        resize: 'vertical',
                        marginBottom: '1.5rem'
                    }}
                />
                <button
                    onClick={onSave}
                    disabled={isSaving}
                    className="btn-primary"
                    style={{ width: '100%', height: '44px', borderRadius: '12px', justifyContent: 'center' }}
                >
                    {isSaving ? (
                        <>
                            <Loader2 size={18} className="animate-spin" />
                            Saving Changes...
                        </>
                    ) : (
                        "Save Script"
                    )}
                </button>
            </div>
        </div>
    );
};
