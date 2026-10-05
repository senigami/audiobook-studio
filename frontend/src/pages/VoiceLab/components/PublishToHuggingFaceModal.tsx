import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { api } from '@/api';

interface PublishToHuggingFaceModalProps {
    isOpen: boolean;
    voiceId: string;
    voiceName: string;
    onClose: () => void;
}

type PublishResult =
    | { status: 'success'; hubId: string; commitId: string }
    | { status: 'generating'; message: string }
    | { status: 'error'; message: string };

// Sample generation is a real synthesis job (seconds to ~a minute), not
// instant -- auto-retry the publish at this cadence while "generating" so
// the owner doesn't have to manually re-click. Bounded so a stuck/failed
// job doesn't poll forever.
const GENERATING_RETRY_MS = 4000;
const GENERATING_MAX_ATTEMPTS = 20; // ~80s

export const PublishToHuggingFaceModal: React.FC<PublishToHuggingFaceModalProps> = ({
    isOpen,
    voiceId,
    voiceName,
    onClose,
}) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    useFocusTrap(dialogRef, isOpen);

    const [hubId, setHubId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<PublishResult | null>(null);
    const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const generatingAttemptsRef = useRef(0);

    const clearRetryTimer = useCallback(() => {
        if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => () => clearRetryTimer(), [clearRetryTimer]);

    const handleClose = useCallback(() => {
        if (submitting) return;
        clearRetryTimer();
        generatingAttemptsRef.current = 0;
        setHubId('');
        setResult(null);
        onClose();
    }, [submitting, onClose, clearRetryTimer]);

    const handleEscape = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') handleClose();
    }, [handleClose]);

    // isRetry: true for the silent auto-retry loop while a sample is being
    // generated -- doesn't show the "Publishing…" submitting state, since
    // that's reserved for the user's own explicit click.
    const handlePublish = async (isRetry = false) => {
        const trimmedHubId = hubId.trim();
        if (!trimmedHubId) return;
        clearRetryTimer();
        if (!isRetry) {
            setSubmitting(true);
            generatingAttemptsRef.current = 0;
        }
        setResult(null);
        try {
            const res = await api.uploadHfVoice({ voiceId, hubId: trimmedHubId });
            if (res.status === 'generating') {
                generatingAttemptsRef.current += 1;
                setResult({ status: 'generating', message: res.message });
                if (generatingAttemptsRef.current < GENERATING_MAX_ATTEMPTS) {
                    retryTimeoutRef.current = setTimeout(() => handlePublish(true), GENERATING_RETRY_MS);
                } else {
                    setResult({
                        status: 'error',
                        message: 'Sample generation is taking longer than expected. Try publishing again in a moment.',
                    });
                }
            } else {
                setResult({ status: 'success', hubId: res.hub_id, commitId: res.commit_id });
            }
        } catch (err: any) {
            // Surface 422/502 messages verbatim (e.g. "No Hugging Face access
            // token is configured...", invalid hub_id shape, upload failure).
            setResult({ status: 'error', message: err.message || 'Failed to publish voice to Hugging Face.' });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
                    onKeyDown={handleEscape}
                >
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={handleClose} aria-hidden="true"
                        style={{ position: 'absolute', inset: 0, background: 'var(--overlay-backdrop)', backdropFilter: 'blur(8px)' }}
                    />
                    <motion.div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="publish-hf-modal-title"
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        style={{
                            position: 'relative', width: '100%', maxWidth: '440px',
                            background: 'var(--surface)', borderRadius: 'var(--radius-card)',
                            boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border)',
                            padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h3 id="publish-hf-modal-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Publish to Hugging Face
                                </h3>
                                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    {voiceName}
                                </p>
                            </div>
                            <button onClick={handleClose} aria-label="Close dialog" className="modal-close-btn">
                                <X size={18} />
                            </button>
                        </div>

                        {result?.status === 'success' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)' }}>
                                    <CheckCircle2 size={18} />
                                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Published</span>
                                </div>
                                <a
                                    href={`https://huggingface.co/${result.hubId}`}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--action-primary)', fontSize: '0.85rem', fontWeight: 600 }}
                                >
                                    huggingface.co/{result.hubId}
                                    <ExternalLink size={14} />
                                </a>
                                {result.commitId && (
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                        commit {result.commitId}
                                    </p>
                                )}
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="btn-primary"
                                    style={{ padding: '0.6rem', borderRadius: 'var(--radius-button)', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Done
                                </button>
                            </div>
                        ) : result?.status === 'generating' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Generating sample…</span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                    {result.message}
                                </p>
                                <button onClick={handleClose} className="btn-ghost" style={{ padding: '0.65rem', borderRadius: 'var(--radius-button)' }}>
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                    Hugging Face repo (namespace/repo-name)
                                    <input
                                        type="text"
                                        aria-label="Hugging Face repo"
                                        placeholder="your-username/voice-name"
                                        value={hubId}
                                        disabled={submitting}
                                        onChange={(e) => setHubId(e.target.value)}
                                        style={{
                                            padding: '0.55rem 0.7rem',
                                            borderRadius: 'var(--radius-button)',
                                            border: '1px solid var(--border)',
                                            background: 'var(--surface)',
                                            color: 'var(--text-primary)',
                                            fontSize: '0.9rem',
                                        }}
                                    />
                                </label>

                                {result?.status === 'error' && (
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-button)', background: 'var(--error-tint-bg)', border: '1px solid var(--error-tint-border)' }}>
                                        <AlertCircle size={16} style={{ color: 'var(--error)', flexShrink: 0, marginTop: '1px' }} />
                                        <span style={{ fontSize: '0.82rem', color: 'var(--error-text)' }}>{result.message}</span>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button onClick={handleClose} className="btn-ghost" style={{ flex: 1, padding: '0.65rem', borderRadius: 'var(--radius-button)' }}>
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => handlePublish()}
                                        disabled={submitting || !hubId.trim()}
                                        className="btn-primary"
                                        style={{ flex: 1, padding: '0.65rem', borderRadius: 'var(--radius-button)', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        {submitting ? 'Publishing…' : 'Publish'}
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
