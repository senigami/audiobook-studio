import React from 'react';
import type { ChapterSegment, Character, ProductionBlock, SpeakerProfile } from '../types';
import { getVariantDisplayName } from './voiceProfiles';

export interface BlockBadge {
  label: string;
  tone: 'muted' | 'accent' | 'warning' | 'success' | 'danger' | 'info';
}

export const createDraftId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const normalizeBlock = (block: ProductionBlock, orderIndex: number): ProductionBlock => ({
  ...block,
  order_index: orderIndex,
  text: block.text ?? '',
  source_segment_ids: Array.isArray(block.source_segment_ids) ? block.source_segment_ids : [],
});

export const normalizeBlocks = (blocks: ProductionBlock[]) => {
  return [...blocks]
    .sort((a, b) => a.order_index - b.order_index)
    .map((block, index) => normalizeBlock(block, index));
};

export const splitSourceIds = (sourceSegmentIds: string[]) => {
  if (sourceSegmentIds.length <= 1) {
    return { left: [...sourceSegmentIds], right: [] as string[] };
  }
  const midpoint = Math.max(1, Math.floor(sourceSegmentIds.length / 2));
  return {
    left: sourceSegmentIds.slice(0, midpoint),
    right: sourceSegmentIds.slice(midpoint),
  };
};

export const mergeText = (left: string, right: string) => {
  const cleanedLeft = left.replace(/\s+$/, '');
  const cleanedRight = right.replace(/^\s+/, '');
  if (!cleanedLeft) return cleanedRight;
  if (!cleanedRight) return cleanedLeft;
  return `${cleanedLeft} ${cleanedRight}`;
};

export const getSourceSegmentStatus = (segment?: ChapterSegment) => {
  if (!segment) return 'missing';
  return segment.audio_status;
};

export const getBlockStatus = (
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

export const getBadgeStyle = (tone: BlockBadge['tone']): React.CSSProperties => {
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

export const getCharacterName = (characters: Character[], characterId: string | null) => {
  if (!characterId) return 'Narrator';
  return characters.find(c => c.id === characterId)?.name || 'Unknown character';
};

export const getVoiceName = (speakerProfiles: SpeakerProfile[], voiceName: string | null) => {
  if (!voiceName) return 'No voice';
  const profile = speakerProfiles.find(p => p.name === voiceName);
  return getVariantDisplayName(profile || { name: voiceName, variant_name: null } as SpeakerProfile);
};
