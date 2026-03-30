import React, { useState } from 'react';
import { Music, Upload, Plus, ChevronUp, Play, Pause, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SpeakerProfile } from '../../types';

interface SampleManagerProps {
    profile: SpeakerProfile;
    title?: string;
    isSamplesExpanded: boolean;
    setIsSamplesExpanded: (expanded: boolean) => void;
    isRebuildRequired: boolean;
    uploadFiles: (files: FileList | File[]) => Promise<void>;
    playingSample: string | null;
    handlePlaySample: (s: string) => void;
    handleDeleteSample: (s: string) => void;
}

export const SampleManager: React.FC<SampleManagerProps> = ({
    profile,
    title = 'Samples',
    isSamplesExpanded,
    setIsSamplesExpanded,
    isRebuildRequired,
    uploadFiles,
    playingSample,
    handlePlaySample,
    handleDeleteSample
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [hoveredSampleIdx, setHoveredSampleIdx] = useState<number | null>(null);

    return (
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
                background: isDragging ? 'var(--accent-glow)' : 'var(--surface)', 
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
                <button
                    type="button"
                    onClick={() => setIsSamplesExpanded(!isSamplesExpanded)}
                    className="btn-ghost hover-bg-subtle"
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '10px', 
                        color: 'var(--text-secondary)', 
                        flex: 1,
                        height: '100%',
                        padding: '4px 0',
                        textAlign: 'left'
                    }}
                >
                    <Music size={14} className="text-accent" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{title} ({profile.samples?.length || 0})</span>
                    {isRebuildRequired && <span title="Rebuild required to reflect recent sample changes"><AlertTriangle size={12} className="text-warning" /></span>}
                </button>

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
                        className="btn-ghost hover-bg-subtle" 
                        title="Add Samples Manually" 
                        style={{ 
                            padding: '4px', 
                            height: '28px', 
                            width: '28px', 
                            borderRadius: '8px', 
                            background: 'var(--surface)',
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
                    
                    <button
                        type="button"
                        onClick={() => setIsSamplesExpanded(!isSamplesExpanded)}
                        className="btn-ghost hover-bg-subtle"
                        aria-label={isSamplesExpanded ? 'Collapse samples' : 'Expand samples'}
                        style={{ 
                            padding: '6px', 
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
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
                    </button>
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
                                                        handleDeleteSample(s.name);
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
    );
};
