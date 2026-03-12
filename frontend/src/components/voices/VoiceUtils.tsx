import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileEdit } from 'lucide-react';

// --- Drawer ---

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, title, children }) => {
    const [width, setWidth] = useState(800);
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing) {
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth >= 380 && newWidth <= window.innerWidth * 0.9) {
                setWidth(newWidth);
            }
        }
    }, [isResizing]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(15, 23, 42, 0.4)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 2000
                        }}
                    />
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        style={{
                            position: 'fixed',
                            top: 0,
                            right: 0,
                            bottom: 0,
                            width: `${width}px`,
                            maxWidth: '95vw',
                            background: 'var(--surface)',
                            boxShadow: '-10px 0 30px rgba(0,0,0,0.1)',
                            zIndex: 2001,
                            display: 'flex',
                            flexDirection: 'column',
                            borderLeft: '1px solid var(--border)',
                            userSelect: isResizing ? 'none' : 'auto'
                        }}
                    >
                        <div
                            onMouseDown={startResizing}
                            className="resize-handle"
                            style={{
                                position: 'absolute',
                                left: -6,
                                top: 0,
                                bottom: 0,
                                width: '12px',
                                cursor: 'ew-resize',
                                zIndex: 2002,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '3px',
                                padding: '8px 2px',
                                background: isResizing ? 'var(--accent)' : 'var(--surface-alt)',
                                borderRadius: '4px',
                                border: '1px solid var(--border)',
                                boxShadow: isResizing ? '0 0 10px var(--accent-glow)' : '0 2px 4px rgba(0,0,0,0.1)',
                                transition: 'all 0.2s ease',
                                opacity: isResizing ? 1 : 0.8
                            }}>
                                {[1, 2, 3].map(i => (
                                    <div key={i} style={{
                                        width: '2px',
                                        height: '2px',
                                        borderRadius: '50%',
                                        background: isResizing ? 'white' : 'var(--text-muted)'
                                    }} />
                                ))}
                            </div>
                        </div>

                        <div style={{
                            padding: '1.5rem',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'var(--surface-light)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div className="icon-circle" style={{ width: '32px', height: '32px' }}>
                                    <FileEdit size={16} />
                                </div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{title}</h3>
                            </div>
                            <button onClick={onClose} className="btn-ghost" style={{ padding: '8px' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                            {children}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
};

// --- SpeedPopover ---

interface SpeedPopoverProps {
    value: number;
    onChange: (val: number) => void;
    triggerRef: React.RefObject<any>;
    onClose: () => void;
}

export const SpeedPopover: React.FC<SpeedPopoverProps> = ({ value, onChange, triggerRef, onClose }) => {
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const [isAbove, setIsAbove] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const popoverWidth = 240;
        const popoverHeight = 160;

        let top = rect.bottom + window.scrollY + 8;
        let left = rect.left + window.scrollX - (popoverWidth / 2) + (rect.width / 2);
        let above = false;

        if (rect.bottom + popoverHeight > window.innerHeight) {
            top = rect.top + window.scrollY - popoverHeight - 8;
            above = true;
        }

        if (left < 10) left = 10;
        if (left + popoverWidth > window.innerWidth - 10) left = window.innerWidth - popoverWidth - 10;

        setCoords({ top, left });
        setIsAbove(above);
    }, [triggerRef]);

    useLayoutEffect(() => {
        updatePosition();
        window.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [updatePosition]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (triggerRef.current?.contains(e.target as Node)) return;
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose, triggerRef]);

    const presets = [0.85, 1.0, 1.1, 1.25];

    return createPortal(
        <AnimatePresence>
            <motion.div
                ref={popoverRef}
                initial={{ opacity: 0, scale: 0.95, y: isAbove ? 10 : -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: isAbove ? 10 : -10 }}
                style={{
                    position: 'absolute',
                    top: coords.top,
                    left: coords.left,
                    width: '240px',
                    background: 'var(--surface-light)',
                    borderRadius: '16px',
                    boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--border)',
                    padding: '1.25rem',
                    zIndex: 99999,
                    backdropFilter: 'blur(20px)',
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Speed Adjustment</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent)', fontFamily: 'monospace' }}>{value.toFixed(2)}x</span>
                    </div>

                    <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.01"
                        value={value}
                        onChange={(e) => onChange(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />

                    <div style={{ display: 'flex', gap: '6px' }}>
                        {presets.map(p => (
                            <button
                                key={p}
                                onClick={() => onChange(p)}
                                className="btn-ghost"
                                style={{
                                    flex: 1,
                                    fontSize: '0.7rem',
                                    padding: '4px 0',
                                    borderRadius: '6px',
                                    background: Math.abs(value - p) < 0.01 ? 'var(--accent-glow)' : 'var(--surface)',
                                    color: Math.abs(value - p) < 0.01 ? 'var(--accent)' : 'var(--text-secondary)',
                                    border: '1px solid',
                                    borderColor: Math.abs(value - p) < 0.01 ? 'var(--accent)' : 'var(--border-light)'
                                }}
                            >
                                {p.toFixed(2)}x
                            </button>
                        ))}
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};
