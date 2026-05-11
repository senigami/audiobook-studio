import React, { useState, useCallback, useEffect } from 'react';
import { Upload, X, FileAudio, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SelectedFile {
    file: File;
    id: string;
    status: 'valid' | 'warning';
    warnings: string[];
    duration?: string;
}

interface VoiceDropzoneProps {
    files?: File[];
    onFilesChange: (files: File[]) => void;
}

export const VoiceDropzone: React.FC<VoiceDropzoneProps> = ({ files = [], onFilesChange }) => {
    const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    // Sync with parent state (especially for clearing)
    useEffect(() => {
        if (files.length === 0 && selectedFiles.length > 0) {
            setSelectedFiles([]);
        }
    }, [files, selectedFiles.length]);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const validateFile = async (file: File): Promise<SelectedFile> => {
        const warnings: string[] = [];
        let durationStr = '...';

        try {
            const audio = new Audio(URL.createObjectURL(file));
            await new Promise((resolve) => {
                audio.onloadedmetadata = () => {
                    durationStr = formatDuration(audio.duration);
                    if (audio.duration < 3) warnings.push('Too short');
                    if (audio.duration > 15) warnings.push('Too long');
                    resolve(null);
                };
                audio.onerror = () => resolve(null);
            });
        } catch (e) {
            console.error('Failed to get audio duration', e);
        }

        if (file.size > 10 * 1024 * 1024) warnings.push('Large file size');
        
        const isWav = file.name.toLowerCase().endsWith('.wav');
        if (!isWav) {
            warnings.push('Will be converted to WAV');
        }

        return {
            file,
            id: Math.random().toString(36).substring(7),
            status: warnings.length > 0 ? 'warning' : 'valid',
            warnings,
            duration: durationStr
        };
    };

    const handleFiles = useCallback(async (files: FileList | null) => {
        if (!files) return;
        
        const validExtensions = ['.wav', '.mp3', '.m4a', '.ogg', '.flac', '.aac'];
        const allFiles = Array.from(files);
        const audioFiles = allFiles.filter(f => 
            validExtensions.some(ext => f.name.toLowerCase().endsWith(ext))
        );
        
        if (audioFiles.length < allFiles.length) {
            const rejected = allFiles.length - audioFiles.length;
            alert(`${rejected} ${rejected === 1 ? 'file was' : 'files were'} ignored. Supported formats: .wav, .mp3, .m4a, .flac`);
        }

        const newFiles = await Promise.all(audioFiles.map(validateFile));
        
        setSelectedFiles(prev => {
            const updated = [...prev, ...newFiles];
            onFilesChange(updated.map(sf => sf.file));
            return updated;
        });
    }, [onFilesChange]);

    const removeFile = (id: string) => {
        setSelectedFiles(prev => {
            const updated = prev.filter(f => f.id !== id);
            onFilesChange(updated.map(sf => sf.file));
            return updated;
        });
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    };

    return (
        <div className="input-group">
            <label>Voice Samples</label>
            
            <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => document.getElementById('voice-upload-input')?.click()}
                style={{
                    border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-card)',
                    padding: '2rem',
                    textAlign: 'center',
                    background: isDragging ? 'var(--accent-glow)' : 'var(--surface-light)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px'
                }}
            >
                <input
                    id="voice-upload-input"
                    type="file"
                    multiple
                    accept=".wav,.mp3,.m4a,.ogg,.flac,.aac"
                    onChange={(e) => handleFiles(e.target.files)}
                    style={{ display: 'none' }}
                />
                <div className="icon-circle" style={{ width: '48px', height: '48px', background: 'var(--accent-glow)' }}>
                    <Upload size={24} color="var(--accent)" />
                </div>
                <div>
                    <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Drop audio samples here, or <span style={{ color: 'var(--accent)' }}>Browse</span></p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Supports .wav, .mp3, .m4a, .flac (auto-converts to WAV)</p>
                </div>

                <AnimatePresence>
                    {isDragging && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'absolute',
                                inset: -2,
                                background: 'rgba(43, 110, 255, 0.05)',
                                backdropFilter: 'blur(2px)',
                                borderRadius: 'var(--radius-card)',
                                border: '2px solid var(--accent)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 10,
                                pointerEvents: 'none'
                            }}
                        >
                            <motion.div
                                animate={{ scale: [1, 1.1, 1] }}
                                transition={{ repeat: Infinity, duration: 1.5 }}
                                style={{
                                    background: 'var(--surface)',
                                    padding: '1.5rem 2.5rem',
                                    borderRadius: '99px',
                                    boxShadow: 'var(--shadow-xl)',
                                    border: '1px solid var(--border)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}
                            >
                                <Upload size={24} color="var(--accent)" />
                                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>Drop to Upload</span>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {selectedFiles.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} selected
                            </span>
                        </div>
                        {selectedFiles.map((sf) => (
                            <motion.div
                                key={sf.id}
                                layout
                                initial={{ x: -10, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '8px 12px',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem'
                                }}
                            >
                                <FileAudio size={16} color="var(--accent)" />
                                <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {sf.file.name}
                                </span>
                                {sf.duration && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                        {sf.duration}
                                    </span>
                                )}
                                {sf.status === 'warning' && (
                                    <div title={sf.warnings.join(', ')} style={{ color: 'var(--warning)' }}>
                                        <AlertCircle size={14} />
                                    </div>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); removeFile(sf.id); }}
                                    className="btn-ghost"
                                    style={{ padding: '4px', borderRadius: '4px' }}
                                >
                                    <X size={14} />
                                </button>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '12px',
                padding: '8px 12px',
                background: 'var(--as-info-tint)',
                borderRadius: '8px',
                border: '1px solid var(--accent-glow)'
            }}>
                <CheckCircle2 size={14} color="var(--accent)" />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Best results: 3–5 clean samples, 6–10 seconds each.
                </span>
            </div>
        </div>
    );
};
