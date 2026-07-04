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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                ICON
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-dim)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                }}>
                    {iconUrl ? (
                        <img src={iconUrl} alt="Voice icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <Upload size={24} style={{ color: 'var(--text-muted)' }} />
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => inputRef.current?.click()}
                        className="btn-glass"
                        style={{ height: '36px', padding: '0 14px', fontSize: '0.8rem', fontWeight: 700 }}
                    >
                        {uploading ? 'Uploading…' : (iconUrl ? 'Replace icon' : 'Upload icon')}
                    </button>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
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
