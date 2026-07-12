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

    const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // D2: square images upload directly (unchanged fast path); a
        // non-square source opens the crop modal instead of round-tripping
        // to the server just to get a 422.
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
            <div className="metadata-icon-upload__row">
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
                        PNG, JPEG, or WebP. Non-square images can be cropped after selecting.
                    </p>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        aria-label="Upload voice icon"
                        style={{ display: 'none' }}
                        onChange={handle}
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
