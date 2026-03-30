import React, { useEffect, useMemo, useState } from 'react';
import { Settings, RefreshCw, Loader2, ShieldCheck, Music, KeyRound, CircleHelp, Sparkles, TriangleAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GhostButton } from './GhostButton';
import type { Settings as AppSettings } from '../types';

interface SettingsTrayProps {
    settings: AppSettings | undefined;
    onRefresh: () => void;
    onShowNotification?: (message: string) => void;
}

export const SettingsTray: React.FC<SettingsTrayProps> = ({ 
    settings, 
    onRefresh, 
    onShowNotification
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [mistralApiKey, setMistralApiKey] = useState('');
    const [voxtralModel, setVoxtralModel] = useState('voxtral-mini-tts-2603');
    const voxtralConfigured = useMemo(() => !!settings?.mistral_api_key?.trim(), [settings?.mistral_api_key]);
    const voxtralEnabled = !!settings?.voxtral_enabled && voxtralConfigured;

    useEffect(() => {
        setMistralApiKey(settings?.mistral_api_key || '');
        setVoxtralModel(settings?.voxtral_model || 'voxtral-mini-tts-2603');
    }, [settings?.mistral_api_key, settings?.voxtral_model]);

    const handleToggle = async (key: string, currentValue: boolean) => {
        setSaving(true);
        try {
            const formData = new URLSearchParams();
            formData.append(key, (!currentValue).toString());
            await fetch('/settings', { method: 'POST', body: formData });
            onRefresh();
        } catch (e) {
            console.error('Failed to update setting', e);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveVoxtralSettings = async () => {
        setSaving(true);
        try {
            const formData = new URLSearchParams();
            formData.append('mistral_api_key', mistralApiKey.trim());
            formData.append('voxtral_model', voxtralModel.trim() || 'voxtral-mini-tts-2603');
            formData.append('voxtral_enabled', ((settings?.voxtral_enabled ?? false) && !!mistralApiKey.trim()).toString());
            await fetch('/settings', { method: 'POST', body: formData });
            onRefresh();
            onShowNotification?.(mistralApiKey.trim() ? 'Mistral API settings saved.' : 'Mistral key cleared. Voxtral is now hidden.');
        } catch (e) {
            console.error('Failed to save Voxtral settings', e);
        } finally {
            setSaving(false);
        }
    };

    const handleToggleVoxtral = async () => {
        if (!voxtralConfigured) {
            onShowNotification?.('Add a Mistral API key before turning Voxtral on.');
            return;
        }
        setSaving(true);
        try {
            const formData = new URLSearchParams();
            formData.append('voxtral_enabled', (!settings?.voxtral_enabled).toString());
            await fetch('/settings', { method: 'POST', body: formData });
            onRefresh();
        } catch (e) {
            console.error('Failed to update Voxtral toggle', e);
        } finally {
            setSaving(false);
        }
    };

    const rowStyle = (itemId: string): React.CSSProperties => ({
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '8px 12px',
        margin: '0 -12px',
        borderRadius: '8px',
        background: hoveredItem === itemId ? 'var(--accent-glow)' : 'transparent',
        transition: 'all 0.2s ease',
        cursor: 'pointer'
    });

    return (
        <div style={{ position: 'relative' }}>
            <GhostButton 
                onClick={() => setIsOpen(!isOpen)}
                icon={Settings}
                isActive={isOpen}
                title="Synthesis Preferences"
                iconClassName={isOpen ? "animate-spin-slow" : ""}
            />

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div 
                            style={{ position: 'fixed', inset: 0, zIndex: 1998 }} 
                            onClick={() => setIsOpen(false)} 
                        />
                        <motion.div 
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="popover-panel"
                            style={{ 
                                position: 'absolute',
                                top: 'calc(100% + 12px)',
                                right: 0,
                                width: '320px',
                                overflow: 'hidden',
                                padding: '16px',
                                zIndex: 1999
                            }}
                        >
                            {saving && (
                                <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                                    <Loader2 size={14} className="animate-spin" color="var(--accent)" />
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {/* Safe Mode */}
                                <div 
                                    style={rowStyle('safe-mode')}
                                    onMouseEnter={() => setHoveredItem('safe-mode')}
                                    onMouseLeave={() => setHoveredItem(null)}
                                    onClick={() => handleToggle('safe_mode', !!settings?.safe_mode)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <ShieldCheck size={18} color={hoveredItem === 'safe-mode' ? 'var(--accent)' : 'var(--text-muted)'} />
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>Safe Mode</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Auto-recover engine</div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleToggle('safe_mode', !!settings?.safe_mode); }}
                                        className={settings?.safe_mode ? 'btn-primary' : 'btn-glass'} 
                                        style={{ fontSize: '0.65rem', padding: '4px 10px', borderRadius: '6px', minWidth: '42px' }}
                                    >
                                        {settings?.safe_mode ? 'ON' : 'OFF'}
                                    </button>
                                </div>

                                {/* Produce MP3 */}
                                <div 
                                    style={{ display: 'flex', flexDirection: 'column' }}
                                    onMouseLeave={() => setHoveredItem(null)}
                                >
                                    <div 
                                        style={rowStyle('make-mp3')}
                                        onMouseEnter={() => setHoveredItem('make-mp3')}
                                        onClick={() => handleToggle('make_mp3', !!settings?.make_mp3)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <Music size={18} color={hoveredItem === 'make-mp3' ? 'var(--accent)' : 'var(--text-muted)'} />
                                            <div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>Produce MP3</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Compatible exports</div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleToggle('make_mp3', !!settings?.make_mp3); }}
                                            className={settings?.make_mp3 ? 'btn-primary' : 'btn-glass'} 
                                            style={{ fontSize: '0.65rem', padding: '4px 10px', borderRadius: '6px', minWidth: '42px' }}
                                        >
                                            {settings?.make_mp3 ? 'ON' : 'OFF'}
                                        </button>
                                    </div>

                                {/* Backfill MP3s */}
                                {settings?.make_mp3 && (
                                    <div 
                                        style={{ ...rowStyle('sync'), paddingLeft: '28px' }}
                                        onMouseEnter={() => setHoveredItem('sync')}
                                        onMouseLeave={() => setHoveredItem(null)}
                                        onClick={async () => {
                                            await fetch('/queue/backfill_mp3', { method: 'POST' });
                                            onRefresh();
                                            onShowNotification?.('Generating missing MP3s. Check queue for progress.');
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <RefreshCw size={18} color={hoveredItem === 'sync' ? 'var(--accent)' : 'var(--text-muted)'} />
                                            <div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>Backfill MP3s</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Generate missing MP3s</div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                await fetch('/queue/backfill_mp3', { method: 'POST' });
                                                onRefresh();
                                                onShowNotification?.('Generating missing MP3s. Check queue for progress.');
                                            }}
                                            className="btn-glass"
                                            style={{ fontSize: '0.65rem', padding: '4px 10px', borderRadius: '6px', minWidth: '42px', fontWeight: 700, color: 'var(--accent)' }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'var(--accent)';
                                                e.currentTarget.style.color = 'white';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'white';
                                                e.currentTarget.style.color = 'var(--accent)';
                                            }}
                                        >
                                            START
                                        </button>
                                    </div>
                                )}

                                <div
                                    style={{
                                        marginTop: '0.5rem',
                                        padding: '12px',
                                        borderRadius: '12px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--surface-alt)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <KeyRound size={18} color={voxtralEnabled ? '#0ea5e9' : 'var(--text-muted)'} />
                                            <div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Voxtral Cloud Voices</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                    {voxtralEnabled ? 'Visible in Voices' : voxtralConfigured ? 'Saved but hidden' : 'Hidden until a key is added'}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleToggleVoxtral}
                                            className={voxtralEnabled ? 'btn-primary' : 'btn-glass'}
                                            style={{ fontSize: '0.65rem', padding: '4px 10px', borderRadius: '6px', minWidth: '42px' }}
                                        >
                                            {voxtralEnabled ? 'ON' : 'OFF'}
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.5 }}>
                                        <CircleHelp size={14} />
                                        <span>
                                            Create a Mistral API key in your workspace settings, paste it here, then turn Voxtral on when you want cloud voices available. Voxtral requests are processed by Mistral instead of staying fully local.
                                        </span>
                                    </div>

                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '8px',
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            border: '1px solid rgba(217, 119, 6, 0.25)',
                                            background: 'rgba(245, 158, 11, 0.08)',
                                            color: '#92400e',
                                            fontSize: '0.72rem',
                                            lineHeight: 1.5
                                        }}
                                    >
                                        <TriangleAlert size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                                        <span>
                                            Privacy note: turning on Voxtral sends the text you synthesize, and any selected reference audio, to Mistral&apos;s servers. Keep voices on <strong>`XTTS (Local)`</strong> if you want your workflow to stay fully local.
                                        </span>
                                    </div>

                                    <a
                                        href="https://help.mistral.ai/en/articles/347464-how-do-i-create-api-keys-within-a-workspace"
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ fontSize: '0.72rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 700 }}
                                    >
                                        Open Mistral API key instructions
                                    </a>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>MISTRAL API KEY</label>
                                        <input
                                            type="password"
                                            placeholder="Paste your Mistral API key"
                                            value={mistralApiKey}
                                            onChange={(e) => setMistralApiKey(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '10px 12px',
                                                borderRadius: '10px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                color: 'var(--text)',
                                                fontSize: '0.85rem'
                                            }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>VOXTRAL MODEL</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Sparkles size={14} color="var(--text-muted)" />
                                            <input
                                                type="text"
                                                placeholder="voxtral-mini-tts-2603"
                                                value={voxtralModel}
                                                onChange={(e) => setVoxtralModel(e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '10px 12px',
                                                    borderRadius: '10px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--surface)',
                                                    color: 'var(--text)',
                                                    fontSize: '0.85rem'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleSaveVoxtralSettings}
                                        className="btn-primary"
                                        style={{ height: '38px', borderRadius: '10px', justifyContent: 'center' }}
                                    >
                                        Save API Settings
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};
