import React from 'react';
import { LayoutGrid, List, SortAsc } from 'lucide-react';
import { COVER_SIZES } from '../lib/coverSize';

export type SortOption = 'updated-desc' | 'created-desc' | 'series-asc' | 'title-asc' | 'title-desc';
export type StatusFilter = 'all' | 'in-progress';

interface LibraryControlsProps {
    viewMode: 'grid' | 'list';
    onViewModeChange: (mode: 'grid' | 'list') => void;
    sortOption: SortOption;
    onSortOptionChange: (option: SortOption) => void;
    statusFilter: StatusFilter;
    onStatusFilterChange: (filter: StatusFilter) => void;
    coverSizeIdx: number;
    onCoverSizeIdxChange: (idx: number) => void;
}

// Quick-filter chips are shortcuts onto the existing sort dropdown, not a
// separate filtering mechanism — see design-docs/plans/active/
// north_star_screen_parity/tasks/004-library-all-books-header-and-filters.md.
// They supplement the dropdown rather than replace it (default per that task
// when the demo's exact replace-vs-supplement intent was ambiguous).
const RECENT_SORT: SortOption = 'updated-desc';
const AZ_SORT: SortOption = 'title-asc';

export const LibraryControls: React.FC<LibraryControlsProps> = ({
    viewMode,
    onViewModeChange,
    sortOption,
    onSortOptionChange,
    statusFilter,
    onStatusFilterChange,
    coverSizeIdx,
    onCoverSizeIdxChange
}) => {
    return (
        <div>
            {/* "All Books" section header + quick-filter chips + cover-size slider */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '0.75rem',
                padding: '0 0.5rem',
                flexWrap: 'wrap'
            }}>
                <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)'
                }}>
                    All Books
                </span>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} role="group" aria-label="Quick filters">
                    <button
                        type="button"
                        onClick={() => onSortOptionChange(RECENT_SORT)}
                        className="btn-chip"
                        aria-pressed={sortOption === RECENT_SORT}
                        style={{
                            padding: '0.3rem 0.7rem',
                            borderRadius: '999px',
                            border: sortOption === RECENT_SORT ? '1px solid var(--accent)' : '1px solid var(--border)',
                            background: sortOption === RECENT_SORT ? 'var(--accent-glow)' : 'transparent',
                            color: sortOption === RECENT_SORT ? 'var(--accent)' : 'var(--text-muted)',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            cursor: 'pointer'
                        }}
                    >
                        Recent
                    </button>
                    <button
                        type="button"
                        onClick={() => onSortOptionChange(AZ_SORT)}
                        className="btn-chip"
                        aria-pressed={sortOption === AZ_SORT}
                        style={{
                            padding: '0.3rem 0.7rem',
                            borderRadius: '999px',
                            border: sortOption === AZ_SORT ? '1px solid var(--accent)' : '1px solid var(--border)',
                            background: sortOption === AZ_SORT ? 'var(--accent-glow)' : 'transparent',
                            color: sortOption === AZ_SORT ? 'var(--accent)' : 'var(--text-muted)',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            cursor: 'pointer'
                        }}
                    >
                        A–Z
                    </button>
                    {/* "In Progress" is a real filter (drafting or casting projects), not a
                        sort shortcut like Recent/A–Z above — task 005 (north_star_screen_parity)
                        landed the per-project status data this depends on. */}
                    <button
                        type="button"
                        onClick={() => onStatusFilterChange(statusFilter === 'in-progress' ? 'all' : 'in-progress')}
                        className="btn-chip"
                        aria-pressed={statusFilter === 'in-progress'}
                        style={{
                            padding: '0.3rem 0.7rem',
                            borderRadius: '999px',
                            border: statusFilter === 'in-progress' ? '1px solid var(--accent)' : '1px solid var(--border)',
                            background: statusFilter === 'in-progress' ? 'var(--accent-glow)' : 'transparent',
                            color: statusFilter === 'in-progress' ? 'var(--accent)' : 'var(--text-muted)',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            cursor: 'pointer'
                        }}
                    >
                        In Progress
                    </button>
                </div>

                {viewMode === 'grid' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                        <span
                            aria-hidden="true"
                            style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-muted)', opacity: 0.5 }}
                        />
                        <input
                            type="range"
                            min={0}
                            max={COVER_SIZES.length - 1}
                            step={1}
                            value={coverSizeIdx}
                            onChange={(e) => onCoverSizeIdxChange(Number(e.target.value))}
                            aria-label="Cover size"
                            title="Cover size"
                            style={{ width: '90px', cursor: 'pointer' }}
                        />
                        <span
                            aria-hidden="true"
                            style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--text-muted)', opacity: 0.5 }}
                        />
                    </div>
                )}
            </div>

            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
                padding: '0 0.5rem'
            }}>
                <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-alt)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <button
                        onClick={() => onViewModeChange('grid')}
                        className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`}
                        aria-label="Grid View"
                        title="Grid View"
                        style={{
                            padding: '6px',
                            background: viewMode === 'grid' ? 'var(--surface)' : 'transparent',
                            borderRadius: '6px',
                            border: 'none',
                            color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: viewMode === 'grid' ? 'var(--shadow-sm)' : 'none'
                        }}
                    >
                        <LayoutGrid size={20} />
                    </button>
                    <button
                        onClick={() => onViewModeChange('list')}
                        className={`btn-icon ${viewMode === 'list' ? 'active' : ''}`}
                        aria-label="List View"
                        title="List View"
                        style={{
                            padding: '6px',
                            background: viewMode === 'list' ? 'var(--surface)' : 'transparent',
                            borderRadius: '6px',
                            border: 'none',
                            color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: viewMode === 'list' ? 'var(--shadow-sm)' : 'none'
                        }}
                    >
                        <List size={20} />
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <SortAsc size={18} style={{ position: 'absolute', left: '12px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <select
                            aria-label="Sort Projects"
                            value={sortOption}
                            onChange={(e) => onSortOptionChange(e.target.value as SortOption)}
                            style={{
                                padding: '0.6rem 1rem 0.6rem 2.25rem',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text-primary)',
                                fontSize: '0.9rem',
                                fontWeight: 500,
                                outline: 'none',
                                cursor: 'pointer',
                                appearance: 'none',
                                minWidth: '180px'
                            }}
                        >
                            <option value="updated-desc">Recently Updated</option>
                            <option value="created-desc">Newest First</option>
                            <option value="series-asc">Series A-Z</option>
                            <option value="title-asc">Title A-Z</option>
                            <option value="title-desc">Title Z-A</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
};
