import React from 'react';
import { List } from 'lucide-react';
import type { ChapterSegment, Character, Job, SegmentProgress } from '../../types';
import { usePerformanceTab } from '../../hooks/usePerformanceTab';
import { PerformanceGroupCard } from './performance/PerformanceGroupCard';

interface PerformanceTabProps {
  chunkGroups: { characterId: string | null; segments: ChapterSegment[] }[];
  characters: Character[];
  playingSegmentId: string | null;
  playbackQueue: string[];
  generatingSegmentIds: Set<string>;
  queuedSegmentIds?: Set<string>;
  allSegmentIds: string[];
  segments: ChapterSegment[];
  onPlay: (segmentId: string, fullQueue: string[]) => void;
  onStop: () => void;
  onGenerate: (sids: string[]) => void;
  generatingJob?: Job;
  segmentProgress?: Record<string, SegmentProgress>;
}

export const PerformanceTab: React.FC<PerformanceTabProps> = ({
  chunkGroups,
  characters,
  playingSegmentId,
  playbackQueue,
  generatingSegmentIds,
  queuedSegmentIds = new Set(),
  allSegmentIds,
  segments,
  onPlay,
  onStop,
  onGenerate,
  generatingJob,
  segmentProgress = {}
}) => {
  const uniqueSegmentIds = Array.from(new Set(allSegmentIds));
  const {
    activeJobIsLive,
    voxtralJob,
    indeterminateJob,
    activeGroupIndex,
    isPreparingLike,
    getActiveProgressForGroup
  } = usePerformanceTab({
    chunkGroups,
    generatingSegmentIds,
    generatingJob,
    segmentProgress
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto', padding: '1.5rem', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <List size={20} color="var(--accent)" />
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Performance View</h3>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {chunkGroups.map((group, gidx) => {
          const char = characters.find(c => c.id === group.characterId);
          const allDone = group.segments.every(s => s.audio_status === 'done');
          const isActiveGroup = gidx === activeGroupIndex;
          const groupHasProcessingState = group.segments.some(s => s.audio_status === 'processing' || generatingSegmentIds.has(s.id));
          const groupHasQueuedState = group.segments.some(s => queuedSegmentIds.has(s.id));
          
          const activeProgress = getActiveProgressForGroup(gidx);
          const showIndeterminateProgress = activeJobIsLive
            && isActiveGroup
            && (isPreparingLike || (indeterminateJob && (generatingJob?.status === 'running')));
          const showPreparingIndeterminate = showIndeterminateProgress && isPreparingLike;
          
          const allowSettle = !voxtralJob && (generatingJob?.status === 'running' || generatingJob?.status === 'finalizing') && !!generatingJob?.active_segment_id;
          const initialSettled = !isActiveGroup
            && allDone
            && activeGroupIndex > 0
            && gidx === activeGroupIndex - 1
            && allowSettle;
          
          const resetKey = `${generatingJob?.id || 'none'}:${generatingJob?.status || 'none'}:${generatingJob?.started_at || 0}`;
          const isPlaying = playingSegmentId && group.segments.some(s => s.id === playingSegmentId);
          
          const nextId = (() => {
            if (!playingSegmentId || playbackQueue.length === 0) return null;
            const currIdx = playbackQueue.indexOf(playingSegmentId);
            if (currIdx === -1 || currIdx >= playbackQueue.length - 1) return null;
            
            const playingSeg = segments.find(ps => ps.id === playingSegmentId);
            let nextIdx = currIdx + 1;
            while (nextIdx < playbackQueue.length) {
              const sId = playbackQueue[nextIdx];
              const s = segments.find(ps => ps.id === sId);
              if (s && playingSeg && s.audio_file_path && s.audio_file_path === playingSeg.audio_file_path) {
                nextIdx++;
              } else {
                break;
              }
            }
            return nextIdx < playbackQueue.length ? playbackQueue[nextIdx] : null;
          })();
          const isNext = nextId && group.segments.some(s => s.id === nextId);

          return (
            <PerformanceGroupCard
              key={gidx}
              group={group}
              gidx={gidx}
              character={char}
              uniqueSegmentIds={uniqueSegmentIds}
              activeJobIsLive={activeJobIsLive}
              isActiveGroup={isActiveGroup}
              groupHasProcessingState={groupHasProcessingState}
              groupHasQueuedState={groupHasQueuedState}
              activeProgress={activeProgress}
              showIndeterminateProgress={showIndeterminateProgress}
              showPreparingIndeterminate={showPreparingIndeterminate}
              resetKey={resetKey}
              allowSettle={allowSettle}
              initialSettled={initialSettled}
              isPlaying={Boolean(isPlaying)}
              isNext={Boolean(isNext)}
              allDone={allDone}
              onPlay={onPlay}
              onStop={onStop}
              onGenerate={onGenerate}
            />
          );
        })}
      </div>
      <div style={{ height: '2rem', flexShrink: 0 }} />
    </div>
  );
};
