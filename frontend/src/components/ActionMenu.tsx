import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ActionMenuItem {
    label?: string;
    icon?: LucideIcon;
    onClick?: () => void;
    isDestructive?: boolean;
    isDivider?: boolean;
    disabled?: boolean;
}

interface ActionMenuProps {
    items?: ActionMenuItem[];
    onDelete?: () => void; // Maintain backward compatibility for now
    trigger?: React.ReactNode;
}

export const ActionMenu: React.FC<ActionMenuProps> = ({ items, onDelete, trigger }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
    const [isAbove, setIsAbove] = useState(false);

    // Legacy support if items isn't provided
    const menuItems: ActionMenuItem[] = items || (onDelete ? [
        { label: 'Delete Project', onClick: onDelete, isDestructive: true }
    ] : []);

    const updatePosition = () => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const menuWidth = 180; // Min-width


        const top = rect.bottom + window.scrollY;
        let left = rect.right + window.scrollX - menuWidth;
        const above = false;

        // Flip logic removed to keep menu below the trigger as requested
        /*
        if (rect.bottom + menuHeight > window.innerHeight) {
            top = rect.top + window.scrollY - menuHeight - 8;
            above = true;
        }
        */

        // Clamp horizontal
        if (left < 10) left = 10;
        if (left + menuWidth > window.innerWidth - 10) left = window.innerWidth - menuWidth - 10;

        setMenuRect({ top, left, width: menuWidth });
        setIsAbove(above);
    };

    useLayoutEffect(() => {
        if (isOpen) {
            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
        }
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (triggerRef.current?.contains(event.target as Node)) return;
            const menuElement = document.getElementById('action-menu-portal');
            if (menuElement && !menuElement.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen]);

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <motion.button
                ref={triggerRef}
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                aria-label="More actions"
                whileHover={trigger ? { scale: 1.05 } : { backgroundColor: 'rgba(15, 23, 42, 0.08)', color: 'var(--accent)' }}
                whileTap={{ scale: 0.92 }}
                style={trigger ? {
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                } : {
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(4px)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'all 0.2s ease'
                }}
                className={trigger ? "" : "kebab-trigger"}
            >
                {trigger ? trigger : <MoreVertical size={18} style={{ width: '18px', height: '18px', flexShrink: 0 }} />}
            </motion.button>

            {isOpen && createPortal(
                <AnimatePresence mode="wait">
                    <motion.div
                        id="action-menu-portal"
                        initial={{ opacity: 0, scale: 0.95, y: isAbove ? 5 : -5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: isAbove ? 5 : -5 }}
                        transition={{ duration: 0.1, ease: 'easeOut' }}
                        style={{
                            position: 'absolute',
                            top: menuRect?.top ?? 0,
                            left: menuRect?.left ?? 0,
                            minWidth: menuRect?.width ?? 180,
                            background: 'var(--surface-light)',
                            borderRadius: '12px',
                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
                            border: '1px solid var(--border)',
                            overflow: 'hidden',
                            zIndex: 99999,
                            padding: '6px',
                            backdropFilter: 'blur(16px)',
                            pointerEvents: 'auto'
                        }}
                    >
                        {menuItems.map((item, idx) => (
                            <React.Fragment key={idx}>
                                {item.isDivider && <div style={{ height: '1px', background: 'var(--border)', margin: '6px 4px', opacity: 0.5 }} />}
                                <button
                                    disabled={item.disabled}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (item.disabled || item.isDivider) return;
                                        setHoveredIndex(null);
                                        setIsOpen(false);
                                        item.onClick?.();
                                    }}
                                    onMouseEnter={() => !item.disabled && setHoveredIndex(idx)}
                                    onMouseLeave={() => setHoveredIndex(null)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        background: hoveredIndex === idx ? 'var(--accent-glow)' : 'none',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: item.disabled ? 'not-allowed' : 'pointer',
                                        textAlign: 'left',
                                        justifyContent: 'flex-start',
                                        color: item.disabled ? 'var(--text-muted)' : (item.isDestructive ? 'var(--error)' : 'var(--text-primary)'),
                                        opacity: item.disabled ? 0.5 : 1,
                                        fontSize: '0.85rem',
                                        fontWeight: 500,
                                        transition: 'all 0.1s ease'
                                    }}
                                >
                                    {item.icon && <item.icon size={14} style={{ opacity: item.disabled ? 0.5 : 1 }} />}
                                    {item.label}
                                </button>
                            </React.Fragment>
                        ))}
                    </motion.div>
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};
