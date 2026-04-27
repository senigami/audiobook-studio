import React from 'react';
import type { Character } from '../../../types';
import { getCharacterName } from '../../../utils/productionTabHelpers';

interface ProductionFooterStatsProps {
  selectedCharacterId: string | null;
  characters: Character[];
  dirtyCount: number;
  activeIndex: number; // -1 if no active block
}

export const ProductionFooterStats: React.FC<ProductionFooterStatsProps> = ({
  selectedCharacterId,
  characters,
  dirtyCount,
  activeIndex
}) => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
      gap: '0.75rem',
      paddingTop: '0.5rem'
    }}>
      <div style={{ padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
          Current selection
        </div>
        <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>
          {selectedCharacterId === 'CLEAR_ASSIGNMENT'
            ? 'Clear assignment mode'
            : selectedCharacterId
              ? getCharacterName(characters, selectedCharacterId)
              : 'No character selected'}
        </div>
      </div>

      <div style={{ padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
          Dirty blocks
        </div>
        <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>
          {dirtyCount === 0 ? 'All blocks saved' : `${dirtyCount} block${dirtyCount === 1 ? '' : 's'} pending save`}
        </div>
      </div>

      <div style={{ padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
          Active block
        </div>
        <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>
          {activeIndex >= 0 ? `Block ${activeIndex + 1}` : 'None selected'}
        </div>
      </div>
    </div>
  );
};
