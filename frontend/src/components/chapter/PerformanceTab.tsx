import React, { useEffect, useRef, useState } from 'react';
import { List, RefreshCw, Volume2, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ChapterSegment, Character, Job, SegmentProgress } from '../../types';
import { shouldShowIndeterminateProgress } from '../../utils/jobSelection';

const SEGMENT_PROGRESS_LINGER_MS = 600;
const MIN_VISIBLE_SEGMENT_PROGRESS = 0.015;
const MIN_ACTIVE_GROUP_DURATION_SECONDS = 4;

function queueFromGroupStart(uniqueSegmentIds: string[], segmentId: string): string[] {
  const idx = uniqueSegmentIds.indexOf(segmentId);
  return idx !== -1 ? uniqueSegmentIds.slice(idx) : [segmentId];
}

function getPredictiveJobProgress(job?: Job): number {
  if (!job || (job.status !== 'running' && job.status !== 'finalizing')) {
    return 0;
  }

  const baseProgress = Math.max(0, Math.min(1, job.progress ?? 0));
  if (!job.started_at || !job.eta_seconds) {
    return baseProgress;
  }

  const elapsed = (Date.now() / 1000) - job.started_at;
  const timeProgress = Math.min(0.99, Math.max(0, elapsed / job.eta_seconds));
  return Math.max(baseProgress, timeProgress);
}

function getWeightedActiveGroupProgress(job?: Job): number | null {
  if (!job || (job.status !== 'running' && job.status !== 'finalizing')) {
    return null;
  }

  const totalRenderWeight = job.total_render_weight ?? 0;
  const activeRenderGroupWeight = job.active_render_group_weight ?? 0;
  const completedRenderWeight = job.completed_render_weight ?? 0;

  if (!job.started_at || !job.eta_seconds || totalRenderWeight <= 0 || activeRenderGroupWeight <= 0) {
    return null;
  }

  const elapsedSeconds = Math.max(0, (Date.now() / 1000) - job.started_at);
  const observedOverallProgress = Math.max(
    0.01,
    Math.min(
      0.995,
      job.grouped_progress
      ?? job.progress
      ?? (totalRenderWeight > 0 ? (completedRenderWeight / totalRenderWeight) : 0)
    )
  );
  // Use the larger of the learned ETA and the runtime implied by current observed progress.
  // This keeps late uneven groups from "sprinting" unrealistically just because the original
  // ETA was too optimistic for the chapter's actual pace.
  const impliedTotalSeconds = elapsedSeconds / observedOverallProgress;
  const expectedTotalSeconds = Math.max(job.eta_seconds, impliedTotalSeconds, 1);
  const expectedSecondsBeforeGroup = expectedTotalSeconds * (completedRenderWeight / totalRenderWeight);
  const expectedActiveGroupSeconds = Math.max(
    MIN_ACTIVE_GROUP_DURATION_SECONDS,
    expectedTotalSeconds * (activeRenderGroupWeight / totalRenderWeight)
  );

  if (expectedActiveGroupSeconds <= 0) {
    return null;
  }

  const elapsedWithinGroup = Math.max(0, elapsedSeconds - expectedSecondsBeforeGroup);
  return Math.max(0, Math.min(1, elapsedWithinGroup / expectedActiveGroupSeconds));
}

function isVoxtralJob(job?: Job): boolean {
  return job?.engine === 'voxtral';
}

