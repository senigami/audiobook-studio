import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import type { 
  ChapterSegment, Character, ProductionBlock, 
  ProductionBlocksResponse, ProductionRenderBatch, SpeakerProfile 
} from '../../types';
import { useProductionTab } from '../../hooks/useProductionTab';
import { ProductionHeader } from './production/ProductionHeader';
import { ProductionBatchGrid } from './production/ProductionBatchGrid';
import { ProductionBlockItem } from './production/ProductionBlockItem';
import { ProductionFooterStats } from './production/ProductionFooterStats';

interface ProductionTabProps {
  chapterId: string;
  blocks: ProductionBlock[];
  renderBatches: ProductionRenderBatch[];
  baseRevisionId: string | null;
  characters: Character[];
  speakerProfiles: SpeakerProfile[];
  selectedCharacterId: string | null;
  selectedProfileName?: string | null;
  hoveredBlockId: string | null;
  setHoveredBlockId: (id: string | null) => void;
  activeBlockId: string | null;
  setActiveBlockId: (id: string | null) => void;
  onBulkAssign: (segmentIds: string[]) => void;
  onBulkReset: (segmentIds: string[]) => void;
  onSaveBlocks: (blocks: ProductionBlock[]) => Promise<any>;
  onGenerateBatch?: (segmentIds: string[]) => void;
  saveConflictError?: string | null;
  onReloadBlocks: () => Promise<ProductionBlocksResponse | null>;
  pendingSegmentIds: Set<string>;
  queuedSegmentIds: Set<string>;
  segments: ChapterSegment[];
  segmentsCount: number;
}

export const ProductionTab: React.FC<ProductionTabProps> = ({
  chapterId,
  blocks,
  renderBatches,
  baseRevisionId,
  characters,
  speakerProfiles,
  selectedCharacterId,
  selectedProfileName,
  hoveredBlockId,
  setHoveredBlockId,
  activeBlockId,
  setActiveBlockId,
  onBulkAssign,
  onBulkReset,
  onSaveBlocks,
  onGenerateBatch,
  saveConflictError,
  onReloadBlocks,
  pendingSegmentIds,
  queuedSegmentIds,
  segments,
  segmentsCount
}) => {
  const {
    draftBlocks,
    dirtyIds,
    rawOverrideIds,
    saving,
    reloading,
    saveError,
    textAreaRefs,
    handleManualReload,
    handleTextChange,
    handleSplit,
    mergeWithNeighbor,
    handleDelete,
    applyCharacterSelection,
    handleSave,
    blockStatusLookup
  } = useProductionTab({
    chapterId,
    blocks,
    segments,
    pendingSegmentIds,
    queuedSegmentIds,
    onSaveBlocks,
    onReloadBlocks,
    onBulkAssign,
    onBulkReset,
    selectedCharacterId,
    selectedProfileName
  });

  const showRawTextWarning = rawOverrideIds.size > 0;
  const activeIndex = draftBlocks.findIndex(b => b.id === activeBlockId);

  return (
    <div style={{
      flex: 1,
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '1.5rem',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      <ProductionHeader 
        blocksCount={draftBlocks.length}
        segmentsCount={segmentsCount}
        baseRevisionId={baseRevisionId}
        dirtyCount={dirtyIds.size}
        reloading={reloading}
        saving={saving}
        onReload={handleManualReload}
        onSave={() => void handleSave()}
      />

      {saveConflictError && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem 1.5rem',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          color: 'rgb(185, 28, 28)',
          fontSize: '0.94rem'
        }}>
          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong>Save Conflict:</strong> {saveConflictError}
            <div style={{ marginTop: '0.25rem', fontSize: '0.88rem', opacity: 0.9 }}>
              The chapter has been updated since you started editing. Please reload the latest blocks to reconcile. Your local edits will be discarded on reload.
            </div>
          </div>
          <button
            onClick={handleManualReload}
            disabled={reloading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              background: 'rgb(185, 28, 28)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: reloading ? 'not-allowed' : 'pointer',
              fontSize: '0.88rem',
              fontWeight: 600,
              opacity: reloading ? 0.7 : 1
            }}
          >
            <RefreshCcw size={16} className={reloading ? 'animate-spin' : ''} />
            Reload Latest
          </button>
        </div>
      )}

      {saveError && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.85rem 1rem',
          borderRadius: '12px',
          border: '1px solid var(--error-muted)',
          background: 'rgba(239, 68, 68, 0.08)',
          color: 'var(--error)'
        }}>
          <AlertTriangle size={16} />
          {saveError}
        </div>
      )}

      {showRawTextWarning && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
          padding: '0.9rem 1rem',
          borderRadius: '12px',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          background: 'rgba(245, 158, 11, 0.08)',
          color: 'rgb(146 64 14)'
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <strong style={{ fontSize: '0.88rem' }}>Raw text override in progress</strong>
            <span style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
              Editing block text directly can shift source segment assignments. Save the block draft before queueing or exporting.
            </span>
          </div>
        </div>
      )}

      <ProductionBatchGrid 
        renderBatches={renderBatches}
        draftBlocks={draftBlocks}
        dirtyCount={dirtyIds.size}
        onGenerateBatch={onGenerateBatch}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {draftBlocks.map((block, index) => {
          const statusBadge = blockStatusLookup.get(block.id) || { label: 'Draft', tone: 'muted' as const };
          const isHovered = hoveredBlockId === block.id;
          const isActive = activeBlockId === block.id;
          const canMergePrev = index > 0;
          const canMergeNext = index < draftBlocks.length - 1;

          return (
            <ProductionBlockItem 
              key={block.id}
              block={block}
              index={index}
              isActive={isActive}
              isHovered={isHovered}
              statusBadge={statusBadge}
              characters={characters}
              speakerProfiles={speakerProfiles}
              selectedCharacterId={selectedCharacterId}
              onMouseEnter={() => setHoveredBlockId(block.id)}
              onMouseLeave={() => setHoveredBlockId(null)}
              onFocus={() => setActiveBlockId(block.id)}
              onTextChange={(val) => handleTextChange(block.id, val)}
              onSplit={() => handleSplit(block.id)}
              onMergePrev={() => mergeWithNeighbor(block.id, 'prev')}
              onMergeNext={() => mergeWithNeighbor(block.id, 'next')}
              onDelete={() => handleDelete(block.id)}
              onApplyCharacter={() => applyCharacterSelection(block)}
              canMergePrev={canMergePrev}
              canMergeNext={canMergeNext}
              textAreaRef={node => { textAreaRefs.current[block.id] = node; }}
            />
          );
        })}
      </div>

      {draftBlocks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <AlertTriangle size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <p>No production blocks loaded for this chapter.</p>
        </div>
      )}

      <ProductionFooterStats 
        selectedCharacterId={selectedCharacterId}
        characters={characters}
        dirtyCount={dirtyIds.size}
        activeIndex={activeIndex}
      />
    </div>
  );
};
