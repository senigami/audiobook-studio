import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '@/api';
import { IconCropModal } from '@/pages/Voices/components/metadata/IconCropModal';

/** Reads just the natural dimensions of a File, without keeping it decoded in memory. */
function readImageDimensions(file: File): Promise<{ w: number; h: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Could not read image'));
        };
        img.src = url;
    });
}

// ---------------------------------------------------------------------------
// IconUpload
// ---------------------------------------------------------------------------
export function IconUpload({
    voiceId,
    currentImagePath,
    onSuccess,
    onError,
}: {
    voiceId: string;
    currentImagePath: string | undefined;
    onSuccess: (image: string) => void;
    onError: (msg: string) => void;
}) {
    const [uploading, setUploading] = useState(false);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const doUpload = async (file: File) => {
        setUploading(true);
        try {
            const result = await api.uploadVoiceIcon(voiceId, file);
            onSuccess(result.image);
        } catch (err: any) {
            // Surface 422 message verbatim
            onError(err.message || 'Upload failed');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    // Shared by both the file-picker input and drag-and-drop — same
    // dimension-probe / crop-or-upload decision either way (D2).
    const handleFile = async (file: File) => {
        try {
            const { w, h } = await readImageDimensions(file);
            if (w === h) {
                await doUpload(file);
            } else {
                setCropFile(file);
                if (inputRef.current) inputRef.current.value = '';
            }
        } catch {
            // Dimension probe failed (corrupt/unsupported file) — fall back
            // to the server's own validation/error message.
            await doUpload(file);
        }
    };

    const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await handleFile(file);
    };

    // Reuses this repo's established drag-drop interaction pattern
    // (dashed-border highlight while dragging, e.g. VoiceDropzone.tsx) —
    // there's no shared hook for it yet, so the handlers are local here too.
    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (uploading) return;
        const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
        if (!file) {
            onError('Drop an image file (PNG, JPEG, or WebP).');
            return;
        }
        await handleFile(file);
    };

    const handleCropped = async (croppedFile: File) => {
        setCropFile(null);
        await doUpload(croppedFile);
    };

    const iconUrl = currentImagePath
        ? `/api/voices/${encodeURIComponent(voiceId)}/icon`
        : null;

    return (
        <div className="metadata-field">
            <label className="metadata-field-label">
                ICON
            </label>
            <div
                className="metadata-icon-upload__row"
                onDragOver={(e) => { e.preventDefault(); if (!uploading) setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                style={{
                    borderRadius: 'var(--radius-card)',
                    border: isDragging ? '2px dashed var(--accent)' : '2px dashed transparent',
                    background: isDragging ? 'var(--accent-glow)' : 'transparent',
                    transition: 'border-color 0.15s ease-out, background-color 0.15s ease-out',
                }}
            >
                <div className="metadata-icon-upload__preview">
                    {iconUrl ? (
                        <img src={iconUrl} alt="Voice icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <Upload size={24} style={{ color: 'var(--text-muted)' }} />
                    )}
                </div>
                <div className="metadata-icon-upload__actions">
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => inputRef.current?.click()}
                        className="btn-glass metadata-icon-upload__btn"
                    >
                        {uploading ? 'Uploading…' : (iconUrl ? 'Replace icon' : 'Upload icon')}
                    </button>
                    <p className="metadata-field-hint">
                        {isDragging
                            ? 'Drop to upload'
                            : 'PNG, JPEG, or WebP. Drag and drop, or click to browse. Non-square images can be cropped after selecting.'}
                    </p>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        aria-label="Upload voice icon"
                        style={{ display: 'none' }}
                        onChange={handleInputChange}
                    />
                </div>
            </div>
            {cropFile && (
                <IconCropModal
                    file={cropFile}
                    onCancel={() => setCropFile(null)}
                    onCropped={handleCropped}
                />
            )}
        </div>
    );
}
