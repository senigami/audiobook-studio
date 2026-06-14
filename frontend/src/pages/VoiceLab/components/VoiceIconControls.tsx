/**
 * VoiceIconControls.tsx — R5-T7
 *
 * Shown in the Voice Lab header below the avatar.
 * - Icon upload: POST /api/voices/{id}/icon (existing backend endpoint)
 * - "📋 Copy icon prompt" button: builds a prompt from attributes +
 *   description via buildIconPrompt(), copies to clipboard, shows transient
 *   "Copied!" state using fake-timer-safe setTimeout.
 */
import React, { useRef, useState } from 'react';
import { Upload, Check, ClipboardCopy } from 'lucide-react';
import type { VoiceMetadata } from '@/types';
import { api } from '@/api';
import { buildIconPrompt } from '@/pages/VoiceLab/iconPrompt';

export interface VoiceIconControlsProps {
    voiceId: string;
    metadata: VoiceMetadata | null;
    /** Called on successful icon upload with the new image path */
    onIconUploaded: (imagePath: string) => void;
}

export const VoiceIconControls: React.FC<VoiceIconControlsProps> = ({
    voiceId,
    metadata,
    onIconUploaded,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setUploadError(null);
        try {
            const result = await api.uploadVoiceIcon(voiceId, file);
            onIconUploaded(result.image);
        } catch (err: any) {
            setUploadError(err.message || 'Upload failed');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const handleCopyPrompt = async () => {
        const prompt = buildIconPrompt(metadata);
        try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            // Clear previous timer to avoid overlap
            if (copiedTimerRef.current !== null) clearTimeout(copiedTimerRef.current);
            copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard write failed silently — browser may not allow without user gesture
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Icon upload button */}
                <button
                    type="button"
                    disabled={uploading}
                    onClick={() => inputRef.current?.click()}
                    className="btn-glass"
                    aria-label={uploading ? 'Uploading icon…' : 'Upload voice icon'}
                    style={{ height: '28px', padding: '0 10px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: 'var(--radius-round)' }}
                >
                    <Upload size={12} />
                    {uploading ? 'Uploading…' : (metadata?.image ? 'Replace icon' : 'Upload icon')}
                </button>

                {/* Copy icon prompt */}
                <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="btn-glass"
                    aria-label="Copy icon prompt to clipboard"
                    style={{ height: '28px', padding: '0 10px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: 'var(--radius-round)' }}
                >
                    {copied ? (
                        <><Check size={12} style={{ color: 'var(--success)' }} />Copied!</>
                    ) : (
                        <><ClipboardCopy size={12} />📋 Copy icon prompt</>
                    )}
                </button>

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Upload voice icon file"
                    style={{ display: 'none' }}
                    onChange={handleUpload}
                />
            </div>

            {/* Helper caption */}
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4 }}>
                image prompt from attributes + description — uniform icons
            </span>

            {/* Upload error */}
            {uploadError && (
                <span style={{ fontSize: '0.7rem', color: 'var(--error)' }}>
                    {uploadError}
                </span>
            )}
        </div>
    );
};