function useSegmentProgressLifecycle(
    isActive: boolean,
    activeProgress: number,
    hasProcessingState: boolean,
    allowSettle: boolean,
    initialSettled: boolean,
    isRunning: boolean,
    resetKey?: string
) {
    const [settledProgress, setSettledProgress] = useState<number | null>(null);
    const [smoothedProgress, setSmoothedProgress] = useState(0);
    const settleTimerRef = useRef<number | null>(null);
    const wasActiveRef = useRef(false);

    useEffect(() => {
        wasActiveRef.current = false;
        const nextSettled = initialSettled ? 1 : null;
        setSettledProgress(nextSettled);
        setSmoothedProgress(nextSettled ?? Math.max(0, Math.min(1, activeProgress)));
        if (settleTimerRef.current !== null) {
            window.clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }
    }, [resetKey, activeProgress, initialSettled]);

    useEffect(() => {
        if (!initialSettled || isActive) {
            return;
        }
        if (settleTimerRef.current !== null) {
            window.clearTimeout(settleTimerRef.current);
        }
        settleTimerRef.current = window.setTimeout(() => {
            setSettledProgress(null);
            settleTimerRef.current = null;
        }, SEGMENT_PROGRESS_LINGER_MS);
        return () => {
            if (settleTimerRef.current !== null) {
                window.clearTimeout(settleTimerRef.current);
                settleTimerRef.current = null;
            }
        };
    }, [initialSettled, isActive]);

    useEffect(() => {
        if (settleTimerRef.current !== null && !(initialSettled && !wasActiveRef.current && !isActive)) {
            window.clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }

        if (isActive) {
            wasActiveRef.current = true;
            setSettledProgress(null);
            return;
        }

        if (wasActiveRef.current && allowSettle) {
            wasActiveRef.current = false;
            setSettledProgress(1);
            settleTimerRef.current = window.setTimeout(() => {
                setSettledProgress(null);
                settleTimerRef.current = null;
            }, SEGMENT_PROGRESS_LINGER_MS);
        } else if (wasActiveRef.current) {
            wasActiveRef.current = false;
            setSettledProgress(null);
        }
    }, [isActive, allowSettle, initialSettled]);

    useEffect(() => {
        if (!hasProcessingState || isActive) return;
        wasActiveRef.current = false;
        setSettledProgress(null);
        if (settleTimerRef.current !== null) {
            window.clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }
    }, [hasProcessingState, isActive]);

    useEffect(() => () => {
        if (settleTimerRef.current !== null) {
            window.clearTimeout(settleTimerRef.current);
        }
    }, []);

    useEffect(() => {
        if (isActive && activeProgress > 0) {
            setSmoothedProgress(prev => Math.max(prev, Math.min(1, activeProgress)));
        }
    }, [isActive, activeProgress]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setSmoothedProgress(prev => {
                const target = isActive ? activeProgress : (settledProgress ?? 0);
                if (isActive && target >= 1) {
                    return 1;
                }
                if (isActive && target > 0) {
                    const floor = Math.max(prev, Math.min(1, target));
                    return Math.min(0.995, floor + 0.005);
                }
                if (isActive && isRunning) {
                    return Math.min(0.95, Math.max(prev, prev + 0.005));
                }
                const gap = target - prev;
                if (Math.abs(gap) <= 0.002) return target;
                const correctionWindow = gap > 0 ? 0.45 : 0.65;
                const correctionFraction = Math.min(1, 0.25 / correctionWindow);
                return Math.max(0, Math.min(1, prev + (gap * correctionFraction)));
            });
        }, 250);
        return () => window.clearInterval(timer);
    }, [isActive, activeProgress, settledProgress, isRunning]);

    return {
        displayProgress: smoothedProgress,
        showProgress: isActive || settledProgress !== null || hasProcessingState,
        isSettling: settledProgress !== null
    };
}

interface PerformanceGroupCardProps {
  group: { characterId: string | null; segments: ChapterSegment[] };
  gidx: number;
  character?: Character;
  uniqueSegmentIds: string[];
  activeJobIsLive: boolean;
  isActiveGroup: boolean;
  groupHasProcessingState: boolean;
  groupHasQueuedState: boolean;
  activeProgress: number;
  showIndeterminateProgress: boolean;
  showPreparingIndeterminate: boolean;
  resetKey?: string;
  allowSettle: boolean;
  initialSettled: boolean;
  isPlaying: boolean;
  isNext: boolean;
  allDone: boolean;
  onPlay: (segmentId: string, fullQueue: string[]) => void;
  onStop: () => void;
  onGenerate: (sids: string[]) => void;
}

