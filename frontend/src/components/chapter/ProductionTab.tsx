import React from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import type { ChapterSegment, Character } from '../../types';

interface ProductionTabProps {
  paragraphGroups: { characterId: string | null; segments: ChapterSegment[] }[];
  characters: Character[];
  selectedCharacterId: string | null;
  hoveredSegmentId: string | null;
  setHoveredSegmentId: (id: string | null) => void;
  activeSegmentId: string | null;
  setActiveSegmentId: (id: string | null) => void;
  onBulkAssign: (sids: string[]) => void;
  onBulkReset: (sids: string[]) => void;
  segmentsCount: number;
}

export const ProductionTab: React.FC<ProductionTabProps> = ({
  paragraphGroups,
  characters,
  selectedCharacterId,
  hoveredSegmentId,
  setHoveredSegmentId,
  activeSegmentId,
  setActiveSegmentId,
  onBulkAssign,
  onBulkReset,
  segmentsCount
}) => {
  return (
    <div style={{ 
      flex: 1, 
      background: 'var(--bg)', 
      border: '1px solid var(--border)', 
      borderRadius: '12px', 
      padding: '2rem', 
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      {paragraphGroups.map((group, gidx) => {
        const char = characters.find(c => c.id === group.characterId);
        const isSelectedCharLines = selectedCharacterId && group.characterId === selectedCharacterId;
        const isHovered = hoveredSegmentId === group.segments[0].id;
        
        return (
          <div 
            key={gidx}
            onMouseEnter={() => setHoveredSegmentId(group.segments[0].id)}
            onMouseLeave={() => setHoveredSegmentId(null)}
            onClick={() => {
                if (selectedCharacterId) {
                    onBulkAssign(group.segments.map(s => s.id));
                } else {
                    setActiveSegmentId(group.segments[0].id === activeSegmentId ? null : group.segments[0].id);
                }
            }}
            style={{ 
              display: 'flex',
              padding: '0.75rem 1.25rem',
              borderRadius: '8px',
              background: isSelectedCharLines ? `${char?.color || '#94a3b8'}15` : (isHovered ? 'var(--surface-light)' : 'transparent'),
              borderLeft: `4px solid ${char ? char.color : 'var(--text-muted)'}`,
              cursor: (selectedCharacterId && selectedCharacterId !== 'CLEAR_ASSIGNMENT') ? 'copy' : (selectedCharacterId === 'CLEAR_ASSIGNMENT' ? 'crosshair' : 'pointer'),
              transition: 'all 0.1s ease',
              gap: '2rem',
              boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            {/* Character/Voice column */}
            <div style={{ 
                width: '140px', 
                flexShrink: 0, 
                fontSize: '0.8rem', 
                fontWeight: 700,
                color: char ? char.color : 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
            }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {char?.name || 'NARRATOR'}
                </div>
                {group.segments[0].speaker_profile_name && (
                    <div style={{ 
                        fontSize: '0.6rem', 
                        background: 'rgba(255,255,255,0.05)', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        width: 'fit-content',
                        opacity: 0.8,
                        fontWeight: 600,
                        textTransform: 'none',
                        letterSpacing: 'normal'
                    }}>
                        {group.segments[0].speaker_profile_name}
                    </div>
                )}
            </div>

            {/* Text column */}
            <div style={{ flex: 1 }}>
                <p style={{ 
                    fontSize: '1rem', 
                    color: 'var(--text-primary)', 
                    margin: 0, 
                    lineHeight: 1.6,
                    opacity: (selectedCharacterId && !isSelectedCharLines) ? 0.5 : 1,
                    whiteSpace: 'pre-wrap'
                }}>
                    {group.segments.map(s => s.text_content).join('')}
                </p>
            </div>

            {/* Quick status/actions */}
            <div style={{ width: '80px', flexShrink: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                {group.segments.every(s => s.audio_status === 'done') && (
                    <div title="Audio Generated" style={{ color: 'var(--success-muted)' }}>
                        <CheckCircle size={14} />
                    </div>
                )}
                {activeSegmentId === group.segments[0].id && !selectedCharacterId && (
                   <div style={{ display: 'flex', gap: '4px' }}>
                       <button 
                         className="btn-ghost" 
                         style={{ padding: '2px 4px', fontSize: '0.7rem' }}
                         onClick={(e) => {
                             e.stopPropagation();
                             onBulkReset(group.segments.map(s => s.id));
                         }}
                       >
                           Reset
                       </button>
                   </div>
                )}
            </div>
          </div>
        );
      })}
      
      {segmentsCount === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <AlertTriangle size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <p>No segments found. Save the chapter text to generate segments.</p>
        </div>
      )}
    </div>
  );
};
