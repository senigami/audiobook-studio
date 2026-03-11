import React, { useState, useEffect, useRef } from 'react';
import type { SpeakerProfile } from '../../types';
import { 
    Music, Trash2, Play, Loader2, RefreshCw, FileEdit, X, 
    Pause, Upload, AlertTriangle, Plus, ChevronUp, Sliders
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SpeedPopover } from './VoiceUtils';

interface VariantEditorProps {
    profile: SpeakerProfile;
    isTesting: boolean;
    testStatus?: any;
    onTest: (name: string) => void;
    onDeleteVariant: (name: string) => void;
    onMoveVariant: (profile: SpeakerProfile) => void;
    onRefresh: () => void;
    onEditTestText: (profile: SpeakerProfile) => void;
    onBuildNow: (name: string, files: File[], speakerId?: string, variantName?: string) => Promise<boolean>;
    requestConfirm: (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean; isAlert?: boolean }) => void;
    voiceName: string;
    showControlsInline?: boolean;
    buildingProfiles: Record<string, boolean>;
}

export const VariantEditor: React.FC<VariantEditorProps> = ({ 
    profile, isTesting, onTest, onDeleteVariant, onMoveVariant, onRefresh, 
    onEditTestText, onBuildNow, requestConfirm, testStatus,
    voiceName, showControlsInline = false, buildingProfiles
}) => {
    const [localSpeed, setLocalSpeed] = useState<number | null>(null);
    const [cacheBuster, setCacheBuster] = useState(Date.now());
    const [isPlaying, setIsPlaying] = useState(false);
    const [playingSample, setPlayingSample] = useState<string | null>(null);
    const [hoveredSampleIdx, setHoveredSampleIdx] = useState<number | null>(null);
    const isBuilding = buildingProfiles[profile.name];
    const audioRef = useRef<HTMLAudioElement>(null);
    const sampleAudioRef = useRef<HTMLAudioElement>(null);
    const speedPillRef = useRef<HTMLButtonElement>(null);
    const speed = localSpeed ?? profile.speed;

    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        if (profile.preview_url) {
            setCacheBuster(Date.now());
        }
    }, [profile.preview_url, isTesting]);

    const uploadFiles = async (files: FileList | File[]) => {
        const formData = new FormData();
        Array.from(files).forEach(f => formData.append('files', f));
        
        try {
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/samples/upload`, {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                onRefresh();
            }
        } catch (err) {
            console.error('Failed to upload samples', err);
        }
    };

    const handleRebuild = async () => {
        try {
            await onBuildNow(profile.name, [], profile.speaker_id || undefined, profile.variant_name || undefined);
        } catch (err) {
            console.error('Failed to rebuild', err);
        }
    };

    const handlePlayClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!profile.preview_url) {
            onTest(profile.name);
            return;
        }

        if (playingSample) {
            sampleAudioRef.current?.pause();
            setPlayingSample(null);
        }

        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
        }
    };

    const handlePlaySample = (s: string) => {
        if (playingSample === s) {
            sampleAudioRef.current?.pause();
            setPlayingSample(null);
            return;
        }

        if (isPlaying) {
            audioRef.current?.pause();
            setIsPlaying(false);
        }

        setPlayingSample(s);
        if (sampleAudioRef.current) {
            sampleAudioRef.current.src = `/out/voices/${encodeURIComponent(profile.name)}/${encodeURIComponent(s)}?t=${Date.now()}`;
            sampleAudioRef.current.play().catch(err => {
                console.error("Playback failed", err);
                setPlayingSample(null);
            });
        }
    };

    const handleSpeedChange = async (val: number) => {
        try {
            const formData = new URLSearchParams();
            formData.append('speed', val.toString());
            await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/speed`, {
                method: 'POST',
                body: formData
            });
            onRefresh();
        } catch (e) {
            console.error('Failed to update profile speed', e);
        } finally {
            setLocalSpeed(null);
        }
    };

    const [showSpeedPopover, setShowSpeedPopover] = useState(false);
    const [isSamplesExpanded, setIsSamplesExpanded] = useState(profile.wav_count === 0 || (profile.samples && profile.samples.length === 0));
    const [isRebuildRequired, setIsRebuildRequired] = useState(profile.is_rebuild_required || false);
    
    useEffect(() => {
        setIsRebuildRequired(profile.is_rebuild_required || false);
    }, [profile.is_rebuild_required, profile.name]);

    useEffect(() => {
        if (profile.wav_count === 0) {
            setIsSamplesExpanded(true);
        }
    }, [profile.wav_count, profile.name]);

    const renderControls = () => (
        <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div 
                onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files?.length) {
                        uploadFiles(e.dataTransfer.files);
                    }
                }}
                style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    border: isDragging ? '1px solid var(--accent)' : '1px solid var(--border-light)', 
                    borderRadius: '12px', 
                    background: isDragging ? 'rgba(var(--accent-rgb), 0.05)' : 'var(--surface-light)', 
                    overflow: 'hidden',
                    position: 'relative',
                    transition: 'all 0.2s'
                }}
            >
                {isDragging && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(var(--accent-rgb), 0.08)',
                        backdropFilter: 'blur(2px)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        zIndex: 10,
                        pointerEvents: 'none',
                        border: '2px dashed var(--accent)',
                        borderRadius: '12px'
                    }}>
                        <Upload size={24} color="var(--accent)" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)' }}>Drop Samples to Add</span>
                    </div>
                )}

                <div 
                    style={{
                        width: '100%',
                        padding: '10px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'none',
                        border: 'none',
                        transition: 'background 0.2s',
                        userSelect: 'none',
                        gap: '12px'
                    }}
                >
                    <div 
                        onClick={() => setIsSamplesExpanded(!isSamplesExpanded)}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            color: 'var(--text-secondary)', 
                            flex: 1,
                            cursor: 'pointer',
                            height: '100%',
                            padding: '4px 0'
                        }}
                    >
                        <Music size={14} className="text-accent" />
                        <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Samples ({profile.samples?.length || 0})</span>
                        {isRebuildRequired && <AlertTriangle size={12} className="text-warning" />}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                            type="file" 
                            multiple 
                            accept=".wav" 
                            onChange={(e) => {
                                if (e.target.files) uploadFiles(e.target.files);
                            }} 
                            style={{ display: 'none' }} 
                            id={`file-input-${profile.name.replace(/\s+/g, '-')}`}
                        />
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                document.getElementById(`file-input-${profile.name.replace(/\s+/g, '-')}`)?.click();
                            }}
                            className="btn-ghost" 
                            title="Add Samples Manually" 
                            style={{ 
                                padding: '4px', 
                                height: '28px', 
                                width: '28px', 
                                borderRadius: '8px', 
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s ease',
                                color: 'var(--accent)'
                            }}
                        >
                            <Plus size={16} />
                        </button>
                        
                        <div 
                            onClick={() => setIsSamplesExpanded(!isSamplesExpanded)}
                            style={{ 
                                padding: '6px', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'transform 0.2s'
                            }}
                        >
                            <ChevronUp 
                                size={16} 
                                style={{ 
                                    transform: isSamplesExpanded ? 'none' : 'rotate(180deg)', 
                                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    color: 'var(--text-muted)'
                                }} 
                            />
                        </div>
                    </div>
                </div>

                <AnimatePresence>
                    {isSamplesExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div style={{ padding: '0 16px 16px', position: 'relative', minHeight: '40px' }}>
                                {profile.samples_detailed && profile.samples_detailed.length > 0 ? (
                                    <>
                                        {profile.samples_detailed.map((s, idx) => (
                                            <div 
                                                key={idx} 
                                                className="sample-row" 
                                                onMouseEnter={() => setHoveredSampleIdx(idx)}
                                                onMouseLeave={() => setHoveredSampleIdx(null)}
                                                style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'space-between',
                                                    fontSize: '0.8rem',
                                                    padding: '6px 10px',
                                                    borderRadius: '6px',
                                                    background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                                    transition: 'background 0.2s',
                                                    ...(s.is_new ? {
                                                        background: 'rgba(var(--accent-rgb), 0.05)',
                                                        border: '1px dashed var(--accent-glow)'
                                                    } : {})
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, overflow: 'hidden' }}>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handlePlaySample(s.name);
                                                        }}
                                                        className="btn-ghost"
                                                        style={{
                                                            padding: 0,
                                                            width: '24px',
                                                            height: '24px',
                                                            borderRadius: '6px',
                                                            background: playingSample === s.name ? 'var(--accent-glow)' : 'rgba(255,255,255,0.05)',
                                                            border: playingSample === s.name ? '1px solid var(--accent)' : '1px solid var(--border-light)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            color: playingSample === s.name ? 'var(--accent)' : 'var(--text-muted)',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {playingSample === s.name ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                                                    </button>

                                                    {s.is_new && (
                                                        <span style={{ color: 'var(--accent)', fontSize: '0.65rem', fontWeight: 700, background: 'rgba(var(--accent-rgb), 0.1)', padding: '2px 4px', borderRadius: '4px' }}>NEW</span>
                                                    )}
                                                    <span style={{ color: 'var(--text-primary)', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {s.name}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>WAV</span>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            requestConfirm({
                                                                title: 'Remove Sample',
                                                                message: `Are you sure you want to remove "${s.name}"? A voice rebuild will be required to apply this change.`,
                                                                isDestructive: true,
                                                                onConfirm: async () => {
                                                                    try {
                                                                        const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/samples/${encodeURIComponent(s.name)}`, {
                                                                            method: 'DELETE'
                                                                        });
                                                                        if (resp.ok) {
                                                                            onRefresh();
                                                                        }
                                                                    } catch (err) {
                                                                        console.error('Failed to remove sample', err);
                                                                    }
                                                                }
                                                            });
                                                        }}
                                                        className="btn-ghost"
                                                        style={{ 
                                                            padding: '4px', 
                                                            borderRadius: '4px', 
                                                            color: 'var(--text-muted)', 
                                                            opacity: hoveredSampleIdx === idx ? 1 : 0,
                                                            pointerEvents: hoveredSampleIdx === idx ? 'auto' : 'none',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                ) : (
                                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                        No samples yet. Drag and drop samples here to start building the voice.
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );

    return (
        <div className={showControlsInline ? "" : "glass-panel animate-in"} style={showControlsInline ? {} : { padding: '0', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {profile.preview_url && (
                <audio 
                    ref={audioRef}
                    src={`${profile.preview_url}?t=${cacheBuster}`}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                />
            )}
            <audio 
                ref={sampleAudioRef}
                onPlay={() => setPlayingSample(playingSample)} 
                onPause={() => setPlayingSample(null)}
                onEnded={() => setPlayingSample(null)}
            />

            <div 
                style={{ 
                    padding: '0.75rem 1.25rem',
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    borderBottom: profile.wav_count > 0 ? '1px solid var(--border-light)' : 'none',
                    transition: 'border-bottom 0.2s',
                    background: 'rgba(var(--accent-rgb), 0.02)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <div style={{ flexShrink: 0 }}>
                        <button 
                            onClick={handlePlayClick}
                            className="btn-ghost"
                            title={profile.preview_url ? (isPlaying ? "Pause Sample" : "Play Sample") : "Generate Sample"}
                            style={{ 
                                width: '40px', 
                                height: '40px', 
                                padding: 0,
                                borderRadius: '12px',
                                background: isPlaying ? 'var(--accent)' : 'var(--surface)',
                                color: isPlaying ? 'white' : 'var(--text-primary)',
                                border: isPlaying ? '1px solid var(--accent)' : '1px solid var(--border)',
                                position: 'relative',
                                overflow: 'hidden',
                                boxShadow: isPlaying ? '0 0 0 3px rgba(var(--accent-rgb), 0.2)' : 'var(--shadow-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {isTesting ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : isPlaying ? (
                                <Pause size={18} fill="currentColor" style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                            ) : (
                                <Play size={18} fill="currentColor" style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                            )}
                            {isPlaying && (
                                <motion.div
                                    layoutId="playing-pulse"
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        border: '2px solid white',
                                        borderRadius: '12px',
                                        opacity: 0.3
                                    }}
                                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                />
                            )}
                        </button>
                    </div>

                    <div style={{ width: '1px', height: '24px', background: 'var(--border)', opacity: 0.5, margin: '0 4px' }} />

                    <button
                        ref={speedPillRef}
                        onClick={() => setShowSpeedPopover(!showSpeedPopover)}
                        className="btn-ghost"
                        style={{
                            padding: '4px 10px',
                            height: '32px',
                            borderRadius: '100px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            gap: '6px',
                            color: 'var(--text-primary)',
                            minWidth: '70px',
                            justifyContent: 'center',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <Sliders size={12} style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                        {speed.toFixed(2)}x
                    </button>

                    {showSpeedPopover && (
                        <SpeedPopover
                            value={speed}
                            onChange={(v: number) => {
                                setLocalSpeed(v);
                                handleSpeedChange(v);
                            }}
                            triggerRef={speedPillRef}
                            onClose={() => setShowSpeedPopover(false)}
                        />
                    )}

                    <button 
                        onClick={() => onEditTestText(profile)}
                        className="btn-ghost"
                        title="Edit Preview Script"
                        style={{ padding: '8px 12px', height: '36px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <FileEdit size={16} />
                        Script
                    </button>
                    
                    <button 
                        disabled={isBuilding || isTesting}
                        className={isRebuildRequired ? "btn-primary" : "btn-ghost"}
                        onClick={(e) => { e.stopPropagation(); handleRebuild(); }} 
                        title="Rebuild Voice Model"
                        style={{ 
                            padding: '8px 12px', 
                            height: '36px', 
                            borderRadius: '10px', 
                            fontSize: '0.85rem', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            ...(isRebuildRequired ? {} : {background: 'var(--surface)', border: '1px solid var(--border)'}),
                            minWidth: '110px',
                            justifyContent: 'center'
                        }}
                    >
                        {isBuilding ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Rebuilding...
                            </>
                        ) : isTesting ? (
                            <>
                                <RefreshCw size={16} className="animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <RefreshCw size={16} />
                                Rebuild
                            </>
                        )}
                    </button>
                </div>
            </div>

            {isTesting && (
                <div style={{ padding: showControlsInline ? '0 0 1.25rem' : '1.25rem' }}>
                    <div style={{ height: '4px', background: 'var(--border-light)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${testStatus?.progress || 0}%`, background: 'var(--accent)', transition: 'width 0.3s ease' }} />
                    </div>
                </div>
            )}

            {renderControls()}

            <div style={{ 
                padding: '1.25rem', 
                borderTop: '1px solid var(--border-light)', 
                background: 'rgba(239, 68, 68, 0.02)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderRadius: '0 0 16px 16px'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>Advanced Actions</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Move this variant to another voice or delete it.</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        onClick={() => onMoveVariant(profile)}
                        className="btn-ghost"
                        style={{ gap: '6px', fontSize: '0.8rem', padding: '0 12px', height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }}
                    >
                        <RefreshCw size={14} />
                        Move Variant
                    </button>
                    <button 
                        onClick={() => {
                            requestConfirm({
                                title: 'Delete variant?',
                                message: `Delete variant '${profile.variant_name || 'Default'}' from '${voiceName}'? This cannot be undone.`,
                                isDestructive: true,
                                onConfirm: () => onDeleteVariant(profile.name)
                            });
                        }}
                        className="btn-ghost"
                        style={{ color: 'var(--text-muted)', gap: '6px', fontSize: '0.8rem', padding: '0 12px', height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }}
                    >
                        <Trash2 size={14} />
                        Delete Variant
                    </button>
                </div>
            </div>
        </div>
    );
};
