/**
 * VoicesTabHeader.tsx — R5-T4
 *
 * Restyles the existing header controls with:
 * - "My Voices" / "🤗 Discover" tab pills row at the top
 * - Active facet chips (class/gender/age) use pill tint tokens from T1
 * - Toolbar buttons remain right-aligned
 * ALL existing controls and their handlers are preserved (R-C).
 */
import React, { useEffect, useState } from 'react';
import { Search, Plus, Info, Upload, Download } from 'lucide-react';
import { GlassInput } from '@/components/forms/GlassInput';
import { GhostButton } from '@/components/ui/GhostButton';
import type { VoiceEngine } from '@/types';

const COMPACT_TOOLBAR_WIDTH = 960;

interface FacetOption { id: string; label: string; }

export type VoicesTab = 'local' | 'discover';

interface VoicesTabHeaderProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    engineFilter: 'all' | 'disabled' | VoiceEngine;
    setEngineFilter: (filter: 'all' | 'disabled' | VoiceEngine) => void;
    engineFilterOptions: Array<{ key: 'all' | 'disabled' | VoiceEngine; label: string }>;
    classFilter?: string;
    setClassFilter?: (v: string) => void;
    classOptions?: FacetOption[];
    genderFilter?: string;
    setGenderFilter?: (v: string) => void;
    genderOptions?: FacetOption[];
    ageFilter?: string;
    setAgeFilter?: (v: string) => void;
    ageOptions?: FacetOption[];
    isImportingVoice: boolean;
    exportVoiceDisabled: boolean;
    importInputRef: React.RefObject<HTMLInputElement | null>;
    onImportClick: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onExportClick: () => void;
    onCreateClick: () => void;
    onGuideClick: () => void;
    /** Active tab; defaults to 'local' if not provided */
    activeTab?: VoicesTab;
    onTabChange?: (tab: VoicesTab) => void;
}

// Active chip styles per facet category — re-use pill tint tokens from R5-T1
const ACTIVE_CHIP_STYLE: Record<'class' | 'gender' | 'age', { bg: string; border: string; color: string }> = {
    class:  { bg: 'var(--pill-class-bg)',  border: 'var(--pill-class-border)',  color: 'var(--pill-class-text)' },
    gender: { bg: 'var(--pill-gender-bg)', border: 'var(--pill-gender-border)', color: 'var(--pill-gender-text)' },
    age:    { bg: 'var(--pill-age-bg)',    border: 'var(--pill-age-border)',    color: 'var(--pill-age-text)' },
};

