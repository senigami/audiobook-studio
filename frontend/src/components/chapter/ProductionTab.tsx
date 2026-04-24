import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Merge, SplitSquareHorizontal, Save, Trash2, UserRound, RefreshCcw, Zap } from 'lucide-react';
import type { ChapterSegment, Character, ProductionBlock, ProductionBlocksResponse, ProductionRenderBatch, SpeakerProfile } from '../../types';
import { getVariantDisplayName } from '../../utils/voiceProfiles';

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

interface BlockBadge {
  label: string;
  tone: 'muted' | 'accent' | 'warning' | 'success' | 'danger' | 'info';
}

const createDraftId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalizeBlock = (block: ProductionBlock, orderIndex: number): ProductionBlock => ({
  ...block,
  order_index: orderIndex,
  text: block.text ?? '',
  source_segment_ids: Array.isArray(block.source_segment_ids) ? block.source_segment_ids : [],
});

const normalizeBlocks = (blocks: ProductionBlock[]) => {
  return [...blocks]
    .sort((a, b) => a.order_index - b.order_index)
    .map((block, index) => normalizeBlock(block, index));
};

const splitSourceIds = (sourceSegmentIds: string[]) => {
  if (sourceSegmentIds.length <= 1) {
    return { left: [...sourceSegmentIds], right: [] as string[] };
  }
  const midpoint = Math.max(1, Math.floor(sourceSegmentIds.length / 2));
  return {
    left: sourceSegmentIds.slice(0, midpoint),
    right: sourceSegmentIds.slice(midpoint),
  };
};

const mergeText = (left: string, right: string) => {
  const cleanedLeft = left.replace(/\s+$/, '');
  const cleanedRight = right.replace(/^\s+/, '');
  if (!cleanedLeft) return cleanedRight;
  if (!cleanedRight) return cleanedLeft;
  return `${cleanedLeft} ${cleanedRight}`;
};

const getSourceSegmentStatus = (segment?: ChapterSegment) => {
  if (!segment) return 'missing';
  return segment.audio_status;
};

const getBlockStatus = (
  block: ProductionBlock,
  dirtyIds: Set<string>,
  segmentLookup: Map<string, ChapterSegment>,
  pendingSegmentIds: Set<string>,
  queuedSegmentIds: Set<string>
): BlockBadge => {
  const status = (block.status || 'draft').toLowerCase();
  const sourceStates = block.source_segment_ids.map(id => getSourceSegmentStatus(segmentLookup.get(id)));
  const hasQueuedSource = block.source_segment_ids.some(id => queuedSegmentIds.has(id));
  const hasPendingSource = block.source_segment_ids.some(id => pendingSegmentIds.has(id));
  const hasProcessingSource = sourceStates.some(state => state === 'processing');
  const hasFailedSource = sourceStates.some(state => state === 'failed' || state === 'error' || state === 'cancelled');
  const hasUnresolvedSource = sourceStates.some(state => state === 'unprocessed' || state === 'missing');

  if (dirtyIds.has(block.id)) {
    return { label: 'Edited', tone: 'warning' };
  }

  if (status.includes('recover')) {
    return { label: 'Recovered', tone: 'info' };
  }

  if (status === 'failed' || status === 'error' || hasFailedSource) {
    return { label: 'Failed', tone: 'danger' };
  }

  if (status === 'stale') {
    return { label: 'Stale', tone: 'warning' };
  }

  if (status === 'queued' || hasQueuedSource) {
    return { label: 'Queued', tone: 'warning' };
  }

  if (status === 'running' || status === 'processing' || hasProcessingSource || hasPendingSource) {
    return { label: 'Rendering', tone: 'accent' };
  }

  if ((status === 'rendered' || status === 'done') && (hasPendingSource || hasUnresolvedSource)) {
    return { label: 'Stale', tone: 'warning' };
  }

  if (status === 'rendered' || status === 'done') {
    return { label: 'Rendered', tone: 'success' };
  }

  return { label: 'Draft', tone: 'muted' };
};

