/**
 * VoicesTabHeader.tsx — R5-T4 (+ task 005: compact MultiSelect filter bar)
 *
 * Restyles the existing header controls with:
 * - "My Voices" / "🤗 Discover" tab pills row at the top
 * - CLASS/GENDER/AGE render as three compact MultiSelects in a single row
 *   (task 005) instead of stacked toggle-button rows; a fourth, visually
 *   separated MultiSelect covers the free-form tag filter.
 * - Toolbar buttons remain right-aligned
 * ALL existing controls and their handlers are preserved (R-C).
 *
 * H-5 (design-critique follow-up): CLASS/GENDER/AGE pass their matching
 * `category` to `MultiSelect` so selected chips pick up the same
 * `--pill-{category}-*` hue as the `VoicePill`s rendered elsewhere on this
 * page (indigo/pink/amber, design-system.md §5) instead of one generic
 * accent color for every facet. The free-form TAGS MultiSelect omits
 * `category` and stays neutral, matching how free tags render as ghost pills.
 */
import React, { useEffect, useState } from 'react';
import { Search, Plus, Info, Upload, Download, CheckSquare } from 'lucide-react';
import { GlassInput } from '@/components/forms/GlassInput';
import { GhostButton } from '@/components/ui/GhostButton';
import MultiSelect from '@/components/forms/MultiSelect';
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
    classFilter?: string[];
    setClassFilter?: (v: string[]) => void;
    classOptions?: FacetOption[];
    genderFilter?: string[];
    setGenderFilter?: (v: string[]) => void;
    genderOptions?: FacetOption[];
    ageFilter?: string[];
    setAgeFilter?: (v: string[]) => void;
    ageOptions?: FacetOption[];
    /** Free-form tag filter — not sourced from the taxonomy, visually separated from the three above. */
    tagFilter?: string[];
    setTagFilter?: (v: string[]) => void;
    tagOptions?: FacetOption[];
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
    /** Multi-select mode toggle (bulk delete/export) — omit to hide the control entirely. */
    selectMode?: boolean;
    onToggleSelectMode?: () => void;
}

export const VoicesTabHeader: React.FC<VoicesTabHeaderProps> = ({
    searchQuery,
    setSearchQuery,
    engineFilter,
    setEngineFilter,
    engineFilterOptions,
    classFilter = [],
    setClassFilter,
    classOptions = [],
    genderFilter = [],
    setGenderFilter,
    genderOptions = [],
    ageFilter = [],
    setAgeFilter,
    ageOptions = [],
    tagFilter = [],
    setTagFilter,
    tagOptions = [],
    isImportingVoice,
    exportVoiceDisabled,
    importInputRef,
    onImportClick,
    onExportClick,
    onCreateClick,
    onGuideClick,
    activeTab = 'local',
    onTabChange,
    selectMode = false,
    onToggleSelectMode,
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
        <div className="voices-tab-header">
            {/* Row 1: Tab pills + toolbar buttons */}
            <div className="voices-tab-header__toolbar-row">
                {/* Tab pills: My Voices / Discover */}
                <div className="voices-tab-header__tab-pills">
                    {(['local', 'discover'] as const).map(tab => {
                        const isActive = activeTab === tab;
                        return (
                            <button
                                key={tab}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => onTabChange?.(tab)}
                                className="voices-tab-pill"
                                style={{
                                    border: `1px solid ${isActive ? 'var(--accent-tint-border)' : 'var(--border)'}`,
                                    background: isActive ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                                    color: isActive ? 'var(--action-primary)' : 'var(--text-secondary)',
                                }}
                            >
                                {tab === 'local' ? 'My Voices' : '🤗 Discover'}
                            </button>
                        );
                    })}
                </div>

                {/* Toolbar: import / export / create / guide */}
                <div className="voices-tab-header__toolbar">
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".zip,application/zip"
                        aria-label="Import voice bundle file"
                        className="voices-tab-header__hidden-file-input"
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
                    {onToggleSelectMode && activeTab === 'local' && (
                        <GhostButton
                            onClick={onToggleSelectMode}
                            icon={CheckSquare}
                            label={isCompactToolbar ? undefined : (selectMode ? 'Cancel Select' : 'Select')}
                            ariaLabel={selectMode ? 'Cancel voice selection' : 'Select voices'}
                            title={selectMode ? 'Cancel voice selection' : 'Select voices'}
                            isActive={selectMode}
                        />
                    )}
                    <div className="mobile-hide voices-toolbar-divider" />
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
                <div className="voices-tab-header__search-row">
                    {/* Search */}
                    <div className="voices-tab-header__search-wrap">
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
                    <div className="voice-chip-row">
                        {engineFilterOptions.map((option) => {
                            const active = engineFilter === option.key;
                            return (
                                <button
                                    key={option.key}
                                    onClick={() => setEngineFilter(option.key)}
                                    className={`${active ? 'btn-primary' : 'btn-glass'} voices-engine-filter-btn`}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Facet filters — task 005: three compact taxonomy-sourced MultiSelects
                        (CLASS/GENDER/AGE, OR-within-facet) side-by-side, plus a free-form
                        tag MultiSelect visually separated by a vertical divider. */}
                    {(classOptions.length > 0 || genderOptions.length > 0 || ageOptions.length > 0 || tagOptions.length > 0) && (
                        <div className="voice-facet-filter-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            {classOptions.length > 0 && (
                                <div data-testid="class-facet-filter" style={{ width: '160px' }}>
                                    <MultiSelect
                                        options={classOptions}
                                        value={classFilter}
                                        onChange={(v) => setClassFilter?.(v)}
                                        placeholder="Class"
                                        label="CLASS"
                                        category="class"
                                    />
                                </div>
                            )}
                            {genderOptions.length > 0 && (
                                <div data-testid="gender-facet-filter" style={{ width: '160px' }}>
                                    <MultiSelect
                                        options={genderOptions}
                                        value={genderFilter}
                                        onChange={(v) => setGenderFilter?.(v)}
                                        placeholder="Gender"
                                        label="GENDER"
                                        category="gender"
                                    />
                                </div>
                            )}
                            {ageOptions.length > 0 && (
                                <div data-testid="age-facet-filter" style={{ width: '160px' }}>
                                    <MultiSelect
                                        options={ageOptions}
                                        value={ageFilter}
                                        onChange={(v) => setAgeFilter?.(v)}
                                        placeholder="Age"
                                        label="AGE"
                                        category="age"
                                    />
                                </div>
                            )}
                            {tagOptions.length > 0 && (
                                <>
                                    <span className="voice-facet-divider" aria-hidden="true" />
                                    <div data-testid="tag-facet-filter" style={{ width: '160px' }}>
                                        {/* Free-form tag filter stays neutral/generic — no `category`,
                                            matching how free tags render as ghost pills (no facet hue)
                                            per design-system.md §5 (H-5). */}
                                        <MultiSelect
                                            options={tagOptions}
                                            value={tagFilter}
                                            onChange={(v) => setTagFilter?.(v)}
                                            placeholder="Tags"
                                            label="TAGS"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
