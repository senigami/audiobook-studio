import React, { useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    projectName?: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    isAlert?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    projectName,
    confirmText,
    cancelText = 'Cancel',
    isDestructive = true,
    isAlert = false
}) => {
    // If it's an alert, default confirm text to 'Close' if not provided
    const finalConfirmText = confirmText || (isAlert ? 'Close' : 'Confirm');

    const dialogRef = useRef<HTMLDivElement>(null);
    useFocusTrap(dialogRef, isOpen);

    const handleEscape = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onCancel();
    }, [onCancel]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 2000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1.5rem'
                    }}
                    onKeyDown={handleEscape}
                >
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onCancel}
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'var(--overlay-backdrop)',
                            backdropFilter: 'blur(8px)',
                        }}
                    />

                    {/* Modal Content */}
                    <motion.div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="confirm-modal-title"
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        style={{
                            position: 'relative',
                            width: '100%',
                            maxWidth: '440px',
                            background: 'var(--surface)',
                            borderRadius: '20px',
                            boxShadow: 'var(--shadow-xl)',
                            border: '1px solid var(--border)',
                            padding: '2rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.5rem'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '12px',
                                background: isDestructive ? 'var(--error-tint-bg)' : 'var(--accent-glow)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: isDestructive ? 'var(--error)' : 'var(--accent)'
                            }}>
                                <AlertCircle size={24} />
                            </div>
                            <button
                                onClick={onCancel}
                                aria-label="Close dialog"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: '10px',
                                    minWidth: '40px',
                                    minHeight: '40px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '8px'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <h3
                                id="confirm-modal-title"
                                style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}
                            >
                                {title}
                            </h3>
                            <p style={{ fontSize: '0.925rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                {projectName ? (
                                    <>
                                        Are you sure you want to delete <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>"{projectName}"</span>? This will permanently remove all chapters and audio files. This action cannot be undone.
                                    </>
                                ) : message}
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '0.5rem' }}>
                            {!isAlert && (
                                <button
                                    onClick={onCancel}
                                    className="btn-ghost"
                                    style={{ flex: 1, padding: '0.75rem', borderRadius: '12px' }}
                                >
                                    {cancelText}
                                </button>
                            )}
                            <button
                                onClick={onConfirm}
                                className={isDestructive && !isAlert ? 'btn-danger' : 'btn-primary'}
                                style={{
                                    flex: 1,
                                    padding: '0.75rem',
                                    borderRadius: '12px',
                                    backgroundColor: isDestructive && !isAlert ? 'var(--error)' : 'var(--accent)',
                                    color: 'white',
                                    border: 'none',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                {finalConfirmText}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
