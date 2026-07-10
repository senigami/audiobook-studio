import React from 'react';
import { RotateCcw, Loader2, Sparkles } from 'lucide-react';
import { GlassInput } from '@/components/forms/GlassInput';
import type { VoiceEngine, TtsEngine, VoiceAttributes } from '@/types';
import { suggestRecordingPrompt } from './metadata/recordingPromptSuggester';

interface ScriptEditorProps {
    variantName: string;
    onVariantNameChange: (val: string) => void;
    engine: VoiceEngine;
    onEngineChange: (val: VoiceEngine) => void;
    engines?: TtsEngine[];
    testText: string;
    onTestTextChange: (val: string) => void;
    referenceSample: string;
    onReferenceSampleChange: (val: string) => void;
    availableSamples: string[];
    engineVoiceId: string;
    onEngineVoiceIdChange: (val: string) => void;
    onResetTestText: () => void;
    onSave: () => void;
    isSaving: boolean;
    /** Tagged attributes for the voice being edited — drives the "Suggest from voice qualities" button (INV-4: absent/untagged disables it, no generic fallback). */
    attributes?: VoiceAttributes;
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({
    variantName,
    onVariantNameChange,
    engine,
    onEngineChange,
    engines = [],
    testText,
    onTestTextChange,
    referenceSample,
    onReferenceSampleChange,
    availableSamples,
    engineVoiceId,
    onEngineVoiceIdChange,
    onResetTestText,
    onSave,
    isSaving,
    attributes
}) => {
    const suggestion = suggestRecordingPrompt(attributes);
    const suggestDisabledReason = !attributes || !suggestion
        ? "Tag this voice's qualities in Edit Metadata first to get a suggested prompt."
        : undefined;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div className="glass-panel" style={{ padding: 'var(--space-5)' }}>
                <div className="script-editor-field-group" style={{ marginBottom: 'var(--space-5)' }}>
                    <label className="voice-field-label">VARIANT NAME</label>
                    <GlassInput
                        placeholder="Variant name"
                        value={variantName}
                        onChange={(e) => onVariantNameChange(e.target.value)}
                    />
                    <p className="script-editor-helper-text" style={{ margin: 'var(--space-1) 0 0' }}>
                        Changing the variant label updates how this profile appears in the app. Use <strong>Rename Voice</strong> if you want to rename the voice itself.
                    </p>
                </div>

                <div className="script-editor-field-group" style={{ marginBottom: 'var(--space-5)' }}>
                    <label className="voice-field-label">ENGINE</label>
                    <select
                        aria-label="Engine"
                        value={engine}
                        onChange={(e) => onEngineChange(e.target.value as VoiceEngine)}
                        className="script-editor-select"
                    >
                        {engines.map((e, idx) => {
                            const isSelected = engine === e.engine_id;
                            if (!e.enabled && !isSelected) return null;
                            return (
                                <option key={`${e.engine_id}-${idx}`} value={e.engine_id}>
                                    {e.enabled ? e.display_name : `${e.display_name} (disabled in Settings)`}
                                </option>
                            );
                        })}
                    </select>
                    {(() => {
                        const activeEngine = engines.find(e => e.engine_id === engine);
                        if (activeEngine && !activeEngine.enabled) {
                            return (
                                <p className="script-editor-helper-text" style={{ margin: 'var(--space-1) 0 0' }}>
                                    This profile is assigned to {activeEngine.display_name}, but it is currently turned off in Settings. New generation is blocked until you turn it back on.
                                </p>
                            );
                        }
                        return null;
                    })()}
                </div>

                {(() => {
                    const activeEngine = engines.find(e => e.engine_id === engine);
                    if (activeEngine?.cloud || activeEngine?.capabilities?.includes('voice_asset_id')) {
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
                                <div className="script-editor-field-group">
                                    <label className="voice-field-label">REFERENCE SAMPLE</label>
                                    <select
                                        aria-label="Reference Sample"
                                        value={referenceSample}
                                        onChange={(e) => onReferenceSampleChange(e.target.value)}
                                        className="script-editor-select"
                                    >
                                        <option value="">Use profile samples automatically</option>
                                        {availableSamples.map((sample, idx) => (
                                            <option key={`${sample}-${idx}`} value={sample}>{sample}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="script-editor-field-group">
                                    <label className="voice-field-label">REMOTE VOICE ASSET ID</label>
                                    <GlassInput
                                        placeholder="Optional remote voice asset id"
                                        value={engineVoiceId}
                                        onChange={(e) => onEngineVoiceIdChange(e.target.value)}
                                    />
                                </div>
                            </div>
                        );
                    }
                    return null;
                })()}

                {(() => {
                    const activeEngine = engines.find(e => e.engine_id === engine);
                    if (activeEngine?.help_text || activeEngine?.privacy_text) {
                        return (
                            <div className="script-editor-help-box">
                                {activeEngine.help_text && (
                                    <p className="script-editor-helper-text" style={{ margin: '0 0 var(--space-2) 0' }}>
                                        {activeEngine.help_text}
                                    </p>
                                )}
                                {activeEngine.privacy_text && (
                                    <p className="script-editor-helper-text" style={{ margin: 0, fontWeight: 600 }}>
                                        {activeEngine.privacy_text}
                                    </p>
                                )}
                            </div>
                        );
                    }
                    return null;
                })()}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                    <label className="voice-field-label">PREVIEW TEXT SCRIPT</label>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button
                            onClick={() => {
                                if (suggestion) onTestTextChange(suggestion.prompt);
                            }}
                            disabled={!suggestion}
                            title={suggestDisabledReason}
                            className="btn-ghost script-editor-btn-compact"
                        >
                            <Sparkles size={12} className="script-editor-icon-sm" />
                            Suggest from voice qualities
                        </button>
                        <button
                            onClick={onResetTestText}
                            className="btn-ghost script-editor-btn-compact"
                        >
                            <RotateCcw size={12} className="script-editor-icon-sm" />
                            Reset to Default
                        </button>
                    </div>
                </div>
                <textarea
                    value={testText}
                    onChange={(e) => onTestTextChange(e.target.value)}
                    className="script-editor-textarea"
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
