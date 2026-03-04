import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, AlertTriangle, CheckCircle, RefreshCw, Zap, User, Info, Volume2, List, ChevronRight, ChevronDown } from 'lucide-react';
import { ColorSwatchPicker } from './ColorSwatchPicker';
import { ConfirmModal } from './ConfirmModal';

import { api } from '../api';
import type { Chapter, SpeakerProfile, Job, Character, ChapterSegment } from '../types';

interface ChapterEditorProps {
  chapterId: string;
  projectId: string;
  speakerProfiles: SpeakerProfile[];
  speakers: import('../types').Speaker[];
  job?: Job;
  selectedVoice?: string;
  onVoiceChange?: (voice: string) => void;
  onBack: () => void;
  onNavigateToQueue: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  segmentUpdate?: { chapterId: string; tick: number };
}

export const ChapterEditor: React.FC<ChapterEditorProps> = ({ chapterId, projectId, speakerProfiles, speakers, job, selectedVoice: externalVoice, onVoiceChange, onBack, onNavigateToQueue, onNext, onPrev, segmentUpdate }) => {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localVoice, setLocalVoice] = useState<string>('');
  
  const [segments, setSegments] = useState<ChapterSegment[]>([]);
  const segmentsRef = useRef<ChapterSegment[]>(segments);
  
  // Compute merged voices groupings
  const availableVoices = React.useMemo(() => {
    const list = (speakers || []).map(s => ({ id: s.id, name: s.name, is_speaker: true }));
    const orphans = (speakerProfiles || [])
      .filter(p => !p.speaker_id || !speakers.some(s => s.id === p.speaker_id))
      .map(p => ({ id: `unassigned-${p.name}`, name: p.name, is_speaker: false }));
    return [...list, ...orphans];
  }, [speakers, speakerProfiles]);
  
  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedProfileName, setSelectedProfileName] = useState<string | null>(null);
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
  } | null>(null);
  
  const selectedVoice = externalVoice !== undefined ? externalVoice : localVoice;
  const handleVoiceChange = (voice: string) => {
      if (onVoiceChange) onVoiceChange(voice);
      setLocalVoice(voice);
  };

  const [analysis, setAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [editorTab, setEditorTab] = useState<'edit' | 'preview' | 'production' | 'performance'>('edit');
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [generatingSegmentIds, setGeneratingSegmentIds] = useState<Set<string>>(new Set());
  const generatingSegmentIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    generatingSegmentIdsRef.current = generatingSegmentIds;
  }, [generatingSegmentIds]);
  
  // Group segments for Block UI (matches backend chunking logic)
  const chunkGroups = React.useMemo(() => {
    const limit = 500;
    const groups: { characterId: string | null; segments: ChapterSegment[] }[] = [];
    
    segments.forEach(seg => {
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.characterId === seg.character_id) {
            const currentBatchText = lastGroup.segments.map(s => s.text_content).join(' ');
            
            if (currentBatchText.length + seg.text_content.length + 1 <= limit) {
                lastGroup.segments.push(seg);
                return;
            }
        }
        groups.push({ characterId: seg.character_id, segments: [seg] });
    });
    return groups;
  }, [segments]);

  // Group segments strictly by paragraph breaks for Production/Voice Assignment
  const paragraphGroups = React.useMemo(() => {
    const groups: { characterId: string | null; segments: ChapterSegment[] }[] = [];
    
    segments.forEach(seg => {
        const lastGroup = groups[groups.length - 1];
        const lastSeg = lastGroup?.segments[lastGroup.segments.length - 1];
        const isNewParagraph = lastSeg && (lastSeg.text_content.includes('\n') || lastSeg.text_content.includes('\r'));

        // For Production tab, we only group if they are in the same paragraph AND same character (if already assigned)
        // Actually, if we want to assign a voice to a paragraph, they might have different characters initially (assigned vs not).
        // Let's stick to literal paragraph structure.
        if (lastGroup && !isNewParagraph) {
            lastGroup.segments.push(seg);
        } else {
            groups.push({ characterId: seg.character_id, segments: [seg] });
        }
    });
    return groups;
  }, [segments]);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const playbackQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const segmentRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allSegmentIds = segments.map(s => s.id);

  const stopPlayback = () => {
    if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
    }
    setPlayingSegmentId(null);
    isPlayingRef.current = false;
    playbackQueueRef.current = [];
  };

  const togglePause = () => {
    const audio = audioPlayerRef.current;
    if (!audio) return;
    if (audio.paused) {
        audio.play().catch(() => {});
    } else {
        audio.pause();
    }
  };

  const handleGenerate = async (sids: string[]) => {
    setGeneratingSegmentIds(prev => {
        const next = new Set(prev);
        sids.forEach(id => next.add(id));
        return next;
    });
    try {
        await api.generateSegments(sids);
    } catch (e) {
        console.error(e);
        setGeneratingSegmentIds(prev => {
            const next = new Set(prev);
            sids.forEach(id => next.delete(id));
            return next;
        });
    }
  };

  const getGroupSegmentIds = (idx: number): string[] => {
     const queue = playbackQueueRef.current;
     if (idx >= queue.length) return [];
     const segId = queue[idx];
     const group = chunkGroups.find(g => g.segments.some(s => s.id === segId));
     if (!group) return [segId];
     const groupIds = group.segments.map(s => s.id);
     return queue.filter(qid => groupIds.includes(qid));
  };

  const lookAheadGenerate = (idx: number) => {
     if (idx >= playbackQueueRef.current.length) return;
     const groupIds = getGroupSegmentIds(idx);
     if (groupIds.length === 0) return;
     // Check ref (not state) to avoid stale closure
     if (groupIds.some(id => generatingSegmentIdsRef.current.has(id))) return;
     const missingIds = groupIds.filter(id => {
         const s = segmentsRef.current.find(seg => seg.id === id);
         return s && (!s.audio_file_path || s.audio_status !== 'done') && s.audio_status !== 'processing' && !generatingSegmentIdsRef.current.has(id);
     });
     if (missingIds.length > 0) {
         handleGenerate(missingIds);
     }
  };

  const playSegment = async (segmentId: string, fullQueue: string[]) => {
    if (playingSegmentId === segmentId && audioPlayerRef.current) {
        togglePause();
        return;
    }

    stopPlayback();
    isPlayingRef.current = true;
    playbackQueueRef.current = fullQueue;
    
    const currentIndex = fullQueue.indexOf(segmentId);
    if (currentIndex === -1) return;

    const playFromIndex = async (idx: number) => {
        if (!isPlayingRef.current || idx >= playbackQueueRef.current.length) {
            if (idx >= playbackQueueRef.current.length) stopPlayback();
            return;
        }

        const currentId = playbackQueueRef.current[idx];
        const seg = segmentsRef.current.find(s => s.id === currentId);
        if (!seg) return;

        setPlayingSegmentId(currentId);

        const currentGroup = getGroupSegmentIds(idx);
        const nextGroupStartIdx = idx + currentGroup.length - (currentGroup.indexOf(currentId));
        lookAheadGenerate(nextGroupStartIdx);

        if (!seg.audio_file_path || seg.audio_status !== 'done') {
            const groupIds = getGroupSegmentIds(idx);
            const missingInGroup = groupIds.filter(id => {
                const s = segmentsRef.current.find(seg => seg.id === id);
                return s && (!s.audio_file_path || s.audio_status !== 'done') && s.audio_status !== 'processing' && !generatingSegmentIdsRef.current.has(id);
            });
            // Use ref (not state) so the stale closure in setTimeout reads current live value
            if (missingInGroup.length > 0 && !groupIds.some(id => generatingSegmentIdsRef.current.has(id))) {
                handleGenerate(missingInGroup);
            }
            if (isPlayingRef.current) {
                setTimeout(() => playFromIndex(idx), 500);
            }
            return;
        }

        const audioPath = seg.audio_file_path;
        const wavPath = audioPath.replace(/\.[^.]+$/, '.wav');
        const mp3Path = audioPath.replace(/\.[^.]+$/, '.mp3');
        
        const urls = [
            projectId ? `/projects/${projectId}/audio/${audioPath}` : `/out/xtts/${audioPath}`,
            projectId ? `/projects/${projectId}/audio/${wavPath}` : `/out/xtts/${wavPath}`,
            projectId ? `/projects/${projectId}/audio/${mp3Path}` : `/out/xtts/${mp3Path}`,
            `/out/xtts/${audioPath}`,
            `/out/xtts/${wavPath}`,
            `/out/xtts/${mp3Path}`
        ].filter((v, i, a) => a.indexOf(v) === i); // unique
        
        let urlIdx = 0;
        const playWithFallback = (u: string) => {
            const audio = new Audio(u);
            audio.onended = () => {
                if (!isPlayingRef.current) return;
                let nextIdx = idx + 1;
                while (nextIdx < playbackQueueRef.current.length) {
                    const nextId = playbackQueueRef.current[nextIdx];
                    const nextSeg = segmentsRef.current.find(s => s.id === nextId);
                    if (nextSeg && nextSeg.audio_file_path && nextSeg.audio_file_path === seg.audio_file_path) {
                        nextIdx++;
                    } else {
                        break;
                    }
                }
                playFromIndex(nextIdx);
            };
            
            audio.onerror = () => {
                if (!isPlayingRef.current) return;
                urlIdx++;
                if (urlIdx < urls.length) {
                    playWithFallback(urls[urlIdx]);
                } else {
                    playFromIndex(idx + 1);
                }
            };
            
            audio.play().catch(e => {
                console.error("Playback failed", e);
                audio.onerror?.(new Event('error') as any);
            });
            audioPlayerRef.current = audio;
        };
        
        playWithFallback(urls[0]);
    };

    await playFromIndex(currentIndex);
  };

  useEffect(() => {
    loadChapter();
  }, [chapterId]);

  // React to WebSocket segment updates for this chapter — debounced so a burst
  // of per-segment events (e.g. cancel-all) collapses into a single re-fetch.
  useEffect(() => {
    if (!segmentUpdate || segmentUpdate.chapterId !== chapterId || segmentUpdate.tick === 0) return;
    if (segmentRefreshTimerRef.current) clearTimeout(segmentRefreshTimerRef.current);
    segmentRefreshTimerRef.current = setTimeout(async () => {
      try {
        const updated = await api.fetchSegments(chapterId);
        setSegments(updated);
        // Clear generating spinners for segments that are now done, errored, or reset to unprocessed
        setGeneratingSegmentIds(prev => {
          const next = new Set(prev);
          for (const id of prev) {
            const seg = updated.find((s: any) => s.id === id);
            if (seg && (seg.audio_status === 'done' || seg.audio_status === 'error' || seg.audio_status === 'unprocessed')) {
              next.delete(id);
            }
          }
          return next.size !== prev.size ? next : prev;
        });
      } catch (e) {
        console.error("Failed to refresh segments from WS", e);
      }
    }, 300);
  }, [segmentUpdate, chapterId]);

  useEffect(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (!text) {
        setAnalysis(null);
        return;
    }
    
    setAnalyzing(true);
    typingTimeoutRef.current = setTimeout(() => {
        runAnalysis(text);
    }, 1000);
    
    return () => {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [text]);

  const loadChapter = async () => {
    try {
      const chapters = await api.fetchChapters(projectId);
      const target = chapters.find(c => c.id === chapterId);
      if (target) {
        setChapter(target);
        setTitle(target.title);
        setText(target.text_content || '');
      }

      // Fetch segments and characters
      const [segs, chars] = await Promise.all([
        api.fetchSegments(chapterId),
        api.fetchCharacters(projectId)
      ]);
      setSegments(segs);
      setCharacters(chars);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async (textContent: string) => {
    if (!textContent) {
        setAnalysis(null);
        setAnalyzing(false);
        return;
    }

    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    setAnalyzing(true);
    try {
      let data;
      if (projectId && chapterId) {
        // Voice-aware analysis for existing chapters
        data = await api.analyzeChapter(chapterId);
      } else {
        // Generic analysis for new/standalone text
        const formData = new FormData();
        formData.set('text_content', textContent);
        const res = await fetch('/api/analyze_text', { 
            method: 'POST', 
            body: formData,
            signal: controller.signal
        });
        data = await res.json();
      }
      setAnalysis(data);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
          console.error("Analysis failed", e);
      }
    } finally {
      if (abortControllerRef.current === controller) {
          setAnalyzing(false);
      }
    }
  };

  const handleSave = async (manualTitle?: string, manualText?: string) => {
    if (!chapter) return false;
    
    const finalTitle = manualTitle !== undefined ? manualTitle : title;
    const finalText = manualText !== undefined ? manualText : text;
    
    let changed = false;
    const payload: any = {};
    
    if (finalTitle !== chapter.title) {
        payload.title = finalTitle;
        changed = true;
    }
    if (finalText !== chapter.text_content) {
        payload.text_content = finalText;
        changed = true;
    }
    
    if (!changed) return true;

    setSaving(true);
    try {
      const result = await api.updateChapter(chapterId, payload);
      if (result.chapter) {
          setChapter(result.chapter);
      }
      
      // If text changed, force refresh of segments and analysis immediately
      if (payload.text_content !== undefined) {
          const updatedSegs = await api.fetchSegments(chapterId);
          setSegments(updatedSegs);
          // Also trigger immediate analysis refresh bypassing the debounce
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          runAnalysis(payload.text_content);
      }
      return true;
    } catch (e) {
      console.error("Save failed", e);
      return false;
    } finally {
      setTimeout(() => setSaving(false), 500);
    }
  };

  const handleUpdateCharacterColor = async (id: string, color: string) => {
    try {
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, color } : c));
      await api.updateCharacter(id, undefined, undefined, undefined, color);
    } catch (e) {
      console.error("Failed to update character color", e);
      const chars = await api.fetchCharacters(projectId);
      setCharacters(chars);
    }
  };

  const handleParagraphBulkAssign = async (segmentIds: string[]) => {
    const isClearing = selectedCharacterId === 'CLEAR_ASSIGNMENT';
    const characterId = isClearing ? null : selectedCharacterId;
    const profileName = isClearing ? null : (selectedCharacterId ? selectedProfileName : null);
    const audioStatus = isClearing ? undefined : 'unprocessed';

    // Optimistic update
    setSegments(prev => prev.map(s => segmentIds.includes(s.id) ? { 
        ...s, 
        character_id: characterId,
        speaker_profile_name: profileName,
        audio_status: audioStatus || s.audio_status
    } : s));

    try {
        await api.updateSegmentsBulk(segmentIds, { 
            character_id: characterId,
            speaker_profile_name: profileName,
            audio_status: audioStatus
        });
    } catch (e) {
        console.error("Bulk assign failed", e);
        // Fallback or refresh? Maybe loadChapter() if failed
    }
  };

  const toggleCharacterExpansion = (characterId: string) => {
    setExpandedCharacterId(prev => prev === characterId ? null : characterId);
  };

  const handleParagraphBulkReset = async (segmentIds: string[]) => {
    // Optimistic update
    setSegments(prev => prev.map(s => segmentIds.includes(s.id) ? { 
        ...s, 
        character_id: null,
        speaker_profile_name: null 
    } : s));

    try {
        await api.updateSegmentsBulk(segmentIds, { 
            character_id: null,
            speaker_profile_name: null
        });
    } catch (e) {
        console.error("Bulk reset failed", e);
    }
  };

  const executeQueue = async () => {
    setSubmitting(true);
    try {
        const voiceToUse = selectedVoice || undefined;
        await api.addProcessingQueue(projectId, chapterId, 0, voiceToUse);
        onNavigateToQueue();
    } catch (e) {
        console.error("Failed to enqueue", e);
        setConfirmConfig({
            title: 'Queue Failed',
            message: 'Failed to queue chapter.',
            onConfirm: () => setConfirmConfig(null),
            isDestructive: false,
            confirmText: 'OK'
        });
    } finally {
        setSubmitting(false);
    }
  };

  const handleNavigate = async (dir: 'next' | 'prev') => {
      // Force save before navigating
      await handleSave();
      if (dir === 'next' && onNext) onNext();
      if (dir === 'prev' && onPrev) onPrev();
  };

  // Auto-save logic
  useEffect(() => {
    // Skip initial mount
    if (loading) return;

    const timer = setTimeout(() => {
        handleSave(title, text);
    }, 1500); // 1.5s debounce for auto-save

    return () => clearTimeout(timer);
  }, [title, text]);

  if (loading) return <div style={{ padding: '2rem' }}>Loading editor...</div>;
  if (!chapter) return <div style={{ padding: '2rem' }}>Chapter not found.</div>;

  const hasUnsavedChanges = (title || "").trim() !== (chapter.title || "").trim() || 
                           (text || "").replace(/\r\n/g, '\n') !== (chapter.text_content || "").replace(/\r\n/g, '\n');

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 72px)', margin: '-2.5rem', background: 'var(--bg)', position: 'relative', zIndex: 100 }}>
      {/* Editor Header */}
      <header style={{ 
        display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem', 
        borderBottom: '1px solid var(--border)', background: 'var(--surface)',
        flexShrink: 0
      }}>
        <button onClick={async () => { await handleSave(); onBack(); }} className="btn-ghost" style={{ padding: '0.5rem' }} title="Save & Back to Project">
          <ArrowLeft size={18} />
        </button>
        <div style={{ display: 'flex', gap: '0.25rem', borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
          <button 
            onClick={() => handleNavigate('prev')} 
            disabled={!onPrev} 
            className="btn-ghost" 
            style={{ padding: '0.4rem', opacity: !onPrev ? 0.3 : 1, cursor: !onPrev ? 'not-allowed' : 'pointer' }}
            title="Save & Previous Chapter"
          >
            ← Prev
          </button>
          <button 
            onClick={() => handleNavigate('next')} 
            disabled={!onNext} 
            className="btn-ghost" 
            style={{ padding: '0.4rem', opacity: !onNext ? 0.3 : 1, cursor: !onNext ? 'not-allowed' : 'pointer' }}
            title="Save & Next Chapter"
          >
            Next →
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
            <input 
                value={title}
                onChange={e => setTitle(e.target.value)}
                style={{
                    fontSize: '1.25rem', fontWeight: 600, background: 'transparent', border: 'none', 
                    color: 'var(--text-primary)', outline: 'none', width: '100%',
                    padding: '0.25rem'
                }}
            />
            
            {chapter.audio_status === 'done' && chapter.audio_file_path && (
                <div style={{ paddingLeft: '1rem', borderLeft: '1px solid var(--border)' }}>
                    {(() => {
                        const audioPath = chapter.audio_file_path;
                        if (!audioPath) return null;
                        const wavPath = audioPath.replace(/\.[^.]+$/, '.wav');
                        const mp3Path = audioPath.replace(/\.[^.]+$/, '.mp3');
                        
                        return (
                            <audio 
                                controls 
                                key={chapter.id}
                                style={{ height: '32px', maxWidth: '300px' }}
                            >
                                <source src={`/projects/${chapter.project_id}/audio/${audioPath}`} />
                                {audioPath !== wavPath && <source src={`/projects/${chapter.project_id}/audio/${wavPath}`} />}
                                {audioPath !== mp3Path && <source src={`/projects/${chapter.project_id}/audio/${mp3Path}`} />}
                                <source src={`/out/xtts/${audioPath}`} />
                                {audioPath !== wavPath && <source src={`/out/xtts/${wavPath}`} />}
                                {audioPath !== mp3Path && <source src={`/out/xtts/${mp3Path}`} />}
                            </audio>
                        );
                    })()}
                </div>
            )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {speakerProfiles.length > 0 && (
                <select
                    value={selectedVoice}
                    onChange={(e) => handleVoiceChange(e.target.value)}
                    style={{
                        padding: '0.4rem 2rem 0.4rem 0.8rem',
                        borderRadius: '8px', border: '1px solid var(--border)',
                        background: 'var(--surface-light)', color: 'var(--text-primary)',
                        fontSize: '0.85rem', outline: 'none', cursor: 'pointer',
                        appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center'
                    }}
                    title="Select Voice Profile for this chapter"
                >
                    <option value="">Unassigned (Default Speaker)</option>
                    {availableVoices.map(v => (
                        <option key={v.id} value={v.name}>{v.name}</option>
                    ))}
                </select>
            )}

            <button
                onClick={async () => {
                    if (chapter?.char_count && chapter.char_count > 50000) {
                        setConfirmConfig({
                            title: 'Large Chapter Warning',
                            message: `This chapter is quite long (${chapter.char_count.toLocaleString()} chars). Processing very large chapters in a single job may cause issues. Queue anyway?`,
                            isDestructive: false,
                            confirmText: 'Queue Anyway',
                            onConfirm: async () => {
                                setConfirmConfig(null);
                                await executeQueue();
                            }
                        });
                        return;
                    }
                    await executeQueue();
                }}
                disabled={submitting || (job?.status === 'queued' || job?.status === 'running') || chapter?.audio_status === 'processing'}
                className="btn-primary"
                style={{
                    padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
                    opacity: (job?.status === 'queued' || job?.status === 'running') || chapter?.audio_status === 'processing' ? 0.3 : 1,
                    cursor: (job?.status === 'queued' || job?.status === 'running') || chapter?.audio_status === 'processing' ? 'not-allowed' : 'pointer'
                }}
                title={((job?.status === 'queued' || job?.status === 'running') || chapter?.audio_status === 'processing') ? "Already processing" : "Queue Chapter"}
            >
                {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                Queue
            </button>

            {(generatingSegmentIds.size > 0 || chapter?.audio_status === 'processing') && (
                <button
                    onClick={async () => {
                        try {
                            await api.cancelChapterGeneration(chapterId);
                            setGeneratingSegmentIds(new Set());
                            loadChapter(); // Refresh status
                        } catch (e) {
                            console.error("Failed to cancel", e);
                        }
                    }}
                    className="btn-ghost"
                    style={{
                        padding: '0.4rem 0.8rem', fontSize: '0.85rem', color: 'var(--error)', 
                        border: '1px solid var(--error-muted)', borderRadius: '8px',
                        display: 'flex', alignItems: 'center', gap: '0.4rem'
                    }}
                >
                    Stop All
                </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-light)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.8rem', color: saving ? 'var(--warning)' : (hasUnsavedChanges ? 'var(--accent)' : 'var(--success-text)'), display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {saving ? <RefreshCw size={14} className="animate-spin" /> : (hasUnsavedChanges ? <AlertTriangle size={14} /> : <CheckCircle size={14} color="var(--success)" />)}
                    {saving ? 'Saving...' : (hasUnsavedChanges ? 'Unsaved' : 'Saved')}
                </span>
            </div>
        </div>
      </header>

      {/* Main Layout Split */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          
        {/* Left pane: Text Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', flexShrink: 0 }}>
                    <button 
                        onClick={() => setEditorTab('edit')} 
                        className={editorTab === 'edit' ? 'btn-primary' : 'btn-ghost'}
                        style={{ padding: '8px 16px', fontSize: '0.9rem', borderRadius: '8px' }}
                    >
                        Edit Text
                    </button>
                    <button 
                        onClick={async () => {
                            await handleSave();
                            setEditorTab('production');
                        }} 
                        className={editorTab === 'production' ? 'btn-primary' : 'btn-ghost'}
                        style={{ padding: '8px 16px', fontSize: '0.9rem', borderRadius: '8px' }}
                    >
                        Production
                    </button>
                    <button 
                        onClick={async () => {
                            await handleSave();
                            setEditorTab('performance');
                        }} 
                        className={editorTab === 'performance' ? 'btn-primary' : 'btn-ghost'}
                        style={{ padding: '8px 16px', fontSize: '0.9rem', borderRadius: '8px' }}
                    >
                        Performance
                    </button>
                    <button 
                        onClick={async () => {
                            // First ensure we are saved so analysis is fresh
                            await handleSave();
                            if (!analysis?.safe_text && !analysis?.voice_chunks) {
                                alert("Please wait for text to be analyzed...");
                            } else {
                                setEditorTab('preview');
                            }
                        }} 
                        className={editorTab === 'preview' ? 'btn-primary' : 'btn-ghost'}
                        style={{ padding: '8px 16px', fontSize: '0.9rem', borderRadius: '8px' }}
                        disabled={!analysis?.safe_text && !analysis?.voice_chunks}
                    >
                        Preview Safe Output
                    </button>
                </div>
                {editorTab === 'edit' ? (
                    <textarea 
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Start typing your chapter text here..."
                        style={{
                            flex: 1,
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            padding: '1.5rem',
                            fontSize: '1.05rem',
                            lineHeight: 1.6,
                            color: 'var(--text-primary)',
                            outline: 'none',
                            resize: 'none',
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                            overflowY: 'auto'
                        }}
                    />
                ) : editorTab === 'performance' ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto', padding: '1.5rem', minHeight: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <List size={20} color="var(--accent)" />
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Performance View</h3>
                            </div>
                            <button 
                                onClick={async () => {
                                    setSubmitting(true);
                                    try {
                                        await api.bakeChapter(chapterId);
                                        onNavigateToQueue();
                                    } catch (e) {
                                        console.error(e);
                                    } finally {
                                        setSubmitting(false);
                                    }
                                }}
                                className="btn-primary"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', boxShadow: '0 4px 12px var(--accent-glow)' }}
                                title="Stitch all segment audios into the final chapter file"
                            >
                                <RefreshCw size={16} className={submitting ? 'animate-spin' : ''} /> Bake Final Chapter
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {chunkGroups.map((group, gidx) => {
                                    const char = characters.find(c => c.id === group.characterId);
                                    const allDone = group.segments.every(s => s.audio_status === 'done');
                                    const anyProcessing = group.segments.some(s => s.audio_status === 'processing' || generatingSegmentIds.has(s.id));
                                    const isPlaying = playingSegmentId && group.segments.some(s => s.id === playingSegmentId);
                                    const nextId = (() => {
                                        if (!playingSegmentId || playbackQueueRef.current.length === 0) return null;
                                        const currIdx = playbackQueueRef.current.indexOf(playingSegmentId);
                                        if (currIdx === -1 || currIdx >= playbackQueueRef.current.length - 1) return null;
                                        
                                        // Skip siblings that share same audio path as current to find the TRUE "next" group
                                        const playingSeg = segmentsRef.current.find(ps => ps.id === playingSegmentId);
                                        let nextIdx = currIdx + 1;
                                        while (nextIdx < playbackQueueRef.current.length) {
                                            const sId = playbackQueueRef.current[nextIdx];
                                            const s = segmentsRef.current.find(ps => ps.id === sId);
                                            if (s && playingSeg && s.audio_file_path && s.audio_file_path === playingSeg.audio_file_path) {
                                                nextIdx++;
                                            } else {
                                                break;
                                            }
                                        }
                                        return nextIdx < playbackQueueRef.current.length ? playbackQueueRef.current[nextIdx] : null;
                                    })();
                                    const isNext = nextId && group.segments.some(s => s.id === nextId);

                                    return (
                                        <div key={gidx} style={{ 
                                            display: 'flex', gap: '1.5rem', 
                                            background: 'var(--surface)', padding: '1.25rem', 
                                            borderRadius: '16px', border: '1px solid var(--border)',
                                            transition: 'all 0.2s ease',
                                            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                                            borderLeft: `4px solid ${char?.color || 'var(--text-muted)'}`
                                        }}>
                                            <div style={{ width: '130px', flexShrink: 0 }}>
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
                                                            onClick={stopPlayback} 
                                                            className="btn-primary" 
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', fontSize: '0.8rem', padding: '0.5rem' }}
                                                        >
                                                            <Zap size={14} fill="currentColor" /> Stop
                                                        </button>
                                                    ) : (
                                                        <button 
                                                            onClick={() => playSegment(group.segments[0].id, allSegmentIds)} 
                                                            className="btn-ghost" 
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', fontSize: '0.8rem', padding: '0.5rem', background: 'rgba(255,255,255,0.1)' }}
                                                        >
                                                            <Volume2 size={14} /> Listen
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => handleGenerate(group.segments.map(s => s.id))}
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
                                                        {anyProcessing ? 'Working...' : (allDone ? 'Regenerate' : 'Generate')}
                                                    </button>
                                                </div>
                                            </div>
                                            <div 
                                                onClick={() => {
                                                    // Play from the start of this group FORWARD
                                                    const queueFromHere = allSegmentIds.slice(allSegmentIds.indexOf(group.segments[0].id));
                                                    playSegment(group.segments[0].id, queueFromHere);
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
                                                        ? '#ffeb3b44' // Yellow (playing)
                                                        : (anyProcessing || isNext)
                                                            ? '#e1bee733' // Light Purple (preparing or next)
                                                            : 'transparent',
                                                    borderBottom: isPlaying ? '3px solid #fbc02d' : (anyProcessing || isNext) ? '2px dashed #9c27b0' : '2px solid transparent',
                                                    position: 'relative',
                                                    whiteSpace: 'pre-wrap'
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
                ) : editorTab === 'preview' ? (
                    <div style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem', overflowY: 'auto' }}>
                        <div style={{ width: '100%', margin: '0 auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ margin: 0, opacity: 0.8, fontSize: '1.2rem', fontWeight: 600 }}>Preview Safe Output</h3>
                                {analysis && (
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem' }}>
                                        <span>{analysis.sent_count} Sentences</span> /
                                        <span>{analysis.char_count} Characters (of {analysis.threshold || 250})</span>
                                    </div>
                                )}
                            </div>
                            
                            {analyzing ? (
                                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                    <RefreshCw size={24} className="animate-spin" style={{ marginBottom: '1rem' }} />
                                    <p>Analyzing text and splitting into engine-safe segments...</p>
                                </div>
                            ) : (analysis?.voice_chunks) ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {analysis.voice_chunks.map((chunk: any, cidx: number) => {
                                        const isTooLong = (chunk.raw_length || chunk.length) > (analysis.threshold || 250);
                                        return (
                                            <div key={cidx} style={{ 
                                                padding: '1rem', 
                                                background: 'var(--surface)', 
                                                borderRadius: '12px', 
                                                border: `1px solid ${isTooLong ? 'var(--error-muted)' : 'var(--border)'}`,
                                                borderLeft: `6px solid ${chunk.character_color || 'var(--primary)'}`,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '0.75rem',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                                                position: 'relative'
                                            }}>
                                                <div style={{ 
                                                    display: 'flex', 
                                                    justifyContent: 'space-between', 
                                                    alignItems: 'center',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em'
                                                }}>
                                                    <div style={{ 
                                                        color: chunk.character_color || 'var(--text-muted)', 
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.4rem'
                                                    }}>
                                                        <span style={{ color: '#ccc' }}>#{cidx + 1}</span>
                                                        <span>{chunk.character_name}</span>
                                                    </div>
                                                    <div style={{ color: 'var(--text-muted)', opacity: 0.6, display: 'flex', gap: '0.8rem' }}>
                                                        {chunk.sent_count > 0 && <span>{chunk.sent_count}</span>} /
                                                        <span style={{ color: isTooLong ? 'var(--error)' : 'inherit' }}>
                                                            {chunk.raw_length || chunk.length}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div style={{ 
                                                    fontSize: '1.05rem', 
                                                    color: 'var(--text-primary)', 
                                                    lineHeight: 1.7, 
                                                    fontFamily: 'serif',
                                                    whiteSpace: 'pre-wrap',
                                                    background: 'rgba(255,255,255,0.01)',
                                                    padding: '0.5rem',
                                                    borderRadius: '4px'
                                                }}>
                                                    {chunk.text}<span style={{ color: 'var(--primary)', opacity: 0.8, fontWeight: 900, marginLeft: '2px' }}></span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : analysis?.safe_text ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {analysis.safe_text.split('\n').map((block: string, bidx: number) => {
                                        const isTooLong = block.length > (analysis.threshold || 250) + 20; 
                                        return (
                                            <div key={bidx} style={{ 
                                                padding: '1.25rem', 
                                                background: 'var(--surface)', 
                                                borderRadius: '12px', 
                                                border: `1px solid ${isTooLong ? 'var(--error-muted)' : 'var(--border)'}`,
                                                display: 'flex',
                                                gap: '1.5rem',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                            }}>
                                                <div style={{ width: '40px', flexShrink: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, opacity: 0.6 }}>
                                                    #{bidx + 1}
                                                </div>
                                                <div style={{ flex: 1, fontSize: '1.05rem', color: 'var(--text-primary)', lineHeight: 1.7, fontFamily: 'serif', whiteSpace: 'pre-wrap' }}>
                                                    {block}<span style={{ color: 'var(--primary)', opacity: 0.8, fontWeight: 900 }}>|</span>
                                                </div>
                                                <div style={{ width: '60px', flexShrink: 0, textAlign: 'right', fontSize: '0.75rem', color: isTooLong ? 'var(--error)' : 'var(--text-muted)', fontWeight: 600 }}>
                                                    {block.length}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                                    No analysis available. Please enter some text in the Edit tab.
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', padding: '1rem', gap: '1rem' }}>
            {/* Main Production View (Grouped Movie Sheet) */}
            <div style={{ 
              flex: 1, 
              background: 'var(--bg)', 
              border: '1px solid var(--border)', 
              borderRadius: '12px', 
              padding: '2rem', 
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem' // Slightly more gap between groups
            }}>
              {paragraphGroups.map((group, gidx) => {
                const char = characters.find(c => c.id === group.characterId);
                const isSelectedCharLines = selectedCharacterId && group.characterId === selectedCharacterId;
                const isHovered = hoveredSegmentId === group.segments[0].id;
                
                return (
                  <div 
                    key={gidx}
                    onMouseEnter={() => setHoveredSegmentId(group.segments[0].id)}
                    onMouseLeave={() => setHoveredSegmentId(null)}
                    onClick={() => {
                        if (selectedCharacterId) {
                            // Bulk assign all segments in this chunk
                            // Bulk assign all segments in this paragraph in one call
                            handleParagraphBulkAssign(group.segments.map(s => s.id));
                        } else {
                            setActiveSegmentId(group.segments[0].id === activeSegmentId ? null : group.segments[0].id);
                        }
                    }}
                    style={{ 
                      display: 'flex',
                      padding: '0.75rem 1.25rem',
                      borderRadius: '8px',
                      background: isSelectedCharLines ? `${char?.color || '#94a3b8'}15` : (isHovered ? 'var(--surface-light)' : 'transparent'),
                      borderLeft: `4px solid ${char ? char.color : 'var(--text-muted)'}`,
                      cursor: (selectedCharacterId && selectedCharacterId !== 'CLEAR_ASSIGNMENT') ? 'copy' : (selectedCharacterId === 'CLEAR_ASSIGNMENT' ? 'crosshair' : 'pointer'),
                      transition: 'all 0.1s ease',
                      gap: '2rem',
                      boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    {/* Character/Voice column */}
                    <div style={{ 
                        width: '140px', 
                        flexShrink: 0, 
                        fontSize: '0.8rem', 
                        fontWeight: 700,
                        color: char ? char.color : 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                    }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {char?.name || 'NARRATOR'}
                        </div>
                        {group.segments[0].speaker_profile_name && (
                            <div style={{ 
                                fontSize: '0.6rem', 
                                background: 'rgba(255,255,255,0.05)', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                width: 'fit-content',
                                opacity: 0.8,
                                fontWeight: 600,
                                textTransform: 'none',
                                letterSpacing: 'normal'
                            }}>
                                {group.segments[0].speaker_profile_name}
                            </div>
                        )}
                    </div>

                    {/* Text column */}
                    <div style={{ flex: 1 }}>
                        <p style={{ 
                            fontSize: '1rem', 
                            color: 'var(--text-primary)', 
                            margin: 0, 
                            lineHeight: 1.6,
                            opacity: (selectedCharacterId && !isSelectedCharLines) ? 0.5 : 1,
                            whiteSpace: 'pre-wrap'
                        }}>
                            {group.segments.map(s => s.text_content).join('')}
                        </p>
                    </div>

                    {/* Quick status/actions */}
                    <div style={{ width: '80px', flexShrink: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {group.segments.every(s => s.audio_status === 'done') && (
                            <div title="Audio Generated" style={{ color: 'var(--success-muted)' }}>
                                <CheckCircle size={14} />
                            </div>
                        )}
                        {activeSegmentId === group.segments[0].id && !selectedCharacterId && (
                           <div style={{ display: 'flex', gap: '4px' }}>
                               <button 
                                 className="btn-ghost" 
                                 style={{ padding: '2px 4px', fontSize: '0.7rem' }}
                                 onClick={(e) => {
                                     e.stopPropagation();
                                     handleParagraphBulkReset(group.segments.map(s => s.id));
                                 }}
                               >
                                   Reset
                               </button>
                           </div>
                        )}
                    </div>
                  </div>
                );
              })}
              
              {segments.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <AlertTriangle size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                  <p>No segments found. Save the chapter text to generate segments.</p>
                </div>
              )}
            </div>

            {/* Right Sidebar: Characters */}
            <div style={{ 
              width: '320px', 
              marginLeft: '1rem',
              display: 'flex', 
              flexDirection: 'column', 
              gap: '1rem' 
            }}>
                <div className="glass-panel" style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        <User size={16} />
                        Characters
                    </h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
                        <button 
                            onClick={() => {
                                if (selectedCharacterId === 'CLEAR_ASSIGNMENT') {
                                    setSelectedCharacterId(null);
                                } else {
                                    setSelectedCharacterId('CLEAR_ASSIGNMENT');
                                    setSelectedProfileName(null);
                                }
                            }}
                            style={{ 
                                padding: '0.75rem', 
                                borderRadius: '8px', 
                                border: `1px solid ${selectedCharacterId === 'CLEAR_ASSIGNMENT' ? 'var(--accent)' : 'var(--border)'}`,
                                background: selectedCharacterId === 'CLEAR_ASSIGNMENT' ? 'var(--surface-light)' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                color: 'var(--text-primary)',
                                textAlign: 'left',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                position: 'relative'
                            }}
                        >
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>None / Default</div>
                                <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>{selectedCharacterId === 'CLEAR_ASSIGNMENT' ? 'Click lines to clear' : 'Normal selection mode'}</div>
                            </div>
                            {selectedCharacterId === 'CLEAR_ASSIGNMENT' && (
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', position: 'absolute', top: '8px', right: '8px' }} />
                            )}
                        </button>

                        {characters.map(char => {
                            const speakerMatch = (speakers || []).find(s => s.name === char.speaker_profile_name);
                            const variants = speakerMatch ? (speakerProfiles || []).filter(p => p.speaker_id === speakerMatch.id) : [];
                            const isExpanded = expandedCharacterId === char.id;
                            const isSpeakerSelected = selectedCharacterId === char.id && !selectedProfileName;

                            return (
                                <React.Fragment key={char.id}>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        {/* Expansion arrow toggle */}
                                        {variants.length > 1 ? (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleCharacterExpansion(char.id);
                                                }}
                                                className="btn-ghost"
                                                style={{ 
                                                    width: '28px', minWidth: '28px', height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                                    padding: 0, opacity: 0.6, borderRadius: '4px'
                                                }}
                                            >
                                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </button>
                                        ) : (
                                            <div style={{ width: '28px', minWidth: '28px' }} />
                                        )}

                                        <div 
                                            onClick={() => {
                                                setSelectedCharacterId(char.id);
                                                setSelectedProfileName(null);
                                            }}
                                            style={{ 
                                                flex: 1, padding: '0.75rem', borderRadius: '8px', 
                                                border: `1px solid ${isSpeakerSelected ? char.color : 'var(--border)'}`,
                                                background: isSpeakerSelected ? `${char.color}15` : 'transparent',
                                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s',
                                                minWidth: 0
                                            }}
                                        >
                                            <ColorSwatchPicker 
                                                value={char.color || '#94a3b8'} 
                                                onChange={(color) => handleUpdateCharacterColor(char.id, color)} 
                                                size="sm" 
                                            />
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{char.name}</div>
                                                <div style={{ fontSize: '0.7rem', opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{char.speaker_profile_name || 'No voice'}</div>
                                            </div>
                                            {variants.length > 1 && (
                                                <div style={{ fontSize: '0.65rem', background: 'var(--surface-light)', padding: '2px 6px', borderRadius: '10px', opacity: 0.8, fontWeight: 700, flexShrink: 0 }}>
                                                    {variants.length}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Variants list (nested) */}
                                    {isExpanded && variants.map(variant => {
                                        const isVariantSelected = selectedCharacterId === char.id && selectedProfileName === variant.name;
                                        return (
                                            <button 
                                                key={variant.name}
                                                onClick={() => {
                                                    setSelectedCharacterId(char.id);
                                                    setSelectedProfileName(variant.name);
                                                }}
                                                style={{ 
                                                    marginLeft: '36px', padding: '0.5rem 0.75rem', borderRadius: '6px', 
                                                    border: `1px solid ${isVariantSelected ? char.color : 'transparent'}`,
                                                    background: isVariantSelected ? `${char.color}10` : 'transparent',
                                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                    color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s',
                                                    opacity: isVariantSelected ? 1 : 0.7,
                                                    minWidth: 0
                                                }}
                                            >
                                                <div style={{ 
                                                    width: '8px', height: '8px', borderRadius: '50%', 
                                                    border: `1.5px solid ${char.color}`, 
                                                    background: isVariantSelected ? char.color : 'transparent',
                                                    flexShrink: 0
                                                }} />
                                                <div style={{ flex: 1, fontSize: '0.8rem', fontWeight: isVariantSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {variant.variant_name || 'Standard'}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </div>

                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <Info size={12} style={{ display: 'inline', marginRight: '4px' }} />
                        Select a character to bulk-assign lines by clicking them in the script.
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '1rem' }}>
                    <h4 style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Chapter Stats</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                         <div style={{ background: 'var(--surface)', padding: '0.5rem', borderRadius: '4px', textAlign: 'center' }}>
                             <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{chapter.word_count}</div>
                             <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>WORDS</div>
                         </div>
                         <div style={{ background: 'var(--surface)', padding: '0.5rem', borderRadius: '4px', textAlign: 'center' }}>
                             <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{segments.length}</div>
                             <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>LINES</div>
                         </div>
                    </div>
                </div>
            </div>
          </div>
        )}

        <ConfirmModal
          isOpen={!!confirmConfig}
          title={confirmConfig?.title || ''}
          message={confirmConfig?.message || ''}
          onConfirm={() => {
            confirmConfig?.onConfirm();
            setConfirmConfig(null);
          }}
          onCancel={() => setConfirmConfig(null)}
          isDestructive={confirmConfig?.isDestructive}
          confirmText={confirmConfig?.confirmText}
        />
      </div>
    </div>
  </div>
</div>
);
};
