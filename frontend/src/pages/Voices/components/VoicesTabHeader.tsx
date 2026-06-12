import React, { useEffect, useState } from 'react';
import { Search, Plus, Info, Upload, Download } from 'lucide-react';
import { GlassInput } from '@/components/forms/GlassInput';
import { GhostButton } from '@/components/ui/GhostButton';
import type { VoiceEngine } from '@/types';

const COMPACT_TOOLBAR_WIDTH = 960;

interface FacetOption { id: string; label: string; }

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
}

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
    onGuideClick
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
            padding: '1.25rem 2rem', 
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            background: 'var(--surface-light)',
            zIndex: 10
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', minWidth: 0 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Voices</h2>
                
                <div style={{ position: 'relative' }}>
                    <GlassInput
                        icon={<Search size={16} />}
                        placeholder="Search voices..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-responsive"
                        style={{
                            width: isCompactToolbar ? '180px' : '240px',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.width = isCompactToolbar ? '220px' : '320px';
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.width = isCompactToolbar ? '180px' : '240px';
                        }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {engineFilterOptions.map((option) => {
                        const active = engineFilter === option.key;
                        return (
                            <button
                                key={option.key}
                                onClick={() => setEngineFilter(option.key)}
                                className={active ? 'btn-primary' : 'btn-glass'}
                                style={{ height: '34px', borderRadius: '999px', padding: '0 12px', fontSize: '0.75rem', fontWeight: 800 }}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>

                {/* Facet filter pills — class / gender / age */}
                {(classOptions.length > 0 || genderOptions.length > 0 || ageOptions.length > 0) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {classOptions.length > 0 && (
                            <>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>CLASS</span>
                                {classOptions.map(opt => {
                                    const active = classFilter === opt.id;
                                    return (
                                        <button
                                            key={opt.id}
                                            onClick={() => setClassFilter?.(active ? '' : opt.id)}
                                            aria-pressed={active}
                                            className={active ? 'btn-primary' : 'btn-glass'}
                                            style={{ height: '30px', borderRadius: '999px', padding: '0 10px', fontSize: '0.72rem', fontWeight: 800 }}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                                {genderOptions.length > 0 && <span style={{ width: '1px', height: '20px', background: 'var(--border)' }} />}
                            </>
                        )}
                        {genderOptions.length > 0 && (
                            <>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>GENDER</span>
                                {genderOptions.map(opt => {
                                    const active = genderFilter === opt.id;
                                    return (
                                        <button
                                            key={opt.id}
                                            onClick={() => setGenderFilter?.(active ? '' : opt.id)}
                                            aria-pressed={active}
                                            className={active ? 'btn-primary' : 'btn-glass'}
                                            style={{ height: '30px', borderRadius: '999px', padding: '0 10px', fontSize: '0.72rem', fontWeight: 800 }}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                                {ageOptions.length > 0 && <span style={{ width: '1px', height: '20px', background: 'var(--border)' }} />}
                            </>
                        )}
                        {ageOptions.length > 0 && (
                            <>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>AGE</span>
                                {ageOptions.map(opt => {
                                    const active = ageFilter === opt.id;
                                    return (
                                        <button
                                            key={opt.id}
                                            onClick={() => setAgeFilter?.(active ? '' : opt.id)}
                                            aria-pressed={active}
                                            className={active ? 'btn-primary' : 'btn-glass'}
                                            style={{ height: '30px', borderRadius: '999px', padding: '0 10px', fontSize: '0.72rem', fontWeight: 800 }}
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
    );
};