const PerformanceGroupCard: React.FC<PerformanceGroupCardProps> = ({
  group,
  gidx,
  character,
  uniqueSegmentIds,
  activeJobIsLive,
  isActiveGroup,
  groupHasProcessingState,
  groupHasQueuedState,
  activeProgress,
  showIndeterminateProgress,
  showPreparingIndeterminate,
  resetKey,
  allowSettle,
  initialSettled,
  isPlaying,
  isNext,
  allDone,
  onPlay,
  onStop,
  onGenerate
}) => {
  const { displayProgress, showProgress, isSettling } = useSegmentProgressLifecycle(
    isActiveGroup,
    activeProgress,
    groupHasProcessingState,
    allowSettle,
    initialSettled,
    activeJobIsLive && isActiveGroup,
    resetKey
  );
  const anyPending = isActiveGroup || groupHasProcessingState || groupHasQueuedState;

  return (
    <div style={{ 
      display: 'flex', gap: '1.5rem', 
      background: 'var(--surface)', padding: '1.25rem', 
      borderRadius: '16px', border: '1px solid var(--border)',
      transition: 'all 0.2s ease',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      borderLeft: `4px solid ${character?.color || 'var(--text-muted)'}`,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        top: '0.85rem',
        right: '0.95rem',
        fontSize: '0.72rem',
        fontWeight: 700,
        color: 'var(--text-muted)',
        opacity: 0.75,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--border)',
        borderRadius: '999px',
        padding: '0.15rem 0.45rem',
        lineHeight: 1,
        zIndex: 3
      }}>
        #{gidx + 1}
      </div>

      {showProgress && (
        <div style={{ 
          position: 'absolute', 
          bottom: 0, 
          left: 0, 
          right: 0, 
          height: '6px', 
          background: 'rgba(255,255,255,0.05)',
          overflow: 'hidden',
          borderBottomLeftRadius: '12px',
          borderBottomRightRadius: '12px'
        }}>
          <motion.div 
            data-testid={`performance-progress-${gidx}`}
            data-progress={Math.round(displayProgress * 100)}
            initial={false}
            animate={showIndeterminateProgress ? {
              x: ['-45%', '210%'],
              opacity: [0.25, 0.7, 0.25]
            } : {
              width: `${displayProgress * 100}%`,
              x: '0%',
              opacity: displayProgress > 0 ? 1 : 0.25
            }}
            transition={showIndeterminateProgress
              ? { duration: 1.1, ease: 'easeInOut', repeat: Infinity }
              : { duration: isSettling ? 0.45 : 0.6, ease: "easeInOut" }}
            style={{ 
              width: showIndeterminateProgress
                ? (showPreparingIndeterminate ? '28%' : '35%')
                : `${Math.max(
                    displayProgress,
                    isActiveGroup && activeJobIsLive ? MIN_VISIBLE_SEGMENT_PROGRESS : 0
                  ) * 100}%`,
              height: '100%', 
              background: showPreparingIndeterminate
                ? 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(248,250,252,0.95) 35%, rgba(203,213,225,0.95) 65%, rgba(255,255,255,0.05) 100%)'
                : 'var(--accent)',
              boxShadow: showPreparingIndeterminate
                ? '0 0 10px rgba(226,232,240,0.45)'
                : '0 0 15px var(--accent)',
              borderRadius: '3px'
            }}
            className={showIndeterminateProgress
              ? (showPreparingIndeterminate ? 'progress-bar-pending' : 'progress-bar-animated')
              : undefined}
          />
        </div>
      )}

      <div style={{ width: '130px', flexShrink: 0, position: 'relative', zIndex: 2 }}>
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: '0.5rem', 
          color: character?.color || 'var(--text-muted)', 
          fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase',
          marginBottom: '0.75rem', letterSpacing: '0.05em'
        }}>
          {character?.name || 'Narrator'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {isPlaying ? (
            <button 
              onClick={onStop} 
              className="btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', fontSize: '0.8rem', padding: '0.5rem' }}
            >
              <Zap size={14} fill="currentColor" /> Stop
            </button>
          ) : (
            <button 
              onClick={() => {
                const queueFromHere = queueFromGroupStart(uniqueSegmentIds, group.segments[0].id);
                onPlay(group.segments[0].id, queueFromHere);
              }} 
              className="btn-ghost" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', fontSize: '0.8rem', padding: '0.5rem', background: 'rgba(255,255,255,0.1)' }}
            >
              <Volume2 size={14} /> Listen
            </button>
          )}
            <button 
              onClick={() => onGenerate(Array.from(new Set(group.segments.map(s => s.id))))}
              className="btn-ghost" 
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem', 
              justifyContent: 'center', fontSize: '0.8rem', padding: '0.5rem', 
              background: anyPending ? 'rgba(255,165,0,0.1)' : 'rgba(255,255,255,0.05)',
              color: anyPending ? 'var(--accent)' : 'inherit',
              border: '1px solid var(--border)'
            }}
            disabled={anyPending}
            >
            <RefreshCw size={14} className={(isActiveGroup || groupHasProcessingState) ? 'animate-spin' : ''} /> 
            {anyPending
              ? (
                  activeJobIsLive && isActiveGroup
                    ? (showPreparingIndeterminate ? 'Working...' : `${Math.round(activeProgress * 100)}%`)
                    : (groupHasQueuedState ? 'Queued' : 'Working...')
                )
              : (allDone ? 'Regenerate' : 'Generate')}
          </button>
        </div>
      </div>

      <div 
        onClick={() => {
          const queueFromHere = queueFromGroupStart(uniqueSegmentIds, group.segments[0].id);
          onPlay(group.segments[0].id, queueFromHere);
        }}
        style={{ 
          flex: 1, 
          color: 'var(--text-secondary)', 
          lineHeight: '1.7', 
          fontSize: '1.05rem', 
          marginTop: '0.2rem',
          padding: '0.5rem',
          borderRadius: '8px',
          transition: 'all 0.2s ease',
          cursor: 'pointer',
          opacity: (allDone || isPlaying || anyPending || isNext) ? 1 : 0.45,
          filter: (allDone || isPlaying || anyPending || isNext) ? 'none' : 'grayscale(1)',
          background: isPlaying 
              ? '#ffeb3b44' 
              : (anyPending || isNext)
                  ? '#e1bee733' 
                  : 'transparent',
          borderBottom: isPlaying ? '3px solid #fbc02d' : (anyPending || isNext) ? '2px dashed #9c27b0' : '2px solid transparent',
          position: 'relative',
          whiteSpace: 'pre-wrap',
          zIndex: 2
        }}
      >
        {group.segments.map(s => s.sanitized_text || s.text_content).join(' ')}

        {anyPending && (
          <span style={{ 
            position: 'absolute', 
            top: '-8px', 
            right: '28px',
            background: 'var(--bg)',
            borderRadius: '50%',
            padding: '2px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            display: 'flex',
            zIndex: 10
          }}>
            <RefreshCw size={12} className="animate-spin" color="var(--accent)" />
          </span>
        )}

        {(() => {
          const anyMissing = group.segments.some(s => s.audio_status !== 'done' || !s.audio_file_path);
              if (!anyPending && anyMissing) {
            return <div style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)', marginLeft: '8px', verticalAlign: 'middle', opacity: 0.4 }} />;
          }
          return null;
        })()}
      </div>
    </div>
  );
};

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
  const [, forceNow] = useState(0);
  const uniqueSegmentIds = Array.from(new Set(allSegmentIds));
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

  const lastActiveGroupIndexRef = React.useRef(-1);
  const activeGroupIndex = React.useMemo(() => {
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
                    const activeProgress = (() => {
                        if (!(activeJobIsLive && isActiveGroup)) {
                            return 0;
                        }
                        if (voxtralJob) {
                            return generatingJob?.status === 'finalizing' ? 1 : 0;
                        }
                        if (hasActiveSegmentSignal) {
                            // Mixed grouped renders already expose character-length weighting from the
                            // backend. For the active segment card we use that weighting to predict
                            // how far through the current render group we should be, then clamp that
                            // against the live backend segment checkpoint as a floor. This keeps the
                            // card moving between sparse websocket updates without letting progress
                            // appear to backslide when the next checkpoint is late or coarse.
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
                    })();
                    const isPreparingLike = ['queued', 'preparing'].includes(generatingJob?.status || '');
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
