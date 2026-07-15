import React, { useState } from 'react';
import { Music, Upload, Plus, ChevronUp, Play, Pause, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SpeakerProfile } from '@/types';
import { useDragDropHighlight } from '@/hooks/useDragDropHighlight';

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
    const [hoveredSampleIdx, setHoveredSampleIdx] = useState<number | null>(null);
    const { isDragging, dragDropProps } = useDragDropHighlight(uploadFiles);

    return (
        <div
            {...dragDropProps}
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
                <div className="sample-manager__drag-overlay">
                    <Upload size={24} color="var(--accent)" />
                    <span className="sample-manager__drag-label">Drop Samples to Add</span>
                </div>
            )}

            <div className="sample-manager__header">
                <button
                    type="button"
                    onClick={() => setIsSamplesExpanded(!isSamplesExpanded)}
                    className="btn-ghost hover-bg-subtle sample-manager__toggle-btn"
                >
                    <Music size={14} className="text-accent" />
                    <span className="sample-manager__title">{title} ({profile.samples?.length || 0})</span>
                    {isRebuildRequired && (
                        <span title={profile.rebuild_reasons?.length
                            ? `Rebuild Required: ${profile.rebuild_reasons.map(r => r.replace('_', ' ')).join(', ')}`
                            : "Rebuild required to reflect recent sample changes"}>
                            <AlertTriangle size={12} className="text-warning" />
                        </span>
                    )}
                </button>

                <div className="sample-manager__icon-row">
                    <input
                        type="file"
                        multiple
                        accept=".wav"
                        onChange={(e) => {
                            if (e.target.files) uploadFiles(e.target.files);
                        }}
                        className="sample-manager__file-input"
                        id={`file-input-${profile.name.replace(/\s+/g, '-')}`}
                    />
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            document.getElementById(`file-input-${profile.name.replace(/\s+/g, '-')}`)?.click();
                        }}
                        className="btn-ghost hover-bg-subtle sample-manager__add-btn"
                        title="Add Samples Manually"
                    >
                        <Plus size={16} />
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsSamplesExpanded(!isSamplesExpanded)}
                        className="btn-ghost hover-bg-subtle sample-manager__collapse-btn"
                        aria-label={isSamplesExpanded ? 'Collapse samples' : 'Expand samples'}
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
                        <div className="sample-manager__body">
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
                                                borderRadius: 'var(--radius-compact)',
                                                background: idx % 2 === 0 ? 'var(--glass-subtle)' : 'transparent',
                                                transition: 'background 0.2s',
                                                ...(s.is_new ? {
                                                    background: 'rgba(var(--accent-rgb), 0.05)',
                                                    border: '1px dashed var(--accent-glow)'
                                                } : {})
                                            }}
                                        >
                                            <div className="sample-manager__row-main">
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
                                                        borderRadius: 'var(--radius-compact)',
                                                        background: playingSample === s.name ? 'var(--accent-glow)' : 'var(--glass-subtle)',
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
                                                    <span className="sample-manager__new-badge">NEW</span>
                                                )}
                                                <span className="sample-manager__name">
                                                    {s.name}
                                                </span>
                                            </div>
                                            <div className="sample-manager__icon-row">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteSample(s.name);
                                                    }}
                                                    className="btn-ghost"
                                                    style={{
                                                        padding: 'var(--space-1)',
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
                                <div className="sample-manager__empty">
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
