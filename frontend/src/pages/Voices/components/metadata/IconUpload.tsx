import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '@/api';

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
    const inputRef = useRef<HTMLInputElement>(null);

    const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
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
                        Square image required (1:1). PNG, JPEG, or WebP.
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
        </div>
    );
}
