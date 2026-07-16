import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PillCategory } from '@/pages/Voices/components/VoicePills';

export interface MultiSelectOption {
    id: string;
    label: string;
}

export interface MultiSelectProps {
    options: MultiSelectOption[];
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
    label?: string;
    disabled?: boolean;
    /**
     * H-5 (design-critique follow-up): when a facet maps to a `VoicePill` hue
     * (class/gender/age/extended/tag), pass its category so the selected chips
     * are tinted to match — mirrors `metadata/chip.tsx`'s `category` prop,
     * which solved the same drift for the metadata editor's active chips.
     * Callers with no taxonomy facet (e.g. a free-form tag filter) omit this
     * and keep the prior generic accent-fill styling.
     */
    category?: PillCategory;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Select options...',
    label,
    disabled = false,
    category,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const listboxId = React.useId();

    const toggle = (id: string) => {
        if (value.includes(id)) {
            onChange(value.filter(v => v !== id));
        } else {
            onChange([...value, id]);
        }
    };

    const remove = (id: string) => {
        onChange(value.filter(v => v !== id));
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setHighlightedIndex(0);
        }
    }, [isOpen]);

    const closeAndFocusTrigger = () => {
        setIsOpen(false);
        triggerRef.current?.focus();
    };

    // Focus stays on the trigger (a focusable combobox element) while the panel
    // is open, so ALL keyboard navigation is handled here rather than on the
    // listbox div (which never receives focus). Key events that originate on a
    // descendant chip "Remove" button are ignored (target !== currentTarget) so
    // that activating a chip doesn't also toggle the panel.
    const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;
        if (event.target !== event.currentTarget) return;

        if (!isOpen) {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlightedIndex((prev) => (prev + 1) % Math.max(options.length, 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlightedIndex((prev) => (prev - 1 + Math.max(options.length, 1)) % Math.max(options.length, 1));
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const opt = options[highlightedIndex];
            if (opt) toggle(opt.id);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeAndFocusTrigger();
        }
    };

    const selectedOptions = value
        .map(id => options.find(opt => opt.id === id))
        .filter((opt): opt is MultiSelectOption => Boolean(opt));

    // H-5: tint selected chips to the facet's `--pill-{category}-*` hue (matching
    // the `VoicePill`s the same values render elsewhere on the page) instead of a
    // single generic accent for every field — mirrors `metadata/chip.tsx`'s
    // `category` handling. No `category` prop (e.g. the free-form tag filter)
    // keeps the prior accent-fill styling.
    const chipBg = category ? `var(--pill-${category}-bg)` : 'var(--accent-glow)';
    const chipColor = category ? `var(--pill-${category}-text)` : 'var(--accent)';

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            {/* The trigger is a focusable combobox element (not a <button>) so
                that the per-chip "Remove" controls can be real, independently
                tabbable <button>s — a <button> nested inside a <button> is
                invalid and the inner one is not keyboard-focusable. Click and
                keyboard both open/close and drive listbox navigation here. */}
            <div
                ref={triggerRef}
                role="combobox"
                tabIndex={disabled ? -1 : 0}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                onKeyDown={handleTriggerKeyDown}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={isOpen ? listboxId : undefined}
                aria-disabled={disabled || undefined}
                aria-label={selectedOptions.length === 0 ? (label || placeholder) : (label || undefined)}
                className="form-input"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    background: 'var(--surface-light)',
                    padding: '8px 14px',
                    minHeight: '44px',
                    // Owner-requested visual link to the pill taxonomy (2026-07-16):
                    // border only, not text — resting state uses the already-muted
                    // `--pill-{category}-border` token (same restraint as the pill
                    // chips themselves), full-strength `--pill-{category}-text` on
                    // open/focus for a clear but not-gaudy confirmation. No category
                    // (the free-form tag filter) keeps the prior neutral/accent
                    // border — tags are deliberately unthemed per design-system §5.
                    borderColor: category
                        ? (isOpen ? `var(--pill-${category}-text)` : `var(--pill-${category}-border)`)
                        : (isOpen ? 'var(--accent)' : 'var(--border)'),
                    boxShadow: isOpen ? '0 0 0 2px var(--accent-glow)' : 'none',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    width: '100%',
                    textAlign: 'left'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
                    {selectedOptions.length === 0 ? (
                        <span style={{ color: 'var(--text-muted)' }}>{placeholder}</span>
                    ) : (
                        selectedOptions.map(opt => (
                            <span
                                key={opt.id}
                                data-category={category}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 6px',
                                    borderRadius: 'var(--radius-compact, 6px)',
                                    background: chipBg,
                                    color: chipColor,
                                    fontSize: '0.8rem'
                                }}
                            >
                                {opt.label}
                                <button
                                    type="button"
                                    aria-label={`Remove ${opt.label}`}
                                    disabled={disabled}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        remove(opt.id);
                                    }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 0,
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'inherit',
                                        cursor: disabled ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))
                    )}
                </div>
                <ChevronDown
                    size={16}
                    style={{
                        color: 'var(--text-muted)',
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0
                    }}
                />
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 4 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        id={listboxId}
                        role="listbox"
                        aria-multiselectable="true"
                        style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-card)',
                            boxShadow: 'var(--shadow-lg)',
                            zIndex: 1000,
                            overflow: 'hidden',
                            marginTop: '4px'
                        }}
                    >
                        <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '4px' }}>
                            {options.length > 0 ? (
                                options.map((opt, index) => (
                                    <MultiSelectRow
                                        key={opt.id}
                                        opt={opt}
                                        isSelected={value.includes(opt.id)}
                                        isHighlighted={index === highlightedIndex}
                                        onClick={() => toggle(opt.id)}
                                        onMouseEnter={() => setHighlightedIndex(index)}
                                    />
                                ))
                            ) : (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    No options available
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const MultiSelectRow: React.FC<{
    opt: MultiSelectOption;
    isSelected: boolean;
    isHighlighted: boolean;
    onClick: () => void;
    onMouseEnter: () => void;
}> = ({ opt, isSelected, isHighlighted, onClick, onMouseEnter }) => {
    return (
        <div
            role="option"
            aria-selected={isSelected}
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: isSelected ? 'var(--accent-glow)' : (isHighlighted ? 'var(--surface-light)' : 'transparent'),
                color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                fontSize: '0.9rem',
                textAlign: 'left',
                marginTop: '2px',
                transition: 'background 0.1s ease',
                cursor: 'pointer'
            }}
        >
            {opt.label}
            {isSelected && <Check size={14} />}
        </div>
    );
};

export default MultiSelect;
