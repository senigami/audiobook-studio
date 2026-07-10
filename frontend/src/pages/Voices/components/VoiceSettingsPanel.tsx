import React from 'react';
import { JsonSchemaForm } from '@/pages/Settings/components/JsonSchemaForm';
import type { VoiceEngine, TtsEngine } from '@/types';

interface VoiceSettingsPanelProps {
    engine: VoiceEngine;
    engines?: TtsEngine[];
    settings: Record<string, any>;
    onSettingsChange: (val: Record<string, any>) => void;
    isSaving: boolean;
    onSave: () => void;
}

/**
 * VoiceSettingsPanel — the dedicated home for plugin-defined per-voice controls
 * (e.g. XTTS/Voxtral-specific synthesis tuning), reached from the voice catalog
 * card's ⋯ action menu ("Voice Settings") rather than bundled into the Script
 * Editor drawer. Relocated per the Phase 12 backlog note: the settings previously
 * lived inside the "Edit Recording Script" popup, which is about test-script text,
 * not per-voice synthesis tuning.
 *
 * Persistence is unchanged: the form stages edits into `settings`/`onSettingsChange`
 * (the same state the Script Editor used), and `onSave` triggers the same profile
 * save flow (`handleSaveTestText`) that merges allowed plugin settings into one PATCH.
 */
export const VoiceSettingsPanel: React.FC<VoiceSettingsPanelProps> = ({
    engine,
    engines = [],
    settings,
    onSettingsChange,
    isSaving,
    onSave,
}) => {
    const activeEngine = engines.find(e => e.engine_id === engine);
    const synthesisSettings = activeEngine?.behavior?.synthesis_settings || [];
    const hasVoiceSettings = Boolean(activeEngine?.settings_schema) && synthesisSettings.length > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Per-voice settings for <strong>{activeEngine?.display_name || engine}</strong>. These apply only to this voice profile — engine-wide module settings live on the Engines page.
                </p>

                {hasVoiceSettings ? (
                    <JsonSchemaForm
                        schema={activeEngine!.settings_schema}
                        values={settings}
                        onSave={onSettingsChange}
                        busy={isSaving}
                        engineVerified={activeEngine!.verified}
                        propertyFilter={synthesisSettings}
                    />
                ) : (
                    <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {activeEngine?.display_name || 'This engine'} does not expose any per-voice settings.
                    </div>
                )}
            </div>

            {hasVoiceSettings && (
                <button
                    onClick={onSave}
                    disabled={isSaving}
                    className="btn-primary"
                    style={{ width: '100%', height: '44px', borderRadius: '12px', justifyContent: 'center' }}
                >
                    {isSaving ? 'Saving...' : 'Save Voice Settings'}
                </button>
            )}
        </div>
    );
};
