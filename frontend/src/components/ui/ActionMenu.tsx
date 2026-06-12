import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ActionMenuItem {
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
    disabled?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export const ActionMenu: React.FC<ActionMenuProps> = ({ items, onDelete, trigger, disabled, onOpenChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const prevOpenRef = useRef(isOpen);
    
    // Notify parent ONLY when the open state actually toggles
    useEffect(() => {
        if (prevOpenRef.current !== isOpen) {
            onOpenChange?.(isOpen);
            prevOpenRef.current = isOpen;
        }
    }, [isOpen, onOpenChange]);

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
        const estimatedMenuHeight = 200; // conservative estimate for flip calc

        let top = rect.bottom + window.scrollY + 4;
        let left = rect.left + (rect.width / 2) + window.scrollX + 8;
        let above = false;

        // Flip upward when insufficient space below the viewport fold
        if (rect.bottom + estimatedMenuHeight > window.innerHeight) {
            top = rect.top + window.scrollY - estimatedMenuHeight - 4;
            above = true;
        }

        // Clamp horizontal
        if (left < 10) left = 10;
        if (left + menuWidth > window.innerWidth - 10) left = window.innerWidth - menuWidth - 10;

        setMenuRect({ top, left, width: menuWidth });
        setIsAbove(above);
    };

    useLayoutEffect(() => {
        if (isOpen && !disabled) {
            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
        }
        return () => {
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('resize', updatePosition);
        };
    }, [isOpen, disabled]);

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
                    if (!disabled) setIsOpen(!isOpen);
                }}
                aria-label="More actions"
                whileHover={disabled ? {} : (trigger ? { scale: 1.05 } : { backgroundColor: 'var(--glass-hover)', color: 'var(--accent)' })}
                whileTap={disabled ? {} : { scale: 0.92 }}
                style={trigger ? {
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: disabled ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                } : {
                    width: '44px',
                    height: '44px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--surface-glass-white)',
                    backdropFilter: 'blur(4px)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    cursor: disabled ? 'default' : 'pointer',
                    padding: 0,
                    transition: 'all 0.2s ease',
                    opacity: disabled ? 0.6 : 1
                }}
                className={trigger ? "" : "kebab-trigger"}
                disabled={disabled}
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
                            boxShadow: 'var(--shadow-xl)',
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
