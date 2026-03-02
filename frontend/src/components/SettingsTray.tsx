import React, { useState } from 'react';
import { Settings, RefreshCw, Loader2, Terminal, ShieldCheck, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GhostButton } from './GhostButton';

interface SettingsTrayProps {
    settings: any;
    onRefresh: () => void;
    showLogs: boolean;
    onToggleLogs: () => void;
    onShowNotification?: (message: string) => void;
}

export const SettingsTray: React.FC<SettingsTrayProps> = ({ 
    settings, 
    onRefresh, 
    showLogs, 
    onToggleLogs,
    onShowNotification
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

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

    const rowStyle = (itemId: string): React.CSSProperties => ({
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '8px 12px',
        margin: '0 -12px',
        borderRadius: '8px',
        background: hoveredItem === itemId ? 'var(--accent-glow)' : 'transparent',
        transition: 'all 0.2s ease',
        cursor: 'default'
    });

    return (
        <div style={{ position: 'relative' }}>
            <GhostButton 
                onClick={() => setIsOpen(!isOpen)}
                icon={Settings}
                isActive={isOpen}
                title="Synthesis Preferences"
                className={isOpen ? "animate-spin-slow" : ""}
            />

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div 
                            style={{ position: 'fixed', inset: 0, zIndex: 998 }} 
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
                                padding: '16px'
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
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <ShieldCheck size={18} color={hoveredItem === 'safe-mode' ? 'var(--accent)' : 'var(--text-muted)'} />
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>Safe Mode</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Auto-recover engine</div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => handleToggle('safe_mode', settings?.safe_mode)}
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
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <Music size={18} color={hoveredItem === 'make-mp3' ? 'var(--accent)' : 'var(--text-muted)'} />
                                            <div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>Produce MP3</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Compatible exports</div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleToggle('make_mp3', settings?.make_mp3)}
                                            className={settings?.make_mp3 ? 'btn-primary' : 'btn-glass'} 
                                            style={{ fontSize: '0.65rem', padding: '4px 10px', borderRadius: '6px', minWidth: '42px' }}
                                        >
                                            {settings?.make_mp3 ? 'ON' : 'OFF'}
                                        </button>
                                    </div>

                                {/* Backfill MP3s */}
                                {settings?.make_mp3 && (
                                    <div 
                                        style={rowStyle('sync')}
                                        onMouseEnter={() => setHoveredItem('sync')}
                                        onMouseLeave={() => setHoveredItem(null)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <RefreshCw size={18} color={hoveredItem === 'sync' ? 'var(--accent)' : 'var(--text-muted)'} />
                                            <div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>Backfill MP3s</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Generate missing high-quality MP3s</div>
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

                                {/* Advanced Section */}
                                <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0 4px', opacity: 0.5 }} />
                                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em', padding: '0 4px 4px' }}>ADVANCED</div>
                                </div>

                                {/* System Console */}
                                <div 
                                    style={rowStyle('console')}
                                    onMouseEnter={() => setHoveredItem('console')}
                                    onMouseLeave={() => setHoveredItem(null)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Terminal size={18} color={hoveredItem === 'console' ? 'var(--accent)' : 'var(--text-muted)'} />
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>System Console</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Show/Hide Logs</div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={onToggleLogs}
                                        className={showLogs ? 'btn-primary' : 'btn-glass'} 
                                        style={{ fontSize: '0.65rem', padding: '4px 10px', borderRadius: '6px', minWidth: '42px' }}
                                    >
                                        {showLogs ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};
