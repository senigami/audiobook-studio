import React, { useState, useCallback } from 'react';
import { Loader2, Settings } from 'lucide-react';
import type { TtsEngine } from '@/types';
import { api } from '@/api';
import { JsonSchemaForm } from '@/pages/Settings/components/JsonSchemaForm';

interface VoiceModulesPanelProps {
    engines: TtsEngine[];
    loading?: boolean;
    onShowNotification?: (message: string) => void;
    onRefresh?: () => void | Promise<void>;
}

/**
 * VoiceModulesPanel — per-engine schema-driven settings for the Engines page.
 * Reuses JsonSchemaForm (already live in EngineCard) to show each engine's
 * configurable settings in a single focused panel.
 */
export const VoiceModulesPanel: React.FC<VoiceModulesPanelProps> = ({
    engines,
    loading = false,
    onShowNotification,
    onRefresh,
}) => {
    const [savingEngine, setSavingEngine] = useState<string | null>(null);
    const [resettingKey, setResettingKey] = useState<string | null>(null);

    const handleSave = useCallback(async (engineId: string, values: Record<string, any>) => {
        setSavingEngine(engineId);
        try {
            await api.updateEngineSettings(engineId, values);
            onShowNotification?.('Settings saved.');
            await onRefresh?.();
        } catch (err: any) {
            onShowNotification?.(`Failed to save: ${err.message || err}`);
        } finally {
            setSavingEngine(null);
        }
    }, [onShowNotification, onRefresh]);

    const handleReset = useCallback(async (engineId: string, settingKey: string) => {
        setResettingKey(`${engineId}:${settingKey}`);
        try {
            await api.clearEngineSetting(engineId, settingKey);
            onShowNotification?.(`Reset "${settingKey}".`);
            await onRefresh?.();
        } catch (err: any) {
            onShowNotification?.(`Reset failed: ${err.message || err}`);
        } finally {
            setResettingKey(null);
        }
    }, [onShowNotification, onRefresh]);

    if (loading && engines.length === 0) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Loader2 size={24} className="spin" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p>Loading module settings...</p>
            </div>
        );
    }

    const configurable = engines.filter(e => {
        const props = e.settings_schema?.properties;
        return props && Object.keys(props).some(k => k !== 'enabled');
    });

    if (configurable.length === 0) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No installed engines have configurable module settings.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {configurable.map(engine => (
                <div
                    key={engine.engine_id}
                    style={{
                        borderRadius: '16px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        overflow: 'hidden',
                    }}
                >
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid var(--border)',
                        background: 'var(--surface-light)',
                    }}>
                        <Settings size={16} color="var(--accent)" />
                        <div>
                            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                                {engine.display_name}
                            </span>
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {engine.engine_id}
                            </span>
                        </div>
                        <span style={{
                            marginLeft: 'auto',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '99px',
                            background: engine.status === 'ready' ? 'var(--success-tint)' : 'var(--warning-tint)',
                            color: engine.status === 'ready' ? 'var(--success-text)' : 'var(--warning-text)',
                        }}>
                            {engine.status === 'ready' ? 'Ready' : 'Needs Setup'}
                        </span>
                    </div>
                    <div style={{ padding: '1.25rem' }}>
                        <JsonSchemaForm
                            schema={engine.settings_schema}
                            values={engine.current_settings || {}}
                            onSave={(values) => handleSave(engine.engine_id, values)}
                            onReset={(key) => handleReset(engine.engine_id, key)}
                            busy={savingEngine === engine.engine_id || resettingKey?.startsWith(`${engine.engine_id}:`) === true}
                            engineVerified={engine.verified ?? false}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
};
