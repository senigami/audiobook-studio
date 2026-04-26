import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChapterSegment, Job, SegmentProgress } from '../types';
import { shouldShowIndeterminateProgress } from '../utils/jobSelection';
import { 
  getPredictiveJobProgress, 
  getWeightedActiveGroupProgress, 
  isVoxtralJob 
} from '../utils/performanceTabHelpers';

interface UsePerformanceTabProps {
  chunkGroups: { characterId: string | null; segments: ChapterSegment[] }[];
  generatingSegmentIds: Set<string>;
  generatingJob?: Job;
  segmentProgress?: Record<string, SegmentProgress>;
}

export const usePerformanceTab = ({
  chunkGroups,
  generatingSegmentIds,
  generatingJob,
  segmentProgress = {}
}: UsePerformanceTabProps) => {
  const [, forceNow] = useState(0);
  const activeJobIsLive = !!generatingJob && ['queued', 'preparing', 'running', 'finalizing'].includes(generatingJob.status);
  const voxtralJob = isVoxtralJob(generatingJob);
  const indeterminateJob = !!generatingJob && shouldShowIndeterminateProgress(generatingJob);
  const activeSegmentId = activeJobIsLive ? generatingJob?.active_segment_id : null;

  useEffect(() => {
    const activeSegmentLiveProgress = activeSegmentId
      ? (segmentProgress[activeSegmentId]?.progress ?? generatingJob?.active_segment_progress ?? 0)
      : (generatingJob?.active_segment_progress ?? 0);
    if (!activeJobIsLive || !generatingJob || voxtralJob || activeSegmentLiveProgress > 0) {
      return;
    }
    const timer = window.setInterval(() => forceNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeJobIsLive, voxtralJob, generatingJob?.id, generatingJob?.status, generatingJob?.started_at, generatingJob?.eta_seconds, generatingJob?.progress, activeSegmentId, segmentProgress]);

  const lastActiveGroupIndexRef = useRef(-1);
  const activeGroupIndex = useMemo(() => {
    if (activeSegmentId) {
      const byActiveSegment = chunkGroups.findIndex(group => group.segments.some(segment => segment.id === activeSegmentId));
      if (byActiveSegment !== -1) {
        lastActiveGroupIndexRef.current = byActiveSegment;
        return byActiveSegment;
      }
    }

    if (activeJobIsLive && (generatingJob?.segment_ids?.length || 0) > 0) {
      const targetIds = new Set(generatingJob?.segment_ids || []);
      const byTargetSegments = chunkGroups.findIndex(group =>
        group.segments.some(segment => targetIds.has(segment.id))
      );
      if (byTargetSegments !== -1) {
        lastActiveGroupIndexRef.current = byTargetSegments;
        return byTargetSegments;
      }
    }

    const byProcessingSegment = chunkGroups.findIndex(group =>
      group.segments.some(segment => segment.audio_status === 'processing' || generatingSegmentIds.has(segment.id))
    );
    if (byProcessingSegment !== -1) {
      lastActiveGroupIndexRef.current = byProcessingSegment;
      return byProcessingSegment;
    }

    if (activeJobIsLive) {
      if (lastActiveGroupIndexRef.current !== -1) {
        return lastActiveGroupIndexRef.current;
      }
      const firstIncomplete = chunkGroups.findIndex(group => group.segments.some(segment => segment.audio_status !== 'done'));
      if (firstIncomplete !== -1) {
        lastActiveGroupIndexRef.current = firstIncomplete;
        return firstIncomplete;
      }
      if (chunkGroups.length > 0) {
        lastActiveGroupIndexRef.current = 0;
        return 0;
      }
    }

    lastActiveGroupIndexRef.current = -1;
    return -1;
  }, [activeJobIsLive, activeSegmentId, generatingJob?.segment_ids, chunkGroups, generatingSegmentIds]);

  const getActiveProgressForGroup = (gidx: number) => {
    const isActiveGroup = gidx === activeGroupIndex;
    if (!(activeJobIsLive && isActiveGroup)) {
      return 0;
    }
    if (voxtralJob) {
      return generatingJob?.status === 'finalizing' ? 1 : 0;
    }

    const group = chunkGroups[gidx];
    const liveSegmentEntry = group.segments
        .map(segment => segmentProgress[segment.id])
        .find(entry => entry && entry.job_id === generatingJob?.id);
    
    const hasDirectSegmentProgress = typeof generatingJob?.active_segment_progress === 'number'
      && (generatingJob?.active_segment_progress ?? 0) > 0;
    
    const hasActiveSegmentSignal = isActiveGroup
      && (!!generatingJob?.active_segment_id
        || !!liveSegmentEntry
        || (generatingJob?.engine === 'mixed' && hasDirectSegmentProgress));
    
    const liveSegmentValue = hasActiveSegmentSignal
      ? (liveSegmentEntry?.progress ?? (generatingJob?.active_segment_progress ?? 0))
      : 0;
    
    const weightedActiveGroupProgress = getWeightedActiveGroupProgress(generatingJob);
    const useWeightedMixedSegmentProgress = !!generatingJob
      && generatingJob.engine === 'mixed'
      && (generatingJob.total_render_weight ?? 0) > 0
      && (generatingJob.active_render_group_weight ?? 0) > 0;

    if (hasActiveSegmentSignal) {
      if (useWeightedMixedSegmentProgress) {
        return Math.max(
          0,
          Math.min(
            1,
            Math.max(liveSegmentValue, weightedActiveGroupProgress ?? 0)
          )
        );
      }
      return liveSegmentValue;
    }
    return getPredictiveJobProgress(generatingJob);
  };

  const isPreparingLike = ['queued', 'preparing'].includes(generatingJob?.status || '');
  
  return {
    activeJobIsLive,
    voxtralJob,
    indeterminateJob,
    activeGroupIndex,
    isPreparingLike,
    getActiveProgressForGroup
  };
};
