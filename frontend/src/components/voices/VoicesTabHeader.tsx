import React from 'react';
import { Search, Plus, Info, Upload, Download } from 'lucide-react';
import { GlassInput } from '../GlassInput';
import { GhostButton } from '../GhostButton';
import type { VoiceEngine } from '../../types';

interface VoicesTabHeaderProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    engineFilter: 'all' | 'disabled' | VoiceEngine;
    setEngineFilter: (filter: 'all' | 'disabled' | VoiceEngine) => void;
    engineFilterOptions: Array<{ key: 'all' | 'disabled' | VoiceEngine; label: string }>;
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
    isImportingVoice,
    exportVoiceDisabled,
    importInputRef,
    onImportClick,
    onExportClick,
    onCreateClick,
    onGuideClick
}) => {
    return (
        <div style={{ 
            padding: '1.25rem 2rem', 
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--surface-light)',
            zIndex: 10
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Voices</h2>
                
                <div style={{ position: 'relative' }}>
                    <GlassInput
                        icon={<Search size={16} />}
                        placeholder="Search voices..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="search-responsive"
                        style={{
                            width: '240px',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.width = '320px';
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.width = '240px';
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
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                    label="Export Voice"
                    disabled={exportVoiceDisabled}
                />
                <GhostButton
                    onClick={() => importInputRef.current?.click()}
                    icon={Upload}
                    label={isImportingVoice ? 'Importing...' : 'Import Voice'}
                    disabled={isImportingVoice}
                />

                <GhostButton 
                    onClick={onCreateClick} 
                    icon={Plus}
                    label="New Voice"
                />
                
                <div className="mobile-hide" style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />
                
                <GhostButton 
                    onClick={onGuideClick} 
                    icon={Info}
                    label="Recording Guide"
                />
            </div>
        </div>
    );
};
