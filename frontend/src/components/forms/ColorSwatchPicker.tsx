import React, { useState, useEffect, useRef } from 'react';
import { Pipette, Check, X } from 'lucide-react';

interface ColorSwatchPickerProps {
    value: string;
    onChange: (color: string) => void;
    size?: 'sm' | 'md';
}

const COLORS_64 = [
    // Row 1: Pinks/Reds
    '#f43f5e', '#fb7185', '#fda4af', '#fecdd3', '#e11d48', '#be123c', '#9f1239', '#881337',
    // Row 2: Orange/Amber
    '#f97316', '#fb923c', '#ffb26b', '#ffd8a8', '#ea580c', '#c2410c', '#9a3412', '#7c2d12',
    // Row 3: Yellow/Gold
    '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#d97706', '#b45309', '#92400e', '#78350f',
    // Row 4: Green/Lime
    '#84cc16', '#a3e635', '#bef264', '#d9f99d', '#65a30d', '#4d7c0f', '#3f6212', '#365314',
    // Row 5: Emerald/Teal
    '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#059669', '#047857', '#065f46', '#064e3b',
    // Row 6: Cyan/Sky
    '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc', '#0891b2', '#0e7490', '#155e75', '#164e63',
    // Row 7: Blue/Indigo
    '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a',
    // Row 8: Violet/Purple
    '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95',
];

export const ColorSwatchPicker: React.FC<ColorSwatchPickerProps> = ({ value, onChange, size = 'md' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsOpen(false);
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

    const swatchSize = size === 'sm' ? '18px' : '24px';

    return (
        <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            {/* Active Color Trigger */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                style={{
                    width: swatchSize,
                    height: swatchSize,
                    borderRadius: '4px',
                    background: value || 'var(--accent)',
                    border: '1px solid var(--border)',
                    padding: 0,
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
                title="Change Color"
            >
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }} />
            </button>

            {/* Popover */}
            {isOpen && (
                <div 
                    className="popover-panel"
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        left: 0,
                        width: 'max-content',
                        minWidth: '220px'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Palette</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <Pipette size={14} style={{ color: 'var(--text-muted)', cursor: 'pointer' }} />
                                <input
                                    type="color"
                                    value={value}
                                    onChange={(e) => onChange(e.target.value)}
                                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                                />
                            </div>
                            <X size={14} style={{ color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setIsOpen(false)} />
                        </div>
                    </div>

                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(8, 1fr)', 
                        gap: '4px',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        padding: '2px'
                    }}>
                        {COLORS_64.map(color => (
                            <button
                                key={color}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange(color);
                                    setIsOpen(false);
                                }}
                                style={{
                                    width: '20px',
                                    height: '20px',
                                    borderRadius: '3px',
                                    background: color,
                                    border: value === color ? '2px solid var(--accent)' : '1px solid var(--border)',
                                    padding: 0,
                                    cursor: 'pointer',
                                    transition: 'all 0.1s'
                                }}
                                title={color}
                            >
                                {value === color && <Check size={10} color="white" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