const getBadgeStyle = (tone: BlockBadge['tone']): React.CSSProperties => {
  switch (tone) {
    case 'accent':
      return { background: 'rgba(var(--accent-rgb), 0.14)', color: 'var(--accent)', borderColor: 'rgba(var(--accent-rgb), 0.35)' };
    case 'warning':
      return { background: 'rgba(245, 158, 11, 0.14)', color: 'rgb(180 83 9)', borderColor: 'rgba(245, 158, 11, 0.35)' };
    case 'success':
      return { background: 'rgba(34, 197, 94, 0.14)', color: 'rgb(21 128 61)', borderColor: 'rgba(34, 197, 94, 0.35)' };
    case 'danger':
      return { background: 'rgba(239, 68, 68, 0.14)', color: 'rgb(185 28 28)', borderColor: 'rgba(239, 68, 68, 0.35)' };
    case 'info':
      return { background: 'rgba(59, 130, 246, 0.14)', color: 'rgb(29 78 216)', borderColor: 'rgba(59, 130, 246, 0.35)' };
    case 'muted':
    default:
      return { background: 'var(--surface-light)', color: 'var(--text-secondary)', borderColor: 'var(--border)' };
  }
};

const getCharacterName = (characters: Character[], characterId: string | null) => {
  if (!characterId) return 'Narrator';
  return characters.find(c => c.id === characterId)?.name || 'Unknown character';
};

