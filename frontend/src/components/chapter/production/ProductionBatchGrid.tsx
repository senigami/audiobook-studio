import React from 'react';
import { RefreshCcw, Zap } from 'lucide-react';
import type { ProductionBlock, ProductionRenderBatch } from '../../../types';
import { getBadgeStyle } from '../../../utils/productionTabHelpers';

interface ProductionBatchGridProps {
  renderBatches: ProductionRenderBatch[];
  draftBlocks: ProductionBlock[];
  dirtyCount: number;
  onGenerateBatch?: (segmentIds: string[]) => void;
}

export const ProductionBatchGrid: React.FC<ProductionBatchGridProps> = ({
  renderBatches,
  draftBlocks,
  dirtyCount,
  onGenerateBatch
}) => {
  if (renderBatches.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.65rem',
      padding: '1rem',
      borderRadius: '12px',
      border: '1px solid var(--border)',
      background: 'var(--surface)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <strong style={{ fontSize: '0.88rem' }}>Render batches</strong>
        <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
          Derived from adjacent compatible blocks
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem' }}>
        {renderBatches.map(batch => {
          const statusLower = batch.status.toLowerCase();
          const batchBadge = statusLower === 'stale' 
            ? { label: 'Stale', tone: 'warning' as const }
            : (statusLower === 'queued' ? { label: 'Queued', tone: 'warning' as const } 
            : (statusLower === 'rendering' || statusLower === 'running' || statusLower === 'processing' ? { label: 'Rendering', tone: 'accent' as const }
            : (statusLower === 'failed' || statusLower === 'error' ? { label: 'Failed', tone: 'danger' as const }
            : (statusLower === 'needs_review' ? { label: 'Review', tone: 'info' as const }
            : (statusLower === 'rendered' || statusLower === 'done' ? { label: 'Rendered', tone: 'success' as const }
            : { label: batch.status, tone: 'muted' as const })))));

          const batchSegmentIds = batch.block_ids.flatMap(blockId => {
            const block = draftBlocks.find(b => b.id === blockId);
            return block ? block.source_segment_ids : [];
          });

          const isGenerating = statusLower === 'queued' || statusLower === 'rendering' || statusLower === 'running' || statusLower === 'processing';
          
          let actionLabel = 'Generate';
          let recoveryMsg = null;
          if (statusLower === 'rendered' || statusLower === 'done') {
            actionLabel = 'Rebuild';
          } else if (statusLower === 'stale') {
            actionLabel = 'Rebuild';
            recoveryMsg = 'Text changed since render';
          } else if (statusLower === 'failed' || statusLower === 'error') {
            actionLabel = 'Retry';
            recoveryMsg = 'Last render failed';
          }

          return (
            <div
              key={batch.id}
              style={{
                padding: '0.8rem',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--surface-light)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>Batch {batch.id.slice(0, 6)}</span>
                  {recoveryMsg && (
                    <span style={{ fontSize: '0.68rem', color: statusLower === 'stale' ? 'rgb(180 83 9)' : 'rgb(185 28 28)', fontWeight: 500 }}>
                      {recoveryMsg}
                    </span>
                  )}
                </div>
                <span style={{ ...getBadgeStyle(batchBadge.tone), border: '1px solid var(--border)', borderRadius: '999px', padding: '0.18rem 0.45rem', fontSize: '0.7rem', fontWeight: 700 }}>
                  {batchBadge.label}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {batch.block_ids.length} blocks · {batch.estimated_work_weight} units
                </span>
                <button
                  type="button"
                  onClick={() => onGenerateBatch?.(batchSegmentIds)}
                  disabled={isGenerating || !onGenerateBatch || dirtyCount > 0}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: '6px',
                    background: isGenerating ? 'var(--surface)' : 'var(--accent)',
                    color: isGenerating ? 'var(--text-muted)' : 'white',
                    border: 'none',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: isGenerating || dirtyCount > 0 ? 'not-allowed' : 'pointer',
                    opacity: isGenerating || dirtyCount > 0 ? 0.6 : 1
                  }}
                  title={dirtyCount > 0 ? "Save blocks before generating" : `${actionLabel} ${batch.id}`}
                >
                  {isGenerating ? <RefreshCcw size={12} className="animate-spin" /> : <Zap size={12} />}
                  {isGenerating ? 'Queued' : actionLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
