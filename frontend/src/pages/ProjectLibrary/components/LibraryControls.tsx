import React from 'react';
import { LayoutGrid, List, SortAsc } from 'lucide-react';

interface LibraryControlsProps {
    viewMode: 'grid' | 'list';
    onViewModeChange: (mode: 'grid' | 'list') => void;
    sortOption: 'updated-desc' | 'created-desc' | 'title-asc' | 'title-desc';
    onSortOptionChange: (option: 'updated-desc' | 'created-desc' | 'title-asc' | 'title-desc') => void;
}

export const LibraryControls: React.FC<LibraryControlsProps> = ({
    viewMode,
    onViewModeChange,
    sortOption,
    onSortOptionChange
}) => {
    return (
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
                        onChange={(e) => onSortOptionChange(e.target.value as any)}
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
                        <option value="title-asc">Title A-Z</option>
                        <option value="title-desc">Title Z-A</option>
                    </select>
                </div>
            </div>
        </div>
    );
};
