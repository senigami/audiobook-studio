import React, { useState } from 'react';
import type { Speaker, SpeakerProfile } from '../../types';
import { User, RefreshCw, ChevronUp, Star, FileEdit, Trash2, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ActionMenu } from '../ActionMenu';
import { VariantEditor } from './VariantEditor';

interface NarratorCardProps {
    speaker: Speaker;
    profiles: SpeakerProfile[];
    testProgress: Record<string, any>;
    onTest: (name: string) => void;
    onDelete: (name: string) => void;
    onMoveVariant: (profile: SpeakerProfile) => void;
    onRefresh: () => void;
    onEditTestText: (profile: SpeakerProfile) => void;
    onBuildNow: (name: string, files: File[], speakerId?: string, variantName?: string) => Promise<boolean>;
    requestConfirm: (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean; isAlert?: boolean }) => void;
    onAddVariantClick: (speaker: Speaker, profileCount: number) => void;
    onRenameClick: (speaker: Speaker) => void;
    onSetDefaultClick: (profileName: string) => void;
    isExpanded: boolean;
    onToggleExpand: () => void;
    buildingProfiles: Record<string, boolean>;
}

export const NarratorCard: React.FC<NarratorCardProps> = ({
    speaker, profiles, testProgress, 
    onTest, onDelete, onRefresh,
    onEditTestText, onBuildNow, requestConfirm,
    onAddVariantClick, onRenameClick, onSetDefaultClick, isExpanded, onToggleExpand, onMoveVariant,
    buildingProfiles
}) => {
    const defaultProfile = profiles.find(p => p.is_default) || profiles[0] || { name: '', speed: 1.0, wav_count: 0 } as SpeakerProfile;
    const [activeProfileId, setActiveProfileId] = useState(defaultProfile?.name || '');
    const [hoveredProfileId, setHoveredProfileId] = useState<string | null>(null);

    // Auto-select newly added variants
    const prevProfileNames = React.useRef(new Set(profiles.map(p => p.name)));
    React.useEffect(() => {
        const currentNames = new Set(profiles.map(p => p.name));
        if (currentNames.size > prevProfileNames.current.size) {
            const addedName = Array.from(currentNames).find(name => !prevProfileNames.current.has(name));
            if (addedName) {
                setActiveProfileId(addedName);
            }
        }
        prevProfileNames.current = currentNames;
    }, [profiles]);

    React.useEffect(() => {
        if (activeProfileId && !profiles.some(p => p.name === activeProfileId)) {
            setActiveProfileId(defaultProfile?.name || '');
        }
    }, [profiles, activeProfileId, defaultProfile]);

    const activeProfile = profiles.find(p => p.name === activeProfileId) || defaultProfile;

    const handleAddVariant = () => onAddVariantClick(speaker, profiles.length);

    const getStatusInfo = (p: SpeakerProfile | undefined) => {
        if (!p) return { label: 'NO SAMPLES', color: 'var(--text-muted)', bg: 'var(--surface-alt)' };
        if (buildingProfiles[p.name]) return { label: 'BUILDING...', color: 'var(--accent)', bg: 'rgba(var(--accent-rgb), 0.1)' };
        if (p.wav_count === 0) return { label: 'NO SAMPLES', color: 'var(--text-muted)', bg: 'var(--surface-alt)' };
        if (p.is_rebuild_required) return { label: 'REBUILD REQUIRED', color: 'var(--warning-text)', bg: 'rgba(var(--warning-rgb), 0.1)' };
        if (!p.preview_url) return { label: 'BUILD TO TEST', color: 'var(--accent)', bg: 'rgba(var(--accent-rgb), 0.1)' };
        return { label: 'BUILT', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
    };

    const status = getStatusInfo(activeProfile as SpeakerProfile);

    return (
        <div className="glass-panel animate-in" style={{ padding: '0', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: isExpanded ? '1px solid var(--accent)' : '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '80px', padding: '0 1.5rem' }}>
                <div 
                    onClick={onToggleExpand}
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '16px', 
                        cursor: 'pointer',
                        flex: 1,
                        userSelect: 'none',
                        height: '100%'
                    }}
                >
                    <div style={{ 
                        position: 'relative',
                        width: '40px', 
                        height: '40px', 
                        borderRadius: '12px', 
                        background: 'var(--accent)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        color: 'white',
                        boxShadow: 'var(--shadow-sm)'
                    }}>
                        <User size={20} />
                        {profiles.some(p => p.is_rebuild_required) && (
                            <div style={{
                                position: 'absolute',
                                top: -4,
                                left: -4,
                                width: '18px',
                                height: '18px',
                                background: 'var(--warning-text)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '2px solid var(--border-light)',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                color: 'white'
                            }}>
                                <RefreshCw size={10} style={{ width: '10px', height: '10px' }} />
                            </div>
                        )}
                        <div 
                            style={{
                                position: 'absolute',
                                bottom: -4,
                                right: -4,
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                background: 'var(--surface)',
                                border: `2px solid ${isExpanded ? 'var(--accent)' : 'var(--border)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: isExpanded ? 'var(--accent)' : 'var(--text-muted)',
                                boxShadow: 'var(--shadow-sm)',
                                zIndex: 2,
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                transform: isExpanded ? 'rotate(0deg)' : 'rotate(180deg)'
                            }}
                        >
                            <ChevronUp size={12} style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {speaker.name}
                                {profiles.some(p => p.is_default) && (
                                    <Star size={16} fill="var(--accent)" color="var(--accent)" />
                                )}
                            </h3>
                            <span style={{ 
                                fontSize: '0.65rem', 
                                padding: '2px 8px', 
                                background: status.bg, 
                                color: status.color,
                                borderRadius: '100px',
                                fontWeight: 800,
                                letterSpacing: '0.02em'
                            }}>{status.label}</span>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ActionMenu 
                        items={[
                            {
                                label: 'Set as Default',
                                icon: Star,
                                disabled: (profiles.find(p => p.name === activeProfileId) || {} as any).is_default,
                                onClick: () => onSetDefaultClick(activeProfileId)
                            },
                            {
                                label: 'Rename Voice',
                                icon: FileEdit,
                                onClick: () => onRenameClick(speaker)
                            },
                            { 
                                label: 'Delete Voice (all variants)', 
                                icon: Trash2,
                                onClick: () => requestConfirm({
                                    title: 'Delete voice?',
                                    message: `Delete voice '${speaker.name}' and all ${profiles.length} variants? This cannot be undone.`,
                                    isDestructive: true,
                                    onConfirm: () => {
                                        const deleteUrl = speaker.id 
                                            ? `/api/speakers/${speaker.id}` 
                                            : `/api/speaker-profiles/${encodeURIComponent(profiles[0]?.name)}`;
                                        
                                        fetch(deleteUrl, { method: 'DELETE' })
                                            .then(resp => {
                                                if (resp.ok) onRefresh();
                                            });
                                    }
                                }),
                                isDestructive: true 
                            }
                        ]}
                    />
                </div>
            </div>

            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(var(--accent-rgb), 0.02)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto' }}>
                                {profiles.map(p => {
                                    const isActive = activeProfileId === p.name;
                                    return (
                                        <button
                                            key={p.name}
                                            onClick={() => {
                                                setActiveProfileId(p.name);
                                            }}
                                            onMouseEnter={() => setHoveredProfileId(p.name)}
                                            onMouseLeave={() => setHoveredProfileId(null)}
                                            style={{
                                                padding: '6px 14px',
                                                borderRadius: '100px',
                                                fontSize: '0.8rem',
                                                fontWeight: 800,
                                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                border: '1px solid',
                                                borderColor: isActive ? 'var(--accent)' : 'transparent',
                                                background: isActive 
                                                    ? 'var(--accent)' 
                                                    : (hoveredProfileId === p.name ? 'var(--accent-glow)' : 'transparent'),
                                                color: isActive 
                                                    ? 'white' 
                                                    : (hoveredProfileId === p.name ? 'var(--text-primary)' : 'var(--text-muted)'),
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {p.is_default && <Star size={12} fill={isActive ? "white" : "var(--accent)"} color={isActive ? "white" : "var(--accent)"} />}
                                            {p.variant_name || 'Default'}
                                        </button>
                                    );
                                })}
                                <button 
                                    onClick={handleAddVariant}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: '100px',
                                        fontSize: '0.8rem',
                                        fontWeight: 800,
                                        color: 'var(--accent)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: 'var(--accent-glow)',
                                        border: '1px dashed var(--accent)',
                                        marginLeft: '4px',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    <Plus size={14} />
                                    Variant
                                </button>
                        </div>

                        <div key={activeProfileId} className="animate-in" style={{ background: 'var(--surface-light)' }}>
                                <VariantEditor
                                    profile={activeProfile as SpeakerProfile}
                                    isTesting={!!buildingProfiles[activeProfile?.name || '']}
                                    testStatus={testProgress[activeProfile?.name || '']}
                                    onTest={onTest}
                                    onDeleteVariant={onDelete}
                                    onMoveVariant={onMoveVariant}
                                    onRefresh={onRefresh}
                                    onEditTestText={onEditTestText}
                                    onBuildNow={onBuildNow}
                                    requestConfirm={requestConfirm}
                                    voiceName={speaker.name}
                                    showControlsInline={true}
                                    buildingProfiles={buildingProfiles}
                                />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