export const VoicesTabHeader: React.FC<VoicesTabHeaderProps> = ({
    searchQuery,
    setSearchQuery,
    engineFilter,
    setEngineFilter,
    engineFilterOptions,
    classFilter = '',
    setClassFilter,
    classOptions = [],
    genderFilter = '',
    setGenderFilter,
    genderOptions = [],
    ageFilter = '',
    setAgeFilter,
    ageOptions = [],
    isImportingVoice,
    exportVoiceDisabled,
    importInputRef,
    onImportClick,
    onExportClick,
    onCreateClick,
    onGuideClick,
    activeTab = 'local',
    onTabChange,
}) => {
    const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));
    const isCompactToolbar = windowWidth < COMPACT_TOOLBAR_WIDTH;

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const exportLabel = isCompactToolbar ? undefined : 'Export Voice';
    const importLabel = isCompactToolbar ? undefined : (isImportingVoice ? 'Importing...' : 'Import Voice');
    const createLabel = isCompactToolbar ? undefined : 'New Voice';
    const guideLabel = isCompactToolbar ? undefined : 'Recording Guide';

    return (
        <div style={{
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-light)',
            zIndex: 10,
        }}>
            {/* Row 1: Tab pills + toolbar buttons */}
            <div style={{
                padding: '0.75rem 2rem',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.75rem',
            }}>
                {/* Tab pills: My Voices / Discover */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {(['local', 'discover'] as const).map(tab => {
                        const isActive = activeTab === tab;
                        return (
                            <button
                                key={tab}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => onTabChange?.(tab)}
                                style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    padding: '4px 14px',
                                    borderRadius: 'var(--radius-round)',
                                    cursor: 'pointer',
                                    border: `1px solid ${isActive ? 'var(--accent-tint-border)' : 'var(--border)'}`,
                                    background: isActive ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                {tab === 'local' ? 'My Voices' : '🤗 Discover'}
                            </button>
                        );
                    })}
                </div>

                {/* Toolbar: import / export / create / guide */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".zip,application/zip"
                        aria-label="Import voice bundle file"
                        style={{ display: 'none' }}
                        onChange={onImportClick}
                    />
                    <GhostButton
                        onClick={onExportClick}
                        icon={Download}
                        label={exportLabel}
                        ariaLabel="Export Voice"
                        title="Export Voice"
                        disabled={exportVoiceDisabled}
                    />
                    <GhostButton
                        onClick={() => importInputRef.current?.click()}
                        icon={Upload}
                        label={importLabel}
                        ariaLabel={isImportingVoice ? 'Importing Voice' : 'Import Voice'}
                        title={isImportingVoice ? 'Importing Voice' : 'Import Voice'}
                        disabled={isImportingVoice}
                    />
                    <GhostButton
                        onClick={onCreateClick}
                        icon={Plus}
                        label={createLabel}
                        ariaLabel="New Voice"
                        title="New Voice"
                    />
                    <div className="mobile-hide" style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />
                    <GhostButton
                        onClick={onGuideClick}
                        icon={Info}
                        label={guideLabel}
                        ariaLabel="Recording Guide"
                        title="Recording Guide"
                    />
                </div>
            </div>

            {/* Row 2: Search + engine filter + facet chips (only show for local tab) */}
            {activeTab === 'local' && (
                <div style={{
                    padding: '0.5rem 2rem 0.75rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '0.75rem',
                }}>
                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                        <GlassInput
                            icon={<Search size={16} />}
                            placeholder="Search voices..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="search-responsive"
                            style={{
                                width: isCompactToolbar ? '180px' : '240px',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                            onFocus={(e) => {
                                e.currentTarget.style.width = isCompactToolbar ? '220px' : '320px';
                            }}
                            onBlur={(e) => {
                                e.currentTarget.style.width = isCompactToolbar ? '180px' : '240px';
                            }}
                        />
                    </div>

                    {/* Engine filter chips */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {engineFilterOptions.map((option) => {
                            const active = engineFilter === option.key;
                            return (
                                <button
                                    key={option.key}
                                    onClick={() => setEngineFilter(option.key)}
                                    className={active ? 'btn-primary' : 'btn-glass'}
                                    style={{ height: '30px', borderRadius: 'var(--radius-round)', padding: '0 12px', fontSize: '0.72rem', fontWeight: 700 }}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Facet chips — class / gender / age (use pill tint tokens when active) */}
                    {(classOptions.length > 0 || genderOptions.length > 0 || ageOptions.length > 0) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {classOptions.length > 0 && (
                                <>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, userSelect: 'none' }}>CLASS</span>
                                    {classOptions.map(opt => {
                                        const active = classFilter === opt.id;
                                        const tint = ACTIVE_CHIP_STYLE.class;
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setClassFilter?.(active ? '' : opt.id)}
                                                aria-pressed={active}
                                                style={{
                                                    height: '28px',
                                                    borderRadius: 'var(--radius-round)',
                                                    padding: '0 10px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    border: `1px solid ${active ? tint.border : 'var(--border)'}`,
                                                    background: active ? tint.bg : 'var(--surface-white)',
                                                    color: active ? tint.color : 'var(--text-primary)',
                                                    transition: 'all 0.15s ease',
                                                }}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                    {genderOptions.length > 0 && <span style={{ width: '1px', height: '18px', background: 'var(--border)' }} />}
                                </>
                            )}
                            {genderOptions.length > 0 && (
                                <>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, userSelect: 'none' }}>GENDER</span>
                                    {genderOptions.map(opt => {
                                        const active = genderFilter === opt.id;
                                        const tint = ACTIVE_CHIP_STYLE.gender;
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setGenderFilter?.(active ? '' : opt.id)}
                                                aria-pressed={active}
                                                style={{
                                                    height: '28px',
                                                    borderRadius: 'var(--radius-round)',
                                                    padding: '0 10px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    border: `1px solid ${active ? tint.border : 'var(--border)'}`,
                                                    background: active ? tint.bg : 'var(--surface-white)',
                                                    color: active ? tint.color : 'var(--text-primary)',
                                                    transition: 'all 0.15s ease',
                                                }}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                    {ageOptions.length > 0 && <span style={{ width: '1px', height: '18px', background: 'var(--border)' }} />}
                                </>
                            )}
                            {ageOptions.length > 0 && (
                                <>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, userSelect: 'none' }}>AGE</span>
                                    {ageOptions.map(opt => {
                                        const active = ageFilter === opt.id;
                                        const tint = ACTIVE_CHIP_STYLE.age;
                                        return (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => setAgeFilter?.(active ? '' : opt.id)}
                                                aria-pressed={active}
                                                style={{
                                                    height: '28px',
                                                    borderRadius: 'var(--radius-round)',
                                                    padding: '0 10px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    border: `1px solid ${active ? tint.border : 'var(--border)'}`,
                                                    background: active ? tint.bg : 'var(--surface-white)',
                                                    color: active ? tint.color : 'var(--text-primary)',
                                                    transition: 'all 0.15s ease',
                                                }}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
