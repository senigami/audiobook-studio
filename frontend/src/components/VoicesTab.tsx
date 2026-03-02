import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { User, Plus, Music, Trash2, Play, Loader2, Info, RefreshCw, FileEdit, X, RotateCcw, ChevronUp, Sliders, Pause, Upload, AlertTriangle, Search, Star } from 'lucide-react';
import { RecordingGuide } from './RecordingGuide';
import { ConfirmModal } from './ConfirmModal';
import { ActionMenu } from './ActionMenu';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { GlassInput } from './GlassInput';

// --- Components ---

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, title, children }) => {
    const [width, setWidth] = useState(450);
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing) {
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth >= 380 && newWidth <= window.innerWidth * 0.9) {
                setWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(15, 23, 42, 0.4)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 2000
                        }}
                    />
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        style={{
                            position: 'fixed',
                            top: 0,
                            right: 0,
                            bottom: 0,
                            width: `${width}px`,
                            maxWidth: '95vw',
                            background: 'var(--surface)',
                            boxShadow: '-10px 0 30px rgba(0,0,0,0.1)',
                            zIndex: 2001,
                            display: 'flex',
                            flexDirection: 'column',
                            borderLeft: '1px solid var(--border)',
                            userSelect: isResizing ? 'none' : 'auto'
                        }}
                    >
                        {/* Resize Handle */}
                        <div
                            onMouseDown={startResizing}
                            className="resize-handle"
                            style={{
                                position: 'absolute',
                                left: -6,
                                top: 0,
                                bottom: 0,
                                width: '12px',
                                cursor: 'ew-resize',
                                zIndex: 2002,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '3px',
                                padding: '8px 2px',
                                background: isResizing ? 'var(--accent)' : 'var(--surface-alt)',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                                boxShadow: isResizing ? '0 0 10px var(--accent-glow)' : '0 2px 4px rgba(0,0,0,0.1)',
                                transition: 'all 0.2s ease',
                                opacity: isResizing ? 1 : 0.8
                            }}>
                                {[1, 2, 3].map(i => (
                                    <div key={i} style={{
                                        width: '2px',
                                        height: '2px',
                                        borderRadius: '50%',
                                        background: isResizing ? 'white' : 'var(--text-muted)'
                                    }} />
                                ))}
                            </div>
                        </div>

                        <div style={{
                            padding: '1.5rem',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'var(--surface-light)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div className="icon-circle" style={{ width: '32px', height: '32px' }}>
                                    <FileEdit size={16} />
                                </div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{title}</h3>
                            </div>
                            <button onClick={onClose} className="btn-ghost" style={{ padding: '8px' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                            {children}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
};

interface SpeedPopoverProps {
    value: number;
    onChange: (val: number) => void;
    triggerRef: React.RefObject<any>;
    onClose: () => void;
}

const SpeedPopover: React.FC<SpeedPopoverProps> = ({ value, onChange, triggerRef, onClose }) => {
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const [isAbove, setIsAbove] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const popoverWidth = 240;
        const popoverHeight = 160;

        let top = rect.bottom + window.scrollY + 8;
        let left = rect.left + window.scrollX - (popoverWidth / 2) + (rect.width / 2);
        let above = false;

        if (rect.bottom + popoverHeight > window.innerHeight) {
            top = rect.top + window.scrollY - popoverHeight - 8;
            above = true;
        }

        if (left < 10) left = 10;
        if (left + popoverWidth > window.innerWidth - 10) left = window.innerWidth - popoverWidth - 10;

        setCoords({ top, left });
        setIsAbove(above);
    }, [triggerRef]);

    useLayoutEffect(() => {
        updatePosition();
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [updatePosition]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (triggerRef.current?.contains(e.target as Node)) return;
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose, triggerRef]);

    const presets = [0.85, 1.0, 1.1, 1.25];

    return createPortal(
        <AnimatePresence>
            <motion.div
                ref={popoverRef}
                initial={{ opacity: 0, scale: 0.95, y: isAbove ? 10 : -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: isAbove ? 10 : -10 }}
                style={{
                    position: 'absolute',
                    top: coords.top,
                    left: coords.left,
                    width: '240px',
                    background: 'var(--surface-light)',
                    borderRadius: '16px',
                    boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--border)',
                    padding: '1.25rem',
                    zIndex: 99999,
                    backdropFilter: 'blur(20px)',
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Speed Adjustment</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'monospace' }}>{value.toFixed(2)}x</span>
                    </div>

                    <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.01"
                        value={value}
                        onChange={(e) => onChange(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />

                    <div style={{ display: 'flex', gap: '6px' }}>
                        {presets.map(p => (
                            <button
                                key={p}
                                onClick={() => onChange(p)}
                                className="btn-ghost"
                                style={{
                                    flex: 1,
                                    fontSize: '0.7rem',
                                    padding: '4px 0',
                                    borderRadius: '6px',
                                    background: Math.abs(value - p) < 0.01 ? 'var(--accent-glow)' : 'var(--surface)',
                                    color: Math.abs(value - p) < 0.01 ? 'var(--accent)' : 'var(--text-secondary)',
                                    border: '1px solid',
                                    borderColor: Math.abs(value - p) < 0.01 ? 'var(--accent)' : 'var(--border-light)'
                                }}
                            >
                                {p.toFixed(2)}x
                            </button>
                        ))}
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};

interface SpeakerProfile {
    name: string;
    wav_count: number;
    samples?: string[];
    speed: number;
    is_default: boolean;
    test_text?: string;
    preview_url: string | null;
    speaker_id?: string;
    variant_name?: string;
}

interface Speaker {
    id: string;
    name: string;
    default_profile_name: string | null;
}

interface ProfileDetailsProps {
    profile: SpeakerProfile;
    isTesting: boolean;
    testStatus?: any;
    onTest: (name: string) => void;
    onDeleteVariant: (name: string) => void;
    onRefresh: () => void;
    onEditTestText: (profile: SpeakerProfile) => void;
    onBuildNow: (name: string, files: File[]) => void;
    requestConfirm: (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean }) => void;
    voiceName: string;
    showControlsInline?: boolean;
}

const ProfileDetails: React.FC<ProfileDetailsProps> = ({ 
    profile, isTesting, onTest, onDeleteVariant, onRefresh, 
    onEditTestText, onBuildNow, requestConfirm, testStatus,
    voiceName, showControlsInline = false
}) => {
    const [localSpeed, setLocalSpeed] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [cacheBuster, setCacheBuster] = useState(Date.now());
    const [isPlaying, setIsPlaying] = useState(false);
    const [playingSample, setPlayingSample] = useState<string | null>(null);
    const [isRebuildRequired, setIsRebuildRequired] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const sampleAudioRef = useRef<HTMLAudioElement>(null);
    const speed = localSpeed ?? profile.speed;

    const [isDragging, setIsDragging] = useState(false);
    const [pendingSamples, setPendingSamples] = useState<File[]>([]);


    useEffect(() => {
        if (profile.preview_url) {
            setCacheBuster(Date.now());
        }
    }, [profile.preview_url, isTesting]);


    const uploadFiles = async (files: FileList | File[]) => {
        const fileList = Array.from(files);
        setPendingSamples(prev => [...prev, ...fileList]);
        setIsRebuildRequired(true);
    };

    const handleRebuild = async () => {
        if (pendingSamples.length > 0) {
            onBuildNow(profile.name, pendingSamples);
            setPendingSamples([]);
            setIsRebuildRequired(false);
        } else {
            onBuildNow(profile.name, []);
            setIsRebuildRequired(false);
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
        setIsSaving(true);
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
            setIsSaving(false);
            setLocalSpeed(null);
        }
    };

    const [showSpeedPopover, setShowSpeedPopover] = useState(false);
    const [isSamplesExpanded, setIsSamplesExpanded] = useState(profile.wav_count === 0);
    const speedPillRef = useRef<HTMLButtonElement>(null);

    // Auto-expand if no samples, auto-collapse if samples exist
    useEffect(() => {
        setIsSamplesExpanded(profile.wav_count === 0);
    }, [profile.wav_count, profile.name]);


    const renderControls = () => (
        <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Collapsible Samples Section */}
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
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
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
                            onMouseDown={(e) => e.stopPropagation()}
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
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.15)';
                                e.currentTarget.style.borderColor = 'var(--accent)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                                e.currentTarget.style.borderColor = 'var(--border)';
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
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.1)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
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
                            <div style={{ 
                                padding: '0 16px 16px',
                                position: 'relative',
                                minHeight: '40px'
                            }}>

                    {profile.samples && profile.samples.length > 0 ? (
                        <>
                            {profile.samples.map((s, idx) => (
                                <div key={idx} className="sample-row" style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between',
                                    fontSize: '0.8rem',
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                    transition: 'background 0.2s'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, overflow: 'hidden' }}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePlaySample(s);
                                            }}
                                            className="btn-ghost"
                                            style={{
                                                padding: 0,
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '6px',
                                                background: playingSample === s ? 'var(--accent-glow)' : 'rgba(255,255,255,0.05)',
                                                border: playingSample === s ? '1px solid var(--accent)' : '1px solid var(--border-light)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: playingSample === s ? 'var(--accent)' : 'var(--text-muted)',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (playingSample !== s) {
                                                    e.currentTarget.style.borderColor = 'var(--accent)';
                                                    e.currentTarget.style.color = 'var(--accent)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (playingSample !== s) {
                                                    e.currentTarget.style.borderColor = 'var(--border-light)';
                                                    e.currentTarget.style.color = 'var(--text-muted)';
                                                }
                                            }}
                                        >
                                            {playingSample === s ? (
                                                <Pause size={12} fill="currentColor" />
                                            ) : (
                                                <Play size={12} fill="currentColor" />
                                            )}
                                        </button>
                                        <span style={{ color: 'var(--text-primary)', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {s}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>WAV</span>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            requestConfirm({
                                                title: 'Remove Sample',
                                                message: `Are you sure you want to remove "${s}"? A voice rebuild will be required to apply this change.`,
                                                isDestructive: true,
                                                onConfirm: async () => {
                                                    try {
                                                        const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/samples/${encodeURIComponent(s)}`, {
                                                            method: 'DELETE'
                                                        });
                                                        if (resp.ok) {
                                                            onRefresh();
                                                            setIsRebuildRequired(true);
                                                        }
                                                    } catch (err) {
                                                        console.error('Failed to remove sample', err);
                                                    }
                                                }
                                            });
                                        }}
                                        className="sample-remove-btn"
                                        style={{ padding: '4px', height: 'auto' }}
                                        title="Remove Sample"
                                    >
                                        <X size={12} />
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
                    
                    {pendingSamples.map((file, pIdx) => (
                        <div key={`pending-${pIdx}`} className="sample-row" style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            fontSize: '0.8rem',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: 'rgba(var(--accent-rgb), 0.05)',
                            border: '1px dashed var(--accent-glow)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                                <span style={{ color: 'var(--accent)', fontSize: '0.65rem', fontWeight: 700 }}>NEW</span>
                                <span style={{ color: 'var(--text-primary)', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {file.name}
                                </span>
                            </div>
                            <button
                                onClick={() => setPendingSamples(prev => prev.filter((_, i) => i !== pIdx))}
                                className="sample-remove-btn"
                                style={{ padding: '4px', height: 'auto' }}
                                title="Remove pending sample"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
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
                    borderBottom: (profile.wav_count > 0 || pendingSamples.length > 0) ? '1px solid var(--border-light)' : 'none',
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
                            onMouseEnter={(e) => {
                                if (!isPlaying) {
                                    e.currentTarget.style.borderColor = 'var(--accent)';
                                    e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.02)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isPlaying) {
                                    e.currentTarget.style.borderColor = 'var(--border)';
                                    e.currentTarget.style.background = 'var(--surface)';
                                }
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

                    {/* Speed Pill */}
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
                            color: 'var(--accent)',
                            minWidth: '70px',
                            justifyContent: 'center',
                            display: 'flex',
                            alignItems: 'center'
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
                        onClick={handleRebuild}
                        disabled={isSaving}
                        className={isRebuildRequired ? "btn-primary" : "btn-ghost"}
                        title="Rebuild Voice Model"
                        style={{ padding: '8px 12px', height: '36px', borderRadius: '10px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', ...(isRebuildRequired ? {} : {background: 'var(--surface)', border: '1px solid var(--border)'}) }}
                    >
                        <RefreshCw size={16} className={isSaving ? "animate-spin" : ""} />
                        Rebuild
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button 
                        className="btn-ghost"
                        style={{ width: '32px', height: '32px', padding: 0 }}
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            requestConfirm({
                                title: 'Delete variant?',
                                message: `Delete variant '${profile.variant_name || 'Default'}' from '${voiceName}'? This cannot be undone.`,
                                isDestructive: true,
                                onConfirm: () => onDeleteVariant(profile.name)
                            });
                        }}
                        title="Delete variant"
                    >
                        <Trash2 size={16} color="var(--error)" style={{ width: '16px', height: '16px', flexShrink: 0 }} />
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
        </div>
    );
};

interface VoiceCardProps {
    speaker: Speaker;
    profiles: SpeakerProfile[];
    isTestingProfileId: string | null;
    testProgress: Record<string, any>;
    onTest: (name: string) => void;
    onDelete: (name: string) => void;
    onRefresh: () => void;
    onEditTestText: (profile: SpeakerProfile) => void;
    onBuildNow: (name: string, files: File[]) => void;
    requestConfirm: (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean }) => void;
    onAddVariantClick: (speaker: Speaker, profileCount: number) => void;
    onRenameClick: (speaker: Speaker) => void;
    onSetDefaultClick: (profileName: string) => void;
    isExpanded: boolean;
    onToggleExpand: () => void;
}
const VoiceCard: React.FC<VoiceCardProps> = ({
    speaker, profiles, isTestingProfileId, testProgress, 
    onTest, onDelete, onRefresh,
    onEditTestText, onBuildNow, requestConfirm,
    onAddVariantClick, onRenameClick, onSetDefaultClick, isExpanded, onToggleExpand
}) => {
    const defaultProfile = profiles.find(p => p.is_default) || profiles[0] || { name: '', speed: 1.0, wav_count: 0 } as SpeakerProfile;
    const [activeProfileId, setActiveProfileId] = useState(defaultProfile?.name || '');
    const [hoveredProfileId, setHoveredProfileId] = useState<string | null>(null);

    const activeProfile = profiles.find(p => p.name === activeProfileId) || defaultProfile;

    const handleAddVariant = () => onAddVariantClick(speaker, profiles.length);

    const getStatusInfo = (p: SpeakerProfile | undefined) => {
        if (!p || p.wav_count === 0) return { label: 'NO SAMPLES', color: 'var(--text-muted)', bg: 'var(--surface-alt)' };
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
                        {profiles.some(p => p.wav_count === 0) && (
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
                                disabled: profiles.find(p => p.name === activeProfileId)?.is_default,
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
                                        fetch(`/api/speakers/${speaker.id}`, { method: 'DELETE' })
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
                        <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(var(--accent-rgb), 0.02)', borderTop: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto' }}>
                                {profiles.map(p => {
                                    const isActive = activeProfileId === p.name;
                                    return (
                                        <button
                                            key={p.name}
                                            onClick={() => {
                                                setActiveProfileId(p.name);
                                                if (!isExpanded) onToggleExpand(); // Expand if not already expanded
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
                                    className="btn-ghost"
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: '100px',
                                        fontSize: '0.8rem',
                                        fontWeight: 800,
                                        color: 'var(--accent)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: 'rgba(var(--accent-rgb), 0.05)',
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
                                <ProfileDetails
                                    profile={activeProfile as SpeakerProfile}
                                    isTesting={isTestingProfileId === activeProfile?.name}
                                    testStatus={testProgress[activeProfile?.name || '']}
                                    onTest={onTest}
                                    onDeleteVariant={onDelete}
                                    onRefresh={onRefresh}
                                    onEditTestText={onEditTestText}
                                    onBuildNow={onBuildNow}
                                    requestConfirm={requestConfirm}
                                    voiceName={speaker.name}
                                    showControlsInline={true}
                                />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

interface VoicesTabProps {
    onRefresh: () => void;
    speakerProfiles: SpeakerProfile[];
    testProgress: Record<string, { progress: number; started_at?: number }>;
}

export const VoicesTab: React.FC<VoicesTabProps> = ({ onRefresh, speakerProfiles, testProgress }) => {
    // --- State ---
    const [testingProfile, setTestingProfile] = useState<string | null>(null);
    const [editingProfile, setEditingProfile] = useState<SpeakerProfile | null>(null);
    const [testText, setTestText] = useState('');
    const [variantName, setVariantName] = useState('');
    const [isSavingText, setIsSavingText] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState<{ 
        title: string; 
        message: string; 
        onConfirm: () => void; 
        isDestructive?: boolean 
    } | null>(null);
    
    // Sync state with editing profile
    useEffect(() => {
        if (editingProfile) {
            setTestText(editingProfile.test_text || '');
            setVariantName(editingProfile.variant_name || editingProfile.name);
        } else {
            setTestText('');
            setVariantName('');
        }
    }, [editingProfile]);

    // --- Voice Management State ---
    const [speakers, setSpeakers] = useState<Speaker[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAddVariantModalOpen, setIsAddVariantModalOpen] = useState(false);
    const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
    const [renameSpeakerId, setRenameSpeakerId] = useState<string | null>(null);
    const [originalSpeakerName, setOriginalSpeakerName] = useState('');
    const [addVariantSpeaker, setAddVariantSpeaker] = useState<{ speaker: Speaker, nextVariantNum: number } | null>(null);
    const [newVoiceName, setNewVoiceName] = useState('');
    const [newSpeakerName, setNewSpeakerName] = useState('');
    const [newVariantNameModal, setNewVariantNameModal] = useState('');
    const [isCreatingVoice, setIsCreatingVoice] = useState(false);
    const [isAddingVariantModal, setIsAddingVariantModal] = useState(false);
    const [isRenamingSpeaker, setIsRenamingSpeaker] = useState(false);
    const [expandedVoiceId, setExpandedVoiceId] = useState<string | null>(null);

    const fetchSpeakers = useCallback(async () => {
        try {
            const resp = await fetch('/api/speakers');
            if (resp.ok) {
                const data = await resp.json();
                if (Array.isArray(data)) {
                    setSpeakers(data);
                }
            }
        } catch (e) {
            console.error('Failed to fetch speakers', e);
        }
    }, []);

    const handleSetDefault = async (profileName: string) => {
        try {
            const formData = new URLSearchParams();
            formData.append('name', profileName);
            const resp = await fetch('/api/settings/default-speaker', {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                fetchSpeakers();
            }
        } catch (error) {
            console.error('Failed to set default voice:', error);
        }
    };

    useEffect(() => {
        fetchSpeakers();
    }, [fetchSpeakers, speakerProfiles]); // Also refresh when props change

    const handleBuildNow = useCallback(async (name: string, newFiles: File[]) => {
        const formData = new FormData();
        formData.append('name', name);
        newFiles.forEach(f => formData.append('files', f));
        
        try {
            const resp = await fetch('/api/speaker-profiles/build', {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                onRefresh();
                fetchSpeakers();
            } else {
                const err = await resp.json();
                alert(`Rebuild failed: ${err.message}`);
            }
        } catch (e) {
            console.error('Rebuild failed', e);
        }
    }, [onRefresh, fetchSpeakers]);

    const handleSaveTestText = async () => {
        if (!editingProfile) return;
        setIsSavingText(true);
        try {
            const formData = new URLSearchParams();
            formData.append('text', testText);
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(editingProfile.name)}/test-text`, {
                method: 'POST',
                body: formData
            });
            
            if (resp.ok) {
                // Also handle name change if different
                const currentName = editingProfile.variant_name || editingProfile.name;
                if (variantName && variantName !== currentName) {
                    const renameForm = new URLSearchParams();
                    renameForm.append('new_name', variantName);
                    await fetch(`/api/speaker-profiles/${encodeURIComponent(editingProfile.name)}/rename`, {
                        method: 'POST',
                        body: renameForm
                    });
                }
                setEditingProfile(null);
                onRefresh();
            }
        } catch (e) {
            console.error('Failed to save profile', e);
        } finally {
            setIsSavingText(false);
        }
    };

    const handleResetTestText = async () => {
        if (!editingProfile) return;
        setIsSavingText(true);
        try {
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(editingProfile.name)}/reset-test-text`, {
                method: 'POST'
            });
            const result = await resp.json();
            if (result.status === 'success') {
                setTestText(result.test_text);
                onRefresh();
            }
        } catch (e) {
            console.error('Failed to reset test text', e);
        } finally {
            setIsSavingText(false);
        }
    };

    const handleDelete = async (name: string) => {
        try {
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(name)}`, {
                method: 'DELETE',
            });
            if (resp.ok) onRefresh();
        } catch (err) {
            console.error('Failed to delete profile', err);
        }
    };

    const handleTest = async (name: string) => {
        setTestingProfile(name);
        try {
            const resp = await fetch('/api/speaker-profiles/test', {
                method: 'POST',
                body: new URLSearchParams({ name }),
            });
            const result = await resp.json();
            if (result.status === 'success') {
                onRefresh();
            } else {
                alert(result.message);
            }
        } catch (err) {
            console.error('Test failed', err);
        } finally {
            setTestingProfile(null);
        }
    };


    const handleRequestConfirm = (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean }) => {
        setConfirmConfig(config);
    };

    // --- Data Processing ---
    // Merge speakers and profiles into a unified Voice concept
    const voices = (speakers || []).map(speaker => {
        const pList = speakerProfiles.filter(p => p.speaker_id === speaker.id);
        // If no profiles, synthesize an initial "Default" profile to allow the user to add samples
        if (pList.length === 0) {
            pList.push({
                name: speaker.name,
                speaker_id: speaker.id,
                variant_name: 'Default',
                wav_count: 0,
                speed: 1.0,
                is_default: true,
                preview_url: null,
                wav_files: []
            } as SpeakerProfile);
        }
        return {
            id: speaker.id,
            name: speaker.name,
            profiles: pList
        };
    });

    // Identify profiles that aren't linked to any speaker
    const unassigned = speakerProfiles.filter(p => !p.speaker_id || !speakers.some(s => s.id === p.speaker_id));
    
    // Treat unassigned as standalone voices for now to bridge the transition
    const unassignedVoices = unassigned.map(p => ({
        id: `unassigned-${p.name}`,
        name: p.name,
        profiles: [p],
        isUnassigned: true
    }));

    const allVoices = [...voices, ...unassignedVoices];

    const filteredVoices = allVoices.filter(v => {
        const query = searchQuery.toLowerCase();
        return v.name.toLowerCase().includes(query) || 
               v.profiles.some(p => (p.variant_name || p.name).toLowerCase().includes(query));
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            {/* Header with Search and New Voice Action */}
            <div style={{ 
                padding: '1.25rem 2rem', 
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--surface-light)',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Voices</h2>
                    
                    <div style={{ position: 'relative' }}>
                        <GlassInput
                            icon={<Search size={16} />}
                            placeholder="Search voices..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '240px',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                            onFocus={(e) => {
                                e.currentTarget.style.width = '320px';
                            }}
                            onBlur={(e) => {
                                e.currentTarget.style.width = '240px';
                            }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button 
                        onClick={() => setIsCreateModalOpen(true)} 
                        className="btn-primary" 
                        style={{ gap: '8px', padding: '0 20px', height: '40px', borderRadius: '100px' }}
                    >
                        <Plus size={18} />
                        New Voice
                    </button>
                    
                    <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 8px' }} />
                    
                    <button onClick={() => setShowGuide(true)} className="btn-ghost" style={{ gap: '8px' }}>
                        <Info size={16} />
                        Recording Guide
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {allVoices.length === 0 ? (
                        <div style={{ 
                            padding: '60px', 
                            textAlign: 'center', 
                            background: 'rgba(var(--accent-rgb), 0.02)', 
                            borderRadius: '24px', 
                            border: '2px dashed var(--border)' 
                        }}>
                            <div style={{ 
                                width: '64px', 
                                height: '64px', 
                                borderRadius: '20px', 
                                background: 'var(--surface-alt)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                margin: '0 auto 20px',
                                color: 'var(--text-muted)'
                            }}>
                                <User size={32} />
                            </div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>No Voices Yet</h3>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '300px', margin: '0 auto 24px' }}>
                                Create your first voice to start generating premium AI audio.
                            </p>
                            <button 
                                onClick={() => setIsCreateModalOpen(true)}
                                className="btn-primary" 
                                style={{ gap: '8px', padding: '0 24px', height: '44px', borderRadius: '12px' }}
                            >
                                <Plus size={20} />
                                Create New Voice
                            </button>
                        </div>
                    ) : filteredVoices.length === 0 ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Search size={48} style={{ opacity: 0.2, marginBottom: '20px' }} />
                            <h3 style={{ margin: '0 0 10px', fontSize: '1.25rem' }}>No Matches Found</h3>
                            <p style={{ margin: 0 }}>Try adjusting your search query.</p>
                        </div>
                    ) : (
                        <>
                            {filteredVoices.map(voice => (
                                <VoiceCard
                                    key={voice.id}
                                    speaker={{ id: voice.id.startsWith('unassigned-') ? '' : voice.id, name: voice.name, default_profile_name: voice.profiles[0]?.name || null }}
                                    profiles={voice.profiles}
                                    onRefresh={onRefresh}
                                    onTest={handleTest}
                                    onDelete={handleDelete}
                                    onEditTestText={(p) => setEditingProfile(p)}
                                    onBuildNow={handleBuildNow}
                                    isTestingProfileId={testingProfile}
                                    testProgress={testProgress}
                                    requestConfirm={handleRequestConfirm}
                                    onAddVariantClick={(s, count) => {
                                        setAddVariantSpeaker({ speaker: s, nextVariantNum: count + 1 });
                                        setNewVariantNameModal(`Variant ${count + 1}`);
                                        setIsAddVariantModalOpen(true);
                                    }}
                                    onSetDefaultClick={handleSetDefault}
                                    onRenameClick={(s) => {
                                        setRenameSpeakerId(s.id);
                                        setOriginalSpeakerName(s.name);
                                        setNewSpeakerName(s.name);
                                        setIsRenameModalOpen(true);
                                    }}
                                    isExpanded={expandedVoiceId === voice.id}
                                    onToggleExpand={() => setExpandedVoiceId(expandedVoiceId === voice.id ? null : voice.id)}
                                />
                            ))}
                        </>
                    )}
                </div>
            </div>

            {/* New Voice Modal */}
            {isCreateModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(4px)'
                }}>
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={{
                            width: '400px',
                            background: 'var(--surface)',
                            borderRadius: '24px',
                            padding: '24px',
                            boxShadow: 'var(--shadow-lg)',
                            border: '1px solid var(--border)'
                        }}
                    >
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>Create New Voice</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                            Give your voice a name. You can add variants and audio samples once it's created.
                        </p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>VOICE NAME</label>
                            <GlassInput
                                autoFocus
                                placeholder="e.g. Victor the Vampire"
                                value={newVoiceName}
                                onChange={(e) => setNewVoiceName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newVoiceName.trim()) {
                                        const button = e.currentTarget.closest('div')?.parentElement?.querySelector('button.btn-primary') as HTMLButtonElement;
                                        button?.click();
                                    }
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button 
                                onClick={() => setIsCreateModalOpen(false)}
                                className="btn-ghost"
                                style={{ flex: 1, height: '44px', borderRadius: '12px' }}
                            >
                                Cancel
                            </button>
                            <button 
                                disabled={!newVoiceName.trim() || isCreatingVoice}
                                onClick={async () => {
                                    setIsCreatingVoice(true);
                                    try {
                                        const resp = await fetch('/api/speakers', {
                                            method: 'POST',
                                            body: new URLSearchParams({ name: newVoiceName.trim() })
                                        });
                                        if (resp.ok) {
                                            setIsCreateModalOpen(false);
                                            setNewVoiceName('');
                                            fetchSpeakers();
                                        }
                                    } finally {
                                        setIsCreatingVoice(false);
                                    }
                                }}
                                className="btn-primary"
                                style={{ flex: 1, height: '44px', borderRadius: '12px' }}
                            >
                                {isCreatingVoice ? 'Creating...' : 'Create Voice'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Rename Voice Modal */}
            {isRenameModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(4px)'
                }}>
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={{
                            width: '400px',
                            background: 'var(--surface)',
                            borderRadius: '24px',
                            padding: '24px',
                            boxShadow: 'var(--shadow-lg)',
                            border: '1px solid var(--border)'
                        }}
                    >
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>
                            Rename Voice: <span style={{ color: 'var(--accent)' }}>{originalSpeakerName}</span>
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                            Update the name for this voice. This will also update the prefix for all its variants.
                        </p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>NEW NAME</label>
                            <GlassInput
                                autoFocus
                                placeholder="e.g. Victor the Vampire"
                                value={newSpeakerName}
                                onChange={(e) => setNewSpeakerName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newSpeakerName.trim() && !isRenamingSpeaker) {
                                        const button = e.currentTarget.closest('div')?.parentElement?.querySelector('button.btn-primary') as HTMLButtonElement;
                                        button?.click();
                                    }
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button 
                                onClick={() => setIsRenameModalOpen(false)}
                                className="btn-ghost"
                                style={{ flex: 1, height: '44px', borderRadius: '12px' }}
                            >
                                Cancel
                            </button>
                            <button 
                                disabled={!newSpeakerName.trim() || isRenamingSpeaker}
                                onClick={async () => {
                                    if (!renameSpeakerId) return;
                                    setIsRenamingSpeaker(true);
                                    try {
                                        const formData = new URLSearchParams();
                                        formData.append('id', renameSpeakerId);
                                        formData.append('name', newSpeakerName.trim());
                                        const resp = await fetch('/api/speakers', {
                                            method: 'POST',
                                            body: formData
                                        });
                                        if (resp.ok) {
                                            setIsRenameModalOpen(false);
                                            fetchSpeakers();
                                        } else {
                                            const err = await resp.json();
                                            alert(`Failed to rename voice: ${err.message}`);
                                        }
                                    } finally {
                                        setIsRenamingSpeaker(false);
                                    }
                                }}
                                className="btn-primary"
                                style={{ flex: 1, height: '44px', borderRadius: '12px' }}
                            >
                                {isRenamingSpeaker ? 'Renaming...' : 'Rename Voice'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Add Variant Modal */}
            {isAddVariantModalOpen && addVariantSpeaker && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(4px)'
                }}>
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={{
                            width: '400px',
                            background: 'var(--surface)',
                            borderRadius: '24px',
                            padding: '24px',
                            boxShadow: 'var(--shadow-lg)',
                            border: '1px solid var(--border)'
                        }}
                    >
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>Add Variant</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                            Create a new variant for voice <span style={{ color: 'var(--accent)', fontWeight: 700 }}>"{addVariantSpeaker?.speaker.name}"</span>.
                        </p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>VARIANT NAME</label>
                            <GlassInput
                                autoFocus
                                placeholder={`e.g. Variant ${addVariantSpeaker?.nextVariantNum}`}
                                value={newVariantNameModal}
                                onChange={(e) => setNewVariantNameModal(e.target.value)}
                                onKeyDown={async (e) => {
                                    if (e.key === 'Enter' && newVariantNameModal.trim() && !isAddingVariantModal) {
                                        const button = e.currentTarget.closest('div')?.parentElement?.querySelector('button.btn-primary') as HTMLButtonElement;
                                        button?.click();
                                    }
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button 
                                onClick={() => setIsAddVariantModalOpen(false)}
                                className="btn-ghost"
                                style={{ flex: 1, height: '44px', borderRadius: '12px' }}
                            >
                                Cancel
                            </button>
                            <button 
                                disabled={!newVariantNameModal.trim() || isAddingVariantModal}
                                onClick={async () => {
                                    if (!addVariantSpeaker) return;
                                    setIsAddingVariantModal(true);
                                    try {
                                        const formData = new URLSearchParams();
                                        formData.append('speaker_id', addVariantSpeaker.speaker.id);
                                        formData.append('variant_name', newVariantNameModal.trim());
                                        const resp = await fetch('/api/speaker-profiles', {
                                            method: 'POST',
                                            body: formData
                                        });
                                        if (resp.ok) {
                                            setIsAddVariantModalOpen(false);
                                            setAddVariantSpeaker(null);
                                            setNewVariantNameModal('');
                                            onRefresh();
                                        } else {
                                            const err = await resp.json();
                                            alert(`Failed to add variant: ${err.message}`);
                                        }
                                    } finally {
                                        setIsAddingVariantModal(false);
                                    }
                                }}
                                className="btn-primary"
                                style={{ flex: 1, height: '44px', borderRadius: '12px' }}
                            >
                                {isAddingVariantModal ? 'Adding...' : 'Add Variant'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Recording Guide Drawer */}
            <Drawer 
                isOpen={showGuide} 
                onClose={() => setShowGuide(false)} 
                title="Recording Guide"
            >
                <RecordingGuide />
            </Drawer>

            {/* Script Editor Drawer */}
            <Drawer
                isOpen={!!editingProfile}
                onClose={() => setEditingProfile(null)}
            title={`Edit: ${editingProfile?.variant_name || editingProfile?.name || ''}`}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '1.5rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>VARIANT NAME</label>
                        <GlassInput
                            placeholder="Variant name"
                            value={variantName}
                            onChange={(e) => setVariantName(e.target.value)}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>PREVIEW TEXT SCRIPT</label>
                            <button 
                                onClick={handleResetTestText} 
                                className="btn-ghost"
                                style={{ fontSize: '0.7rem', height: '28px', padding: '0 8px' }}
                            >
                                <RotateCcw size={12} style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                                Reset to Default
                            </button>
                        </div>
                        <textarea
                            value={testText}
                            onChange={(e) => setTestText(e.target.value)}
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
                            onClick={handleSaveTestText}
                            disabled={isSavingText}
                            className="btn-primary"
                            style={{ width: '100%', height: '44px', borderRadius: '12px', justifyContent: 'center' }}
                        >
                            {isSavingText ? (
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
            </Drawer>

            {/* Global Confirm Modal */}
            <ConfirmModal
                isOpen={!!confirmConfig}
                title={confirmConfig?.title || ''}
                message={confirmConfig?.message || ''}
                isDestructive={confirmConfig?.isDestructive}
                onConfirm={() => {
                    confirmConfig?.onConfirm();
                    setConfirmConfig(null);
                }}
                onCancel={() => setConfirmConfig(null)}
            />
        </div>
    );
};
