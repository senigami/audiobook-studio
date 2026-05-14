import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, Search, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Option {
    id: string;
    name: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    noneLabel?: string;
    showCreateNew?: boolean;
    onCreateNew?: () => void;
    disabled?: boolean;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Select an option...',
    noneLabel = 'None (Unassigned)',
    showCreateNew = true,
    onCreateNew,
    disabled = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find(opt => opt.id === value);

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
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
        if (!isOpen) {
            setSearch('');
        }
    }, [isOpen]);

    const filteredOptions = options.filter(opt =>
        opt.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className="form-input"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    background: 'var(--surface-light)',
                    padding: '10px 14px',
                    borderColor: isOpen ? 'var(--accent)' : 'var(--border)',
                    boxShadow: isOpen ? '0 0 0 2px var(--accent-glow)' : 'none',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    width: '100%',
                    textAlign: 'left'
                }}
            >
                <span style={{ 
                    color: value === 'none' ? 'var(--text-muted)' : 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}>
                    {value === 'none' ? noneLabel : (value === 'new' ? 'Create New Speaker...' : (selectedOption?.name || placeholder))}
                </span>
                <ChevronDown 
                    size={16} 
                    style={{ 
                        color: 'var(--text-muted)',
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s ease'
                    }} 
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 4 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            boxShadow: 'var(--shadow-lg)',
                            zIndex: 1000,
                            overflow: 'hidden',
                            marginTop: '4px'
                        }}
                    >
                        <div style={{ padding: '8px', borderBottom: '1px solid var(--border-light)' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder="Search speakers..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px 8px 32px',
                                        fontSize: '0.85rem',
                                        background: 'var(--surface-alt)',
                                        border: '1px solid var(--border-light)',
                                        borderRadius: '8px',
                                        color: 'var(--text-primary)',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '4px' }}>
                            <button
                                type="button"
                                onClick={() => { onChange('none'); setIsOpen(false); }}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: value === 'none' ? 'var(--accent-glow)' : 'transparent',
                                    color: value === 'none' ? 'var(--accent)' : 'var(--text-primary)',
                                    fontSize: '0.9rem',
                                    textAlign: 'left'
                                }}
                                className="dropdown-item-hover"
                            >
                                {noneLabel}
                                {value === 'none' && <Check size={14} />}
                            </button>

                            {showCreateNew && (
                                <button
                                    type="button"
                                    onClick={() => { 
                                        if (onCreateNew) onCreateNew();
                                        else onChange('new');
                                        setIsOpen(false); 
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        borderRadius: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        background: value === 'new' ? 'var(--accent-glow)' : 'transparent',
                                        color: 'var(--accent)',
                                        fontSize: '0.9rem',
                                        fontWeight: 600,
                                        textAlign: 'left',
                                        marginTop: '2px'
                                    }}
                                    className="dropdown-item-hover"
                                >
                                    <Plus size={14} />
                                    Create New Speaker...
                                </button>
                            )}

                            {filteredOptions.length > 0 ? (
                                <>
                                    <div style={{ 
                                        padding: '10px 12px 4px', 
                                        fontSize: '0.7rem', 
                                        fontWeight: 700, 
                                        color: 'var(--text-muted)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em'
                                    }}>
                                        Existing Speakers
                                    </div>
                                    {filteredOptions.map((opt) => (
                                        <DropDownItem 
                                            key={opt.id}
                                            opt={opt}
                                            isSelected={value === opt.id}
                                            onClick={() => { onChange(opt.id); setIsOpen(false); }}
                                        />
                                    ))}
                                </>
                            ) : search && (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    No speakers found matching "{search}"
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const DropDownItem: React.FC<{ 
    opt: Option; 
    isSelected: boolean; 
    onClick: () => void;
}> = ({ opt, isSelected, onClick }) => {
    const [isHovered, setIsHovered] = useState(false);
    return (
        <button
            type="button"
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: isSelected ? 'var(--accent-glow)' : (isHovered ? 'var(--surface-light)' : 'transparent'),
                color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                fontSize: '0.9rem',
                textAlign: 'left',
                marginTop: '2px',
                transition: 'background 0.1s ease'
            }}
        >
            {opt.name}
            {isSelected && <Check size={14} />}
        </button>
    );
};

export default SearchableSelect;
