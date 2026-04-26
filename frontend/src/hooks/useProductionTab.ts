import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { 
  ChapterSegment, ProductionBlock, ProductionBlocksResponse 
} from '../types';
import { 
  normalizeBlocks, createDraftId, splitSourceIds, 
  mergeText, getBlockStatus 
} from '../utils/productionTabHelpers';

interface UseProductionTabProps {
  chapterId: string;
  blocks: ProductionBlock[];
  segments: ChapterSegment[];
  pendingSegmentIds: Set<string>;
  queuedSegmentIds: Set<string>;
  onSaveBlocks: (blocks: ProductionBlock[]) => Promise<any>;
  onReloadBlocks: () => Promise<ProductionBlocksResponse | null>;
  onBulkAssign: (segmentIds: string[]) => void;
  onBulkReset: (segmentIds: string[]) => void;
  selectedCharacterId: string | null;
  selectedProfileName?: string | null;
}

export const useProductionTab = ({
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
}: UseProductionTabProps) => {
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
  }, [chapterId, blocks]);

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

  const updateDraftBlocks = useCallback((
    nextBlocks: ProductionBlock[],
    dirtyIdsToMark: string[] = [],
    rawOverrideIdsToMark: string[] = []
  ) => {
    setDraftBlocks(nextBlocks);
    if (dirtyIdsToMark.length > 0) {
      setDirtyIds(prev => {
        const nextDirty = new Set(prev);
        dirtyIdsToMark.forEach(id => nextDirty.add(id));
        return nextDirty;
      });
    }
    if (rawOverrideIdsToMark.length > 0) {
      setRawOverrideIds(prev => {
        const nextRaw = new Set(prev);
        rawOverrideIdsToMark.forEach(id => nextRaw.add(id));
        return nextRaw;
      });
    }
  }, []);

  const markAllDirty = useCallback((nextBlocks: ProductionBlock[]) => {
    const normalized = normalizeBlocks(nextBlocks);
    setDraftBlocks(normalized);
    setDirtyIds(new Set(normalized.map(block => block.id)));
    setRawOverrideIds(new Set(normalized.map(block => block.id)));
  }, []);

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

  const handleTextChange = useCallback((blockId: string, text: string) => {
    updateDraftBlocks(
      draftBlocks.map(block => block.id === blockId ? { ...block, text } : block),
      [blockId],
      [blockId]
    );
  }, [draftBlocks, updateDraftBlocks]);

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

  const handleSplit = useCallback((blockId: string) => {
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
  }, [draftBlocks, markAllDirty]);

  const mergeWithNeighbor = useCallback((blockId: string, direction: 'prev' | 'next') => {
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
  }, [draftBlocks, markAllDirty]);

  const handleDelete = useCallback((blockId: string) => {
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
  }, [draftBlocks, markAllDirty]);

  const applyCharacterSelection = useCallback((block: ProductionBlock) => {
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
  }, [selectedCharacterId, selectedProfileName, onBulkReset, onBulkAssign, draftBlocks, updateDraftBlocks]);

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
      throw error;
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

  return {
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
  };
};
