import React, { useEffect, useRef, useState } from 'react';
import { List, RefreshCw, Volume2, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ChapterSegment, Character, Job } from '../../types';

const SEGMENT_PROGRESS_LINGER_MS = 600;

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

function useSegmentProgressLifecycle(
    isActive: boolean,
    activeProgress: number,
    hasProcessingState: boolean,
    allowSettle: boolean,
    resetKey?: string
) {
    const [settledProgress, setSettledProgress] = useState<number | null>(null);
    const settleTimerRef = useRef<number | null>(null);
    const wasActiveRef = useRef(false);

    useEffect(() => {
        wasActiveRef.current = false;
        setSettledProgress(null);
        if (settleTimerRef.current !== null) {
            window.clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
        }
    }, [resetKey]);

    useEffect(() => {
        if (settleTimerRef.current !== null) {
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
    }, [isActive, allowSettle]);

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

    return {
        displayProgress: isActive ? activeProgress : (settledProgress ?? 0),
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
              width: showIndeterminateProgress ? (showPreparingIndeterminate ? '28%' : '35%') : `${displayProgress * 100}%`,
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
              onClick={() => onPlay(group.segments[0].id, uniqueSegmentIds)} 
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
                    ? (activeProgress > 0 ? `${Math.round(activeProgress * 100)}%` : 'Working...')
                    : (groupHasQueuedState ? 'Queued' : 'Working...')
                )
              : (allDone ? 'Regenerate' : 'Generate')}
          </button>
        </div>
      </div>

      <div 
        onClick={() => {
          const queueFromHere = uniqueSegmentIds.slice(uniqueSegmentIds.indexOf(group.segments[0].id));
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
            right: '-8px',
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
  generatingJob
}) => {
  const [, forceNow] = useState(0);
  const uniqueSegmentIds = Array.from(new Set(allSegmentIds));
  const activeJobIsLive = !!generatingJob && ['queued', 'preparing', 'running', 'finalizing'].includes(generatingJob.status);
  const activeSegmentId = activeJobIsLive ? generatingJob?.active_segment_id : null;

  useEffect(() => {
    if (!activeJobIsLive || !generatingJob || (generatingJob.active_segment_progress ?? 0) > 0) {
      return;
    }
    const timer = window.setInterval(() => forceNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeJobIsLive, generatingJob?.id, generatingJob?.status, generatingJob?.started_at, generatingJob?.eta_seconds, generatingJob?.progress, generatingJob?.active_segment_progress]);

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
      }
      return firstIncomplete;
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
                    const activeProgress = activeJobIsLive && isActiveGroup
                        ? ((generatingJob?.active_segment_progress ?? 0) > 0
                            ? (generatingJob?.active_segment_progress ?? 0)
                            : getPredictiveJobProgress(generatingJob))
                        : 0;
                    const showIndeterminateProgress = activeJobIsLive && isActiveGroup && activeProgress <= 0;
                    const showPreparingIndeterminate = showIndeterminateProgress && ['queued', 'preparing'].includes(generatingJob?.status || '');
                    const allowSettle = (generatingJob?.status === 'running' || generatingJob?.status === 'finalizing') && !!generatingJob?.active_segment_id;
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
