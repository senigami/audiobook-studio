import React from 'react';
import { Merge, SplitSquareHorizontal, Trash2, UserRound } from 'lucide-react';
import type { 
  Character, ProductionBlock, SpeakerProfile 
} from '../../../types';
import { 
  getBadgeStyle, getCharacterName, getVoiceName, type BlockBadge 
} from '../../../utils/productionTabHelpers';

interface ProductionBlockItemProps {
  block: ProductionBlock;
  index: number;
  isActive: boolean;
  isHovered: boolean;
  statusBadge: BlockBadge;
  characters: Character[];
  speakerProfiles: SpeakerProfile[];
  selectedCharacterId: string | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onTextChange: (text: string) => void;
  onSplit: () => void;
  onMergePrev: () => void;
  onMergeNext: () => void;
  onDelete: () => void;
  onApplyCharacter: () => void;
  canMergePrev: boolean;
  canMergeNext: boolean;
  textAreaRef: (node: HTMLTextAreaElement | null) => void;
}

export const ProductionBlockItem: React.FC<ProductionBlockItemProps> = ({
  block,
  index,
  isActive,
  isHovered,
  statusBadge,
  characters,
  speakerProfiles,
  selectedCharacterId,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onTextChange,
  onSplit,
  onMergePrev,
  onMergeNext,
  onDelete,
  onApplyCharacter,
  canMergePrev,
  canMergeNext,
  textAreaRef
}) => {
  const character = characters.find(char => char.id === block.character_id) || null;

  return (
    <section
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'relative',
        borderRadius: '16px',
        border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
        background: isHovered || isActive ? 'var(--surface)' : 'var(--surface-light)',
        boxShadow: isActive ? '0 0 0 3px rgba(var(--accent-rgb), 0.08)' : 'none',
        overflow: 'hidden',
        transition: 'all 0.15s ease',
        borderLeft: `4px solid ${character?.color || 'var(--text-muted)'}`
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '1rem 1rem 0.75rem'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.92rem' }}>Block {index + 1}</strong>
            <span style={{ ...getBadgeStyle(statusBadge.tone), border: `1px solid ${getBadgeStyle(statusBadge.tone).borderColor || 'var(--border)'}`, borderRadius: '999px', padding: '0.18rem 0.5rem', fontSize: '0.72rem', fontWeight: 700 }}>
              {statusBadge.label}
            </span>
            {block.source_segment_ids.length > 0 && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                {block.source_segment_ids.length} source segments
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>{getCharacterName(characters, block.character_id)}</span>
            <span>•</span>
            <span>{getVoiceName(speakerProfiles, block.speaker_profile_name)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '0.4rem' }}>
          {selectedCharacterId && (
            <button
              type="button"
              onClick={onApplyCharacter}
              className="btn-ghost"
              style={{
                padding: '0.35rem 0.65rem',
                fontSize: '0.76rem',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              <UserRound size={13} />
              {selectedCharacterId === 'CLEAR_ASSIGNMENT' ? 'Clear assignment' : 'Apply selection'}
            </button>
          )}
          <button
            type="button"
            onClick={onSplit}
            className="btn-ghost"
            disabled={block.text.trim().length === 0}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.76rem', border: '1px solid var(--border)', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            title="Split at the cursor or in the middle"
          >
            <SplitSquareHorizontal size={13} />
            Split
          </button>
          <button
            type="button"
            onClick={onMergePrev}
            className="btn-ghost"
            disabled={!canMergePrev}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.76rem', border: '1px solid var(--border)', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', opacity: canMergePrev ? 1 : 0.4 }}
            title="Merge with the previous block"
          >
            <Merge size={13} />
            Prev
          </button>
          <button
            type="button"
            onClick={onMergeNext}
            className="btn-ghost"
            disabled={!canMergeNext}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.76rem', border: '1px solid var(--border)', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', opacity: canMergeNext ? 1 : 0.4 }}
            title="Merge with the next block"
          >
            <Merge size={13} />
            Next
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="btn-ghost"
            style={{
              padding: '0.35rem 0.65rem',
              fontSize: '0.76rem',
              border: '1px solid var(--error-muted)',
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              color: 'var(--error)'
            }}
            title="Delete block"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      </div>

      <div style={{ padding: '0 1rem 1rem' }}>
        <textarea
          ref={textAreaRef}
          value={block.text}
          onChange={(event) => onTextChange(event.target.value)}
          onFocus={onFocus}
          aria-label={`Production block ${index + 1} text`}
          rows={Math.max(4, Math.min(10, block.text.split('\n').length + 1))}
          style={{
            width: '100%',
            resize: 'vertical',
            minHeight: '120px',
            padding: '0.9rem 1rem',
            borderRadius: '12px',
            border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
            background: 'var(--bg)',
            color: 'var(--text-primary)',
            fontSize: '0.98rem',
            lineHeight: 1.6,
            outline: 'none'
          }}
        />

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginTop: '0.75rem',
          color: 'var(--text-secondary)',
          fontSize: '0.78rem'
        }}>
          <span>Source segments: {block.source_segment_ids.length ? block.source_segment_ids.join(', ') : 'none'}</span>
          <span>{block.text.trim().length} characters</span>
        </div>
      </div>
    </section>
  );
};
