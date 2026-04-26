import React from 'react';
import { RefreshCcw, Save } from 'lucide-react';

interface ProductionHeaderProps {
  blocksCount: number;
  segmentsCount: number;
  baseRevisionId: string | null;
  dirtyCount: number;
  reloading: boolean;
  saving: boolean;
  onReload: () => void;
  onSave: () => void;
}

export const ProductionHeader: React.FC<ProductionHeaderProps> = ({
  blocksCount,
  segmentsCount,
  baseRevisionId,
  dirtyCount,
  reloading,
  saving,
  onReload,
  onSave
}) => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '1rem',
      padding: '1rem',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      background: 'var(--surface-light)'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Production Blocks</h3>
          <span style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.72rem', fontWeight: 700 }}>
            {blocksCount} blocks
          </span>
          <span style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.72rem', fontWeight: 700 }}>
            {segmentsCount} segments
          </span>
          {baseRevisionId && (
            <span style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid rgba(var(--accent-rgb), 0.3)', color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 700 }}>
              Base {baseRevisionId.slice(0, 8)}
            </span>
          )}
        </div>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '64ch' }}>
          Edit the production blocks directly. Raw text changes can override the current block and segment assignment map, so save once the block boundaries look right.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {dirtyCount > 0 && (
          <button
            type="button"
            onClick={onReload}
            disabled={reloading || saving}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.6rem 1rem',
              fontSize: '0.86rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              cursor: (reloading || saving) ? 'not-allowed' : 'pointer'
            }}
            title="Discard changes and reload latest blocks"
          >
            <RefreshCcw size={14} className={reloading ? 'animate-spin' : ''} />
            Reload Latest
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || dirtyCount === 0}
          className="btn-primary"
          style={{
            minWidth: '140px',
            padding: '0.6rem 1rem',
            fontSize: '0.86rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            opacity: saving || dirtyCount === 0 ? 0.5 : 1
          }}
        >
          {saving ? <RefreshCcw size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving...' : 'Save Blocks'}
        </button>
      </div>
    </div>
  );
};
