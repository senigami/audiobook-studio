import React from 'react';
import { RefreshCw, Volume2, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ChapterSegment, Character } from '../../../types';
import { useSegmentProgressLifecycle } from '../../../hooks/useSegmentProgressLifecycle';
import { MIN_VISIBLE_SEGMENT_PROGRESS, queueFromGroupStart } from '../../../utils/performanceTabHelpers';

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

export const PerformanceGroupCard: React.FC<PerformanceGroupCardProps> = ({
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
