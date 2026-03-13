import React from 'react';
import { List, RefreshCw, Volume2, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ChapterSegment, Character } from '../../types';

interface PerformanceTabProps {
  chunkGroups: { characterId: string | null; segments: ChapterSegment[] }[];
  characters: Character[];
  playingSegmentId: string | null;
  playbackQueue: string[];
  generatingSegmentIds: Set<string>;
  allSegmentIds: string[];
  segments: ChapterSegment[];
  onPlay: (segmentId: string, fullQueue: string[]) => void;
  onStop: () => void;
  onGenerate: (sids: string[]) => void;
  onBake: () => void;
  submitting: boolean;
  generatingJob?: import('../../types').Job;
}

export const PerformanceTab: React.FC<PerformanceTabProps> = ({
  chunkGroups,
  characters,
  playingSegmentId,
  playbackQueue,
  generatingSegmentIds,
  allSegmentIds,
  segments,
  onPlay,
  onStop,
  onGenerate,
  onBake,
  submitting,
  generatingJob
}) => {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto', padding: '1.5rem', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <List size={20} color="var(--accent)" />
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Performance View</h3>
            </div>
            <button 
                onClick={onBake}
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', boxShadow: '0 4px 12px var(--accent-glow)' }}
                title="Stitch all segment audios into the final chapter file"
            >
                <RefreshCw size={16} className={submitting ? 'animate-spin' : ''} /> Bake Final Chapter
            </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {chunkGroups.map((group, gidx) => {
                    const char = characters.find(c => c.id === group.characterId);
                    const allDone = group.segments.every(s => s.audio_status === 'done');
                    const anyProcessing = group.segments.some(s => s.audio_status === 'processing' || generatingSegmentIds.has(s.id));
                    
                    // Track if this specific group is "active" in the current job
                    const activeSegmentId = generatingJob?.active_segment_id;
                    const isAnySegmentActive = group.segments.some(s => s.id === activeSegmentId);
                    const activeProgress = isAnySegmentActive ? (generatingJob?.active_segment_progress || 0) : 0;

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
                        <div key={gidx} style={{ 
                            display: 'flex', gap: '1.5rem', 
                            background: 'var(--surface)', padding: '1.25rem', 
                            borderRadius: '16px', border: '1px solid var(--border)',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                            borderLeft: `4px solid ${char?.color || 'var(--text-muted)'}`,
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            {/* Inner Progress Bar Overlay */}
                            {isAnySegmentActive && (
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
                                        initial={false}
                                        animate={{ 
                                            width: `${Math.max(activeProgress * 100, 2)}%`,
                                            opacity: activeProgress === 0 ? [0.4, 0.7, 0.4] : 1
                                        }}
                                        transition={activeProgress === 0 ? {
                                            duration: 1.5,
                                            repeat: Infinity,
                                            ease: "easeInOut"
                                        } : { duration: 2, ease: "easeInOut" }}
                                        style={{ 
                                            height: '100%', 
                                            background: 'var(--accent)',
                                            boxShadow: '0 0 15px var(--accent)',
                                            borderRadius: '3px'
                                        }}
                                    />
                                </div>
                            )}

                            <div style={{ width: '130px', flexShrink: 0, position: 'relative', zIndex: 2 }}>
                                <div style={{ 
                                    display: 'flex', alignItems: 'center', gap: '0.5rem', 
                                    color: char?.color || 'var(--text-muted)', 
                                    fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase',
                                    marginBottom: '0.75rem', letterSpacing: '0.05em'
                                }}>
                                    {char?.name || 'Narrator'}
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
                                            onClick={() => onPlay(group.segments[0].id, allSegmentIds)} 
                                            className="btn-ghost" 
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', fontSize: '0.8rem', padding: '0.5rem', background: 'rgba(255,255,255,0.1)' }}
                                        >
                                            <Volume2 size={14} /> Listen
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => onGenerate(group.segments.map(s => s.id))}
                                        className="btn-ghost" 
                                        style={{ 
                                            display: 'flex', alignItems: 'center', gap: '0.5rem', 
                                            justifyContent: 'center', fontSize: '0.8rem', padding: '0.5rem', 
                                            background: anyProcessing ? 'rgba(255,165,0,0.1)' : 'rgba(255,255,255,0.05)',
                                            color: anyProcessing ? 'var(--accent)' : 'inherit',
                                            border: '1px solid var(--border)'
                                        }}
                                        disabled={anyProcessing}
                                    >
                                        <RefreshCw size={14} className={anyProcessing ? 'animate-spin' : ''} /> 
                                        {anyProcessing ? (isAnySegmentActive ? `${Math.round(activeProgress * 100)}%` : 'Working...') : (allDone ? 'Regenerate' : 'Generate')}
                                    </button>
                                </div>
                            </div>
                            <div 
                                onClick={() => {
                                    const queueFromHere = allSegmentIds.slice(allSegmentIds.indexOf(group.segments[0].id));
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
                                    opacity: (allDone || isPlaying || anyProcessing || isNext) ? 1 : 0.45,
                                    filter: (allDone || isPlaying || anyProcessing || isNext) ? 'none' : 'grayscale(1)',
                                    background: isPlaying 
                                        ? '#ffeb3b44' 
                                        : (anyProcessing || isNext)
                                            ? '#e1bee733' 
                                            : 'transparent',
                                    borderBottom: isPlaying ? '3px solid #fbc02d' : (anyProcessing || isNext) ? '2px dashed #9c27b0' : '2px solid transparent',
                                    position: 'relative',
                                    whiteSpace: 'pre-wrap',
                                    zIndex: 2
                                }}
                            >
                                {group.segments.map(s => s.sanitized_text || s.text_content).join(' ')}

                                {anyProcessing && (
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
                                    if (!anyProcessing && anyMissing) {
                                        return <div style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-muted)', marginLeft: '8px', verticalAlign: 'middle', opacity: 0.4 }} />;
                                    }
                                    return null;
                                })()}
                            </div>
                        </div>
                    );
                })}
        </div>
        <div style={{ height: '2rem', flexShrink: 0 }} />
    </div>
  );
};