const getVoiceName = (speakerProfiles: SpeakerProfile[], voiceName: string | null) => {
  if (!voiceName) return 'No voice';
  const profile = speakerProfiles.find(p => p.name === voiceName);
  return getVariantDisplayName(profile || { name: voiceName, variant_name: null } as SpeakerProfile);
};

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
  const [draftBlocks, setDraftBlocks] = useState<ProductionBlock[]>(() => normalizeBlocks(blocks));
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [rawOverrideIds, setRawOverrideIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const textAreaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const lastCanonicalKeyRef = useRef('');

  const canonicalKey = useMemo(() => {
    return [
      chapterId,
      baseRevisionId || 'base:none',
      blocks.map(block => [
        block.id,
        block.order_index,
        block.text,
        block.character_id || 'none',
        block.speaker_profile_name || 'none',
        block.status || 'draft',
        block.source_segment_ids.join(',')
      ].join(':')).join('|')
    ].join('::');
  }, [chapterId, baseRevisionId, blocks]);

  useEffect(() => {
    if (canonicalKey === lastCanonicalKeyRef.current) {
      return;
    }
    lastCanonicalKeyRef.current = canonicalKey;
    if (dirtyIds.size > 0) {
      return;
    }
    setDraftBlocks(normalizeBlocks(blocks));
    setDirtyIds(new Set());
    setRawOverrideIds(new Set());
    setSaveError(null);
  }, [blocks, canonicalKey, dirtyIds.size]);

  const segmentLookup = useMemo(() => {
    return new Map(segments.map(segment => [segment.id, segment]));
  }, [segments]);

  const activeBlock = draftBlocks.find(block => block.id === activeBlockId) || null;
  const showRawTextWarning = rawOverrideIds.size > 0;

  const updateDraftBlocks = (
    nextBlocks: ProductionBlock[],
    dirtyIdsToMark: string[] = [],
    rawOverrideIdsToMark: string[] = []
  ) => {
    setDraftBlocks(nextBlocks);
    if (dirtyIdsToMark.length > 0) {
      const nextDirty = new Set(dirtyIds);
      dirtyIdsToMark.forEach(id => nextDirty.add(id));
      setDirtyIds(nextDirty);
    }
    if (rawOverrideIdsToMark.length > 0) {
      const nextRaw = new Set(rawOverrideIds);
      rawOverrideIdsToMark.forEach(id => nextRaw.add(id));
      setRawOverrideIds(nextRaw);
    }
  };

  const handleManualReload = async () => {
    setReloading(true);
    setSaveError(null);
    try {
      const result = await onReloadBlocks();
      if (!result) {
        throw new Error('Failed to reload the latest production blocks.');
      }
      const nextBlocks = normalizeBlocks(result.blocks);
      setDraftBlocks(nextBlocks);
      lastCanonicalKeyRef.current = [
        chapterId,
        result.base_revision_id || 'base:none',
        nextBlocks.map(block => [
          block.id,
          block.order_index,
          block.text,
          block.character_id || 'none',
          block.speaker_profile_name || 'none',
          block.status || 'draft',
          block.source_segment_ids.join(',')
        ].join(':')).join('|')
      ].join('::');
      setDirtyIds(new Set());
      setRawOverrideIds(new Set());
    } catch (e: any) {
      setSaveError(e.message || "Failed to reload blocks");
    } finally {
      setReloading(false);
    }
  };

  const markAllDirty = (nextBlocks: ProductionBlock[]) => {
    setDraftBlocks(normalizeBlocks(nextBlocks));
    setDirtyIds(new Set(nextBlocks.map(block => block.id)));
    setRawOverrideIds(new Set(nextBlocks.map(block => block.id)));
  };

  const handleTextChange = (blockId: string, text: string) => {
    updateDraftBlocks(
      draftBlocks.map(block => block.id === blockId ? { ...block, text } : block),
      [blockId],
      [blockId]
    );
  };

  const getSplitIndex = (blockId: string, text: string) => {
    const textarea = textAreaRefs.current[blockId];
    const selectionStart = textarea?.selectionStart ?? Math.floor(text.length / 2);
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    if (selectionEnd > selectionStart) {
      return selectionStart;
    }
    const midpoint = Math.max(1, Math.min(text.length - 1, selectionStart));
    if (midpoint > 0 && midpoint < text.length) {
      return midpoint;
    }
    return Math.max(1, Math.floor(text.length / 2));
  };

  const handleSplit = (blockId: string) => {
    const index = draftBlocks.findIndex(block => block.id === blockId);
    if (index === -1) return;
    const block = draftBlocks[index];
    if (block.text.trim().length === 0) return;

    const splitIndex = getSplitIndex(blockId, block.text);
    const leftText = block.text.slice(0, splitIndex).trimEnd();
    const rightText = block.text.slice(splitIndex).trimStart();
    if (!rightText) return;

    const splitSource = splitSourceIds(block.source_segment_ids);
    const nextBlocks = [...draftBlocks];
    nextBlocks.splice(index, 1,
      {
        ...block,
        text: leftText,
        source_segment_ids: splitSource.left,
      },
      {
        ...block,
        id: createDraftId(),
        order_index: block.order_index + 0.5,
        text: rightText,
        source_segment_ids: splitSource.right,
      }
    );
    markAllDirty(nextBlocks);
  };

  const mergeWithNeighbor = (blockId: string, direction: 'prev' | 'next') => {
    const index = draftBlocks.findIndex(block => block.id === blockId);
    if (index === -1) return;
    const neighborIndex = direction === 'prev' ? index - 1 : index + 1;
    if (neighborIndex < 0 || neighborIndex >= draftBlocks.length) return;

    const leftIndex = direction === 'prev' ? neighborIndex : index;
    const rightIndex = direction === 'prev' ? index : neighborIndex;
    const left = draftBlocks[leftIndex];
    const right = draftBlocks[rightIndex];
    const merged: ProductionBlock = {
      ...left,
      text: mergeText(left.text, right.text),
      source_segment_ids: Array.from(new Set([...left.source_segment_ids, ...right.source_segment_ids])),
    };
    const nextBlocks = draftBlocks.filter(block => block.id !== left.id && block.id !== right.id);
    nextBlocks.splice(leftIndex, 0, merged);
    markAllDirty(nextBlocks);
  };

  const handleDelete = (blockId: string) => {
    const nextBlocks = draftBlocks.filter(block => block.id !== blockId);
    if (nextBlocks.length === 0) {
      nextBlocks.push({
        id: createDraftId(),
        order_index: 0,
        text: '',
        character_id: null,
        speaker_profile_name: null,
        status: 'draft',
        source_segment_ids: [],
      });
    }
    markAllDirty(nextBlocks);
  };

  const applyCharacterSelection = (block: ProductionBlock) => {
    if (!selectedCharacterId) return;
    if (selectedCharacterId === 'CLEAR_ASSIGNMENT') {
      onBulkReset(block.source_segment_ids);
      updateDraftBlocks(
        draftBlocks.map(current => current.id === block.id ? {
          ...current,
          character_id: null,
          speaker_profile_name: null,
        } : current),
        [block.id]
      );
      return;
    }

    onBulkAssign(block.source_segment_ids);
    updateDraftBlocks(
      draftBlocks.map(current => current.id === block.id ? {
        ...current,
        character_id: selectedCharacterId,
        speaker_profile_name: selectedProfileName ?? current.speaker_profile_name,
      } : current),
      [block.id]
    );
  };

  const handleSave = async () => {
    if (dirtyIds.size === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await onSaveBlocks(draftBlocks);
      const committedBlocks = normalizeBlocks(result?.blocks || draftBlocks);
      setDraftBlocks(committedBlocks);
      setDirtyIds(new Set());
      setRawOverrideIds(new Set());
      lastCanonicalKeyRef.current = [
        chapterId,
        result?.base_revision_id || 'base:none',
        committedBlocks.map(block => [
          block.id,
          block.order_index,
          block.text,
          block.character_id || 'none',
          block.speaker_profile_name || 'none',
          block.status || 'draft',
          block.source_segment_ids.join(',')
        ].join(':')).join('|')
      ].join('::');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save production blocks.');
    } finally {
      setSaving(false);
    }
  };

  const blockStatusLookup = useMemo(() => {
    return new Map(draftBlocks.map(block => [
      block.id,
      getBlockStatus(block, dirtyIds, segmentLookup, pendingSegmentIds, queuedSegmentIds)
    ]));
  }, [draftBlocks, dirtyIds, segmentLookup, pendingSegmentIds, queuedSegmentIds]);

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
              {draftBlocks.length} blocks
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
          {dirtyIds.size > 0 && (
            <button
              type="button"
              onClick={handleManualReload}
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
            onClick={() => void handleSave()}
            disabled={saving || dirtyIds.size === 0}
            className="btn-primary"
            style={{
              minWidth: '140px',
              padding: '0.6rem 1rem',
              fontSize: '0.86rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              opacity: saving || dirtyIds.size === 0 ? 0.5 : 1
            }}
          >
            {saving ? <RefreshCcw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving...' : 'Save Blocks'}
          </button>
        </div>
      </div>

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

      {renderBatches.length > 0 && (
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
                      disabled={isGenerating || !onGenerateBatch || dirtyIds.size > 0}
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
                        cursor: isGenerating || dirtyIds.size > 0 ? 'not-allowed' : 'pointer',
                        opacity: isGenerating || dirtyIds.size > 0 ? 0.6 : 1
                      }}
                      title={dirtyIds.size > 0 ? "Save blocks before generating" : `${actionLabel} ${batch.id}`}
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
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {draftBlocks.map((block, index) => {
          const character = characters.find(char => char.id === block.character_id) || null;
          const statusBadge = blockStatusLookup.get(block.id) || { label: 'Draft', tone: 'muted' as const };
          const isHovered = hoveredBlockId === block.id;
          const isActive = activeBlockId === block.id;
          const canMergePrev = index > 0;
          const canMergeNext = index < draftBlocks.length - 1;

          return (
            <section
              key={block.id}
              onMouseEnter={() => setHoveredBlockId(block.id)}
              onMouseLeave={() => setHoveredBlockId(null)}
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
                      onClick={() => applyCharacterSelection(block)}
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
                    onClick={() => handleSplit(block.id)}
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
                    onClick={() => mergeWithNeighbor(block.id, 'prev')}
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
                    onClick={() => mergeWithNeighbor(block.id, 'next')}
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
                    onClick={() => handleDelete(block.id)}
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
                  ref={node => { textAreaRefs.current[block.id] = node; }}
                  value={block.text}
                  onChange={(event) => handleTextChange(block.id, event.target.value)}
                  onFocus={() => setActiveBlockId(block.id)}
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
        })}
      </div>

      {draftBlocks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <AlertTriangle size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <p>No production blocks loaded for this chapter.</p>
        </div>
      )}

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
            {dirtyIds.size === 0 ? 'All blocks saved' : `${dirtyIds.size} block${dirtyIds.size === 1 ? '' : 's'} pending save`}
          </div>
        </div>

        <div style={{ padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
            Active block
          </div>
          <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>
            {activeBlock ? `Block ${draftBlocks.findIndex(block => block.id === activeBlock.id) + 1}` : 'None selected'}
          </div>
        </div>
      </div>
    </div>
  );
};
