import React, { useState, useEffect, useRef } from 'react';
import { ConfirmModal } from './ConfirmModal';
import { api } from '../api';
import type { Chapter, SpeakerProfile, Job, Character, ChapterSegment, SegmentProgress, ProductionBlock, ProductionRenderBatch, ProductionBlocksResponse, ScriptViewResponse, ScriptRangeAssignment, TtsEngine } from '../types';

// Extracted Components
import { ChapterHeader } from './chapter/ChapterHeader';
import { EditorTabs } from './chapter/EditorTabs';
import { EditTab } from './chapter/EditTab';
import { PerformanceTab } from './chapter/PerformanceTab';
import { PreviewTab } from './chapter/PreviewTab';
import { ProductionTab } from './chapter/ProductionTab';
import { ScriptView } from './chapter/ScriptView';
import { ResyncPreviewModal, type ResyncPreviewData } from './chapter/ResyncPreviewModal';
import { CharacterSidebar } from './chapter/CharacterSidebar';

// Extracted Hooks
import { useChapterPlayback } from '../hooks/useChapterPlayback';
import { useChapterAnalysis } from '../hooks/useChapterAnalysis';
import { buildVoiceOptions, getDefaultVoiceProfileName, getVoiceOptionLabel, getVoiceProfileEngine, formatVoiceEngineLabel } from '../utils/voiceProfiles';
import { buildChunkGroups } from '../utils/chunkGroups';
import { pickRelevantJob } from '../utils/jobSelection';

interface ChapterEditorProps {
  chapterId: string;
  projectId: string;
  speakerProfiles: SpeakerProfile[];
  speakers: import('../types').Speaker[];
  engines?: TtsEngine[];
  job?: Job;
  chapterJobs?: Job[];
  segmentProgress?: Record<string, SegmentProgress>;
  selectedVoice?: string;
  onBack?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  segmentUpdate?: { chapterId: string; tick: number };
  chapterUpdate?: { chapterId: string; tick: number };
}

export const ChapterEditor: React.FC<ChapterEditorProps> = ({ 
  chapterId, 
  projectId, 
  speakerProfiles, 
  speakers, 
  engines = [],
  job, 
  chapterJobs = [],
  segmentProgress = {},
  selectedVoice: externalVoice, 
  onNext, 
  onPrev, 
  segmentUpdate,
  chapterUpdate
}) => {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [queuePending, setQueuePending] = useState(false);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [localVoice, setLocalVoice] = useState<string>('');
  
  const [segments, setSegments] = useState<ChapterSegment[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [productionBlocks, setProductionBlocks] = useState<ProductionBlock[]>([]);
  const [renderBatches, setRenderBatches] = useState<ProductionRenderBatch[]>([]);
  const [productionBaseRevisionId, setProductionBaseRevisionId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedProfileName, setSelectedProfileName] = useState<string | null>(null);
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'wav' | 'mp3' | null>(null);
  const [scriptViewData, setScriptViewData] = useState<ScriptViewResponse | null>(null);
  const [scriptViewLoading, setScriptViewLoading] = useState(true);
  const [compacting, setCompacting] = useState(false);
  const [resyncPreviewData, setResyncPreviewData] = useState<ResyncPreviewData | null>(null);
  const [isPreviewingResync, setIsPreviewingResync] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [sourceTextMode, setSourceTextMode] = useState<'view' | 'edit'>('view');
  
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
  } | null>(null);

  const projectVoice = externalVoice || '';
  const chapterVoice = localVoice;
  const effectiveSelectedVoice = chapterVoice || projectVoice;
  const chapterDefaultVoiceLabel = React.useMemo(() => {
    const fallbackVoiceValue = projectVoice || getDefaultVoiceProfileName(speakerProfiles || []) || '';
    const fallbackVoiceLabel = getVoiceOptionLabel(fallbackVoiceValue, speakerProfiles || [], speakers || [], engines);
    return fallbackVoiceLabel ? `Use Project Default (${fallbackVoiceLabel})` : 'Use Project Default';
  }, [projectVoice, speakerProfiles, speakers, engines]);
  const selectedVoiceLabel = React.useMemo(() => {
    const selected = chapterVoice || projectVoice;
    if (!selected) return '';
    return getVoiceOptionLabel(selected, speakerProfiles || [], speakers || [], engines) || selected;
  }, [chapterVoice, projectVoice, speakerProfiles, speakers, engines]);
  const handleVoiceChange = async (voice: string) => {
      const previousVoice = localVoice;
      const previousChapterVoice = chapter?.speaker_profile_name ?? null;
      setLocalVoice(voice);
      setChapter(prev => prev ? { ...prev, speaker_profile_name: voice || null } : prev);
      try {
        await api.updateChapter(chapterId, { speaker_profile_name: voice || null });
      } catch (e) {
        console.error(e);
        setLocalVoice(previousVoice);
        setChapter(prev => prev ? { ...prev, speaker_profile_name: previousChapterVoice } : prev);
        setConfirmConfig({
          title: 'Voice Update Failed',
          message: e instanceof Error ? e.message : 'The chapter voice could not be saved.',
          onConfirm: () => {},
          confirmText: 'OK'
        });
      }
  };

  const [editorTab, setEditorTab] = useState<'script' | 'edit' | 'preview' | 'production' | 'performance'>('script');
  const [generatingSegmentIds, setGeneratingSegmentIds] = useState<Set<string>>(new Set());
  const pendingGenerationIdsRef = useRef<Set<string>>(new Set());
  const pendingGenerationTimesRef = useRef<Map<string, number>>(new Map());
  const segmentRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionPollAttemptsRef = useRef(0);

  const availableVoices = React.useMemo(() => {
    return buildVoiceOptions(speakerProfiles || [], speakers || [], engines);
  }, [speakers, speakerProfiles, engines]);

  const resolveVoiceEngineStatus = React.useCallback((voiceName: string | null | undefined) => {
    const targetVoice = (voiceName || '').trim();
    if (!targetVoice) {
      return {
        profileName: null as string | null,
        engineId: null as string | null,
        engineLabel: null as string | null,
        enabled: true,
        message: null as string | null,
      };
    }

    if (!engines || engines.length === 0) {
      return {
        profileName: targetVoice,
        engineId: null,
        engineLabel: null,
        enabled: true,
        message: null as string | null,
      };
    }

    const profile = speakerProfiles.find(profile => profile.name === targetVoice);
    const engineId = getVoiceProfileEngine(profile);
    const engineLabel = formatVoiceEngineLabel(engineId);
    if (!profile || !engineId) {
      return {
        profileName: targetVoice,
        engineId: null,
        engineLabel,
        enabled: false,
        message: `${targetVoice} is unavailable. Choose an available voice or enable its engine in Settings.`,
      };
    }

    const engine = engines.find(engine => engine.engine_id === engineId);
    const enabled = Boolean(engine?.enabled && engine.status === 'ready');
    return {
      profileName: targetVoice,
      engineId,
      engineLabel,
      enabled,
      message: enabled
        ? null
        : `${targetVoice} is a ${engineLabel} voice, but ${engineLabel} is disabled in Settings. Enable the engine or choose an available voice.`,
    };
  }, [engines, speakerProfiles]);

  const buildFallbackProductionBlocks = React.useCallback((sourceSegments: ChapterSegment[]): ProductionBlock[] => {
    return [...sourceSegments]
      .sort((a, b) => (a.segment_order ?? 0) - (b.segment_order ?? 0))
      .map((segment, index) => ({
        id: segment.id,
        order_index: index,
        text: segment.sanitized_text || segment.text_content || '',
        character_id: segment.character_id,
        speaker_profile_name: segment.speaker_profile_name,
        status: segment.audio_status === 'done'
          ? 'rendered'
          : segment.audio_status === 'processing'
            ? 'running'
            : segment.audio_status === 'failed' || segment.audio_status === 'error'
              ? 'failed'
              : segment.audio_status === 'cancelled'
                ? 'failed'
                : 'draft',
        source_segment_ids: [segment.id],
      }));
  }, []);

  const syncProductionBlocks = React.useCallback((payload: {
    base_revision_id?: string | null;
    blocks: ProductionBlock[];
    render_batches?: ProductionRenderBatch[];
  }) => {
    setProductionBaseRevisionId(payload.base_revision_id ?? null);
    setProductionBlocks([...payload.blocks].sort((a, b) => a.order_index - b.order_index));
    setRenderBatches(payload.render_batches ? [...payload.render_batches] : []);
  }, []);

  const downloadBlob = React.useCallback((blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.click();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  }, []);

  const { analysis, setAnalysis, analyzing, loadingVoiceChunks, ensureVoiceChunks, runAnalysis } = useChapterAnalysis(chapterId, text);

  const handleGenerate = async (sids: string[]) => {
    const uniqueIds = Array.from(new Set(sids));
    const freshIds = uniqueIds.filter(id => {
        const seg = segments.find(s => s.id === id);
        return !!seg
            && seg.audio_status !== 'processing'
            && !effectivePendingSegmentIds.has(id)
            && !pendingGenerationIdsRef.current.has(id);
    });

    if (freshIds.length === 0) return;

    const requiredVoiceNames = Array.from(new Set(
      freshIds
        .map(id => {
          const seg = segments.find(segment => segment.id === id);
          return (seg?.speaker_profile_name || effectiveSelectedVoice || getDefaultVoiceProfileName(speakerProfiles || []) || '').trim();
        })
        .filter(Boolean)
    ));
    const blockedVoice = requiredVoiceNames
      .map(name => resolveVoiceEngineStatus(name))
      .find(status => !status.enabled);
    if (blockedVoice) {
      setConfirmConfig({
        title: 'Generation Blocked',
        message: blockedVoice.message || 'This voice is unavailable. Enable the engine or choose another voice before generating.',
        onConfirm: () => {},
        confirmText: 'OK'
      });
      return;
    }

    const now = Date.now();
    freshIds.forEach(id => {
      pendingGenerationIdsRef.current.add(id);
      pendingGenerationTimesRef.current.set(id, now);
    });
    setGeneratingSegmentIds(prev => {
        const next = new Set(prev);
        freshIds.forEach(id => next.add(id));
        return next;
    });
    try {
        await api.generateSegments(freshIds, effectiveSelectedVoice || undefined);
    } catch (e) {
        console.error(e);
        setConfirmConfig({
          title: 'Generation Blocked',
          message: e instanceof Error ? e.message : 'This segment could not be queued.',
          onConfirm: () => {},
          confirmText: 'OK'
        });
        freshIds.forEach(id => {
            pendingGenerationIdsRef.current.delete(id);
            pendingGenerationTimesRef.current.delete(id);
        });
        setGeneratingSegmentIds(prev => {
            const next = new Set(prev);
            freshIds.forEach(id => next.delete(id));
            return next;
        });
    }
  };

  const chunkGroups = React.useMemo(() => {
    return buildChunkGroups(segments, characters, effectiveSelectedVoice, speakerProfiles);
  }, [segments, characters, effectiveSelectedVoice, speakerProfiles]);

  const liveSegmentJobIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const chapterJob of chapterJobs) {
      for (const segmentId of chapterJob.segment_ids || []) {
        ids.add(segmentId);
      }
    }
    return ids;
  }, [chapterJobs]);

  const queuedSegmentJobIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const chapterJob of chapterJobs) {
      if (!['queued', 'preparing'].includes(chapterJob.status)) continue;
      for (const segmentId of chapterJob.segment_ids || []) {
        ids.add(segmentId);
      }
    }
    return ids;
  }, [chapterJobs]);

  const effectivePendingSegmentIds = React.useMemo(() => {
    const ids = new Set<string>(generatingSegmentIds);
    for (const segmentId of liveSegmentJobIds) ids.add(segmentId);
    return ids;
  }, [generatingSegmentIds, liveSegmentJobIds]);

  const generatingSegmentJob = React.useMemo(() => {
    return pickRelevantJob(chapterJobs);
  }, [chapterJobs]);

  const { playingSegmentId, playingSegmentIds, playSegment, stopPlayback } = useChapterPlayback(projectId, segments, chunkGroups, effectivePendingSegmentIds, handleGenerate);

  const loadChapter = async (_source: string = 'unknown') => {
    try {
      setScriptViewLoading(true);
      const chapters = await api.fetchChapters(projectId);
      const target = chapters.find(c => c.id === chapterId);
      if (target) {
        setChapter(target);
        setTitle(target.title);
        setText(target.text_content || '');
        setLocalVoice(target.speaker_profile_name || '');
      }
      const [segs, chars, production, scriptView] = await Promise.all([
        api.fetchSegments(chapterId),
        api.fetchCharacters(projectId),
        api.fetchProductionBlocks(chapterId).catch(() => null),
        api.fetchScriptView(chapterId).catch(() => null)
      ]);
      setSegments(segs);
      setCharacters(chars);
      if (scriptView) setScriptViewData(scriptView);
      else setScriptViewData(null);
      if (production?.blocks?.length) {
        syncProductionBlocks(production);
      } else {
        setProductionBaseRevisionId(null);
        setProductionBlocks(buildFallbackProductionBlocks(segs));
        setRenderBatches([]);
      }
      setGeneratingSegmentIds(prev => {
        if (prev.size === 0) return prev;
        const next = new Set(
          Array.from(prev).filter(id => {
            const seg = segs.find((s: any) => s.id === id);
            if (!seg) return false;
            if (seg.audio_status === 'processing') return true;
            if (liveSegmentJobIds.has(id)) return true;
            const pendingAt = pendingGenerationTimesRef.current.get(id) || 0;
            if (pendingGenerationIdsRef.current.has(id) && (Date.now() - pendingAt) < 10000) return true;
            pendingGenerationIdsRef.current.delete(id);
            pendingGenerationTimesRef.current.delete(id);
            return false;
          })
        );
        return next.size === prev.size ? prev : next;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setScriptViewLoading(false);
    }
  };

  useEffect(() => { loadChapter('mount'); }, [chapterId]);

  useEffect(() => {
    if (!chapterUpdate || chapterUpdate.chapterId !== chapterId || chapterUpdate.tick === 0) return;
    void loadChapter('chapter-update');
  }, [chapterUpdate, chapterId]);

  useEffect(() => {
    if (!segmentUpdate || segmentUpdate.chapterId !== chapterId || segmentUpdate.tick === 0) return;
    if (segmentRefreshTimerRef.current) clearTimeout(segmentRefreshTimerRef.current);
    segmentRefreshTimerRef.current = setTimeout(async () => {
        try {
        const [updatedSegments, updatedProduction, updatedScript] = await Promise.all([
          api.fetchSegments(chapterId),
          api.fetchProductionBlocks(chapterId).catch(() => null),
          api.fetchScriptView(chapterId).catch(() => null),
        ]);
        setSegments(updatedSegments);
        if (updatedScript) setScriptViewData(updatedScript);
        if (updatedProduction?.blocks?.length) {
          syncProductionBlocks(updatedProduction);
        } else {
          setProductionBlocks(buildFallbackProductionBlocks(updatedSegments));
          setRenderBatches([]);
          setProductionBaseRevisionId(null);
        }
        setGeneratingSegmentIds(prev => {
          const next = new Set(prev);
          for (const id of prev) {
            const seg = updatedSegments.find((s: any) => s.id === id);
            if (!seg) {
              next.delete(id);
              pendingGenerationIdsRef.current.delete(id);
              pendingGenerationTimesRef.current.delete(id);
              continue;
            }
            if (liveSegmentJobIds.has(id) || seg.audio_status === 'processing') {
              continue;
            }
            const shouldClear = seg.audio_status === 'done'
              || seg.audio_status === 'error'
              || seg.audio_status === 'failed'
              || seg.audio_status === 'cancelled'
              || seg.audio_status === 'unprocessed';
            if (shouldClear) {
              next.delete(id);
              pendingGenerationIdsRef.current.delete(id);
              pendingGenerationTimesRef.current.delete(id);
              continue;
            }
            const pendingAt = pendingGenerationTimesRef.current.get(id) || 0;
            if (pendingGenerationIdsRef.current.has(id) && (Date.now() - pendingAt) < 10000) {
              continue;
            }
          }
          return next.size !== prev.size ? next : prev;
        });
      } catch (e) { console.error("WS refresh failed", e); }
    }, 300);
  }, [segmentUpdate, chapterId, liveSegmentJobIds]);

  useEffect(() => {
    if (chapterJobs.length > 0) return;
    setGeneratingSegmentIds(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(
        Array.from(prev).filter(id => {
          const seg = segments.find(s => s.id === id);
          if (!seg) return false;
          if (seg.audio_status === 'processing') return true;
          if (seg.audio_status === 'done' || seg.audio_status === 'error' || seg.audio_status === 'failed' || seg.audio_status === 'cancelled') {
            pendingGenerationIdsRef.current.delete(id);
            pendingGenerationTimesRef.current.delete(id);
            return false;
          }
          return true;
        })
      );
      return next.size !== prev.size ? next : prev;
    });
  }, [chapterJobs, segments]);

  const handleSave = async (manualTitle?: string, manualText?: string) => {
    if (!chapter) return false;
    const finalTitle = manualTitle !== undefined ? manualTitle : title;
    const finalText = manualText !== undefined ? manualText : text;
    if (finalTitle === chapter.title && finalText === chapter.text_content) return true;

    setSaving(true);
    try {
      const result = await api.updateChapter(chapterId, { title: finalTitle, text_content: finalText });
      if (result.chapter) setChapter(result.chapter);
      if (finalText !== chapter.text_content) {
          const [updatedSegs, updatedProduction, updatedScript] = await Promise.all([
            api.fetchSegments(chapterId),
            api.fetchProductionBlocks(chapterId).catch(() => null),
            api.fetchScriptView(chapterId).catch(() => null)
          ]);
          setSegments(updatedSegs);
          if (updatedScript) setScriptViewData(updatedScript);
          if (updatedProduction?.blocks?.length) {
            syncProductionBlocks(updatedProduction);
          } else {
            setProductionBlocks(buildFallbackProductionBlocks(updatedSegs));
            setRenderBatches([]);
            setProductionBaseRevisionId(null);
          }
          runAnalysis(finalText);
      }
      return true;
    } catch (e) { console.error("Save failed", e); return false; }
    finally { setTimeout(() => setSaving(false), 500); }
  };

  useEffect(() => {
    if (loading) return;
    // Disable auto-save of text while in the Edit tab to allow for explicit Commit workflow with preview
    if (editorTab === 'edit') {
      // Still auto-save title if it changed, but not text
      if (title !== chapter?.title) {
        const timer = setTimeout(() => handleSave(title, chapter?.text_content), 1500);
        return () => clearTimeout(timer);
      }
      return;
    }
    const timer = setTimeout(() => handleSave(title, text), 1500);
    return () => clearTimeout(timer);
  }, [title, text, editorTab]);

  const handleRequestResyncPreview = async () => {
    if (!text || text === chapter?.text_content) return;
    setIsPreviewingResync(true);
    setResyncPreviewData(null);
    try {
      const result = await api.previewSourceTextResync(chapterId, text);
      setResyncPreviewData(result);
    } catch (e) {
      console.error("Preview failed", e);
      setIsPreviewingResync(false);
    }
  };

  const handleConfirmResync = async () => {
    setIsResyncing(true);
    try {
      const success = await handleSave(title, text);
      if (success) {
        setIsPreviewingResync(false);
      }
    } finally {
      setIsResyncing(false);
    }
  };

  const handleUpdateCharacterColor = async (id: string, color: string) => {
    try {
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, color } : c));
      await api.updateCharacter(id, undefined, undefined, undefined, color);
    } catch (e) { console.error("Color update failed", e); loadChapter(); }
  };

  const resolveDefaultVariantName = (characterId: string | null) => {
    if (!characterId || characterId === 'CLEAR_ASSIGNMENT') return null;
    const character = characters.find(c => c.id === characterId);
    if (!character?.speaker_profile_name) return null;
    const speaker = speakers.find(s => s.name === character.speaker_profile_name);
    if (!speaker) return null;
    const variants = (speakerProfiles || []).filter(p => p.speaker_id === speaker.id);
    return getDefaultVoiceProfileName(variants);
  };

  const handleParagraphBulkAssign = async (segmentIds: string[]) => {
    const isClearing = selectedCharacterId === 'CLEAR_ASSIGNMENT';
    const characterId = isClearing ? null : selectedCharacterId;
    const profileName = isClearing ? null : (selectedCharacterId ? (selectedProfileName || resolveDefaultVariantName(selectedCharacterId)) : null);
    
    setSegments(prev => prev.map(s => segmentIds.includes(s.id) ? { 
        ...s, character_id: characterId, speaker_profile_name: profileName, 
        audio_status: isClearing ? s.audio_status : 'unprocessed'
    } : s));

    try {
        await api.updateSegmentsBulk(segmentIds, { 
            character_id: characterId, speaker_profile_name: profileName,
            audio_status: isClearing ? undefined : 'unprocessed'
        });
    } catch (e) { console.error("Bulk assign failed", e); }
  };

  const handleParagraphBulkReset = async (segmentIds: string[]) => {
    setSegments(prev => prev.map(s => segmentIds.includes(s.id) ? { ...s, character_id: null, speaker_profile_name: null } : s));
    try { await api.updateSegmentsBulk(segmentIds, { character_id: null, speaker_profile_name: null }); }
    catch (e) { console.error("Bulk reset failed", e); }
  };

  const [saveConflictError, setSaveConflictError] = React.useState<string | null>(null);

  const saveProductionBlocks = React.useCallback(async (blocks: ProductionBlock[]) => {
    setSaveConflictError(null);
    try {
      const result = await api.updateProductionBlocks(chapterId, {
        base_revision_id: productionBaseRevisionId ?? undefined,
        blocks,
      });
      syncProductionBlocks(result);
      return result;
    } catch (e: any) {
      if (e.status === 409) {
        setSaveConflictError(e.message || "A conflict occurred while saving. The chapter was modified by another process.");
      }
      throw e;
    }
  }, [chapterId, productionBaseRevisionId, syncProductionBlocks]);
  
  const handleScriptAssign = React.useCallback(async (spanIds: string[]) => {
    if (!scriptViewData) return;
    const isClearing = selectedCharacterId === 'CLEAR_ASSIGNMENT';
    const characterId = isClearing ? null : selectedCharacterId;
    const profileName = isClearing ? null : (selectedCharacterId ? (selectedProfileName || resolveDefaultVariantName(selectedCharacterId)) : null);

    // Optimistic update
    setScriptViewData(prev => {
        if (!prev) return prev;
        return {
            ...prev,
            spans: prev.spans.map(s => spanIds.includes(s.id) ? { 
                ...s, character_id: characterId, speaker_profile_name: profileName,
                status: (s.status === 'rendered' && (s.character_id !== characterId || s.speaker_profile_name !== profileName)) ? 'draft' : s.status
            } : s)
        };
    });

    try {
        const result = await api.saveScriptAssignments(chapterId, {
            base_revision_id: scriptViewData.base_revision_id,
            assignments: [{
                span_ids: spanIds,
                character_id: characterId,
                speaker_profile_name: profileName
            }]
        });
        setScriptViewData(result);
        // Also refresh segments to stay in sync for other tabs
        const updatedSegs = await api.fetchSegments(chapterId);
        setSegments(updatedSegs);
    } catch (e: any) {
        console.error("Script assignment failed", e);
        if (e.status === 409) {
             setConfirmConfig({
                title: 'Assignment Conflict',
                message: 'This chapter was modified by another process. Please reload to see the latest changes.',
                onConfirm: () => { setConfirmConfig(null); loadChapter('conflict-reload'); },
                confirmText: 'Reload Now'
             });
        } else {
             // Rollback on other errors
             loadChapter('assignment-error-rollback');
        }
    }
  }, [chapterId, scriptViewData, selectedCharacterId, selectedProfileName, resolveDefaultVariantName, loadChapter]);

  const handleScriptAssignRange = React.useCallback(async (range: ScriptRangeAssignment) => {
    if (!scriptViewData) return;
    const isClearing = selectedCharacterId === 'CLEAR_ASSIGNMENT';
    const characterId = isClearing ? null : selectedCharacterId;
    const profileName = isClearing ? null : (selectedCharacterId ? (selectedProfileName || resolveDefaultVariantName(selectedCharacterId)) : null);

    try {
        const result = await api.saveScriptAssignments(chapterId, {
            base_revision_id: scriptViewData.base_revision_id,
            assignments: [],
            range_assignments: [{
                ...range,
                character_id: characterId,
                speaker_profile_name: profileName
            }]
        });
        setScriptViewData(result);
        const updatedSegs = await api.fetchSegments(chapterId);
        setSegments(updatedSegs);
    } catch (e: any) {
        console.error("Script range assignment failed", e);
        if (e.status === 409) {
             setConfirmConfig({
                title: 'Assignment Conflict',
                message: 'This chapter was modified by another process. Please reload to see the latest changes.',
                onConfirm: () => { setConfirmConfig(null); loadChapter('conflict-reload'); },
                confirmText: 'Reload Now'
             });
        } else {
             loadChapter('assignment-range-error-rollback');
        }
    }
  }, [chapterId, scriptViewData, selectedCharacterId, selectedProfileName, resolveDefaultVariantName, loadChapter]);

  const handleScriptCompact = React.useCallback(async () => {
    if (!scriptViewData) return;
    setCompacting(true);
    try {
      const result = await api.compactScriptView(chapterId, scriptViewData?.base_revision_id || undefined);
      setScriptViewData(result);
      setCompacting(false);
      // Also refresh segments to stay in sync
      const updatedSegs = await api.fetchSegments(chapterId);
      setSegments(updatedSegs);
    } catch (e: any) {
      setCompacting(false);
      console.error("Script compaction failed", e);
      if (e.status === 409) {
        setConfirmConfig({
          title: 'Compaction Conflict',
          message: 'The chapter was modified by another process. Please reload before cleaning up.',
          onConfirm: () => { setConfirmConfig(null); loadChapter('conflict-reload'); },
          confirmText: 'Reload Now'
        });
      } else {
        setConfirmConfig({
          title: 'Compaction Failed',
          message: e instanceof Error ? e.message : 'Could not clean up script spans.',
          onConfirm: () => {},
          confirmText: 'OK'
        });
      }
    } finally {
      setCompacting(false);
    }
  }, [chapterId, scriptViewData, loadChapter]);

  const reloadLatestBlocks = React.useCallback(async (): Promise<ProductionBlocksResponse | null> => {
    setSaveConflictError(null);
    try {
      const result = await api.fetchProductionBlocks(chapterId);
      syncProductionBlocks(result);
      return result;
    } catch (e) {
      console.error("Failed to reload production blocks", e);
      return null;
    }
  }, [chapterId, syncProductionBlocks]);

  const handleExportAudio = React.useCallback(async (format: 'wav' | 'mp3') => {
    setExportingFormat(format);
    try {
      const blob = await api.exportChapterAudio(chapterId, format);
      const safeTitle = (chapter?.title || `chapter-${chapterId}`)
        .trim()
        .replace(/[^\w.-]+/g, '_')
        .replace(/^_+|_+$/g, '') || `chapter-${chapterId}`;
      downloadBlob(blob, `${safeTitle}.${format}`);
    } catch (e) {
      console.error(e);
      setConfirmConfig({
        title: 'Export Failed',
        message: e instanceof Error ? e.message : `Could not save ${format.toUpperCase()} audio.`,
        onConfirm: () => {},
        confirmText: 'OK'
      });
    } finally {
      setExportingFormat(null);
    }
  }, [chapter?.title, chapterId, downloadBlob]);

  const hasRenderedOutput = chapter?.audio_status === 'done' || !!chapter?.audio_file_path || !!chapter?.has_wav || !!chapter?.has_mp3;
  const hasRenderedSegments = segments.some(s => s.audio_status === 'done' || !!s.audio_file_path);
  const hasPartialSegmentProgress = hasRenderedSegments && !hasRenderedOutput;
  const shouldWarnBeforeRequeue = hasRenderedOutput;
  const hasLiveJob = ['queued', 'preparing', 'running', 'finalizing'].includes(job?.status || '');
  const jobLooksPendingCompletion = job?.status === 'done' && !hasRenderedOutput && chapter?.audio_status !== 'processing';
  const needsCompletionRefresh = jobLooksPendingCompletion || (chapter?.audio_status === 'processing' && !hasLiveJob);
  const rawQueueLocked = queuePending || submitting || chapter?.audio_status === 'processing' || hasLiveJob || jobLooksPendingCompletion;
  const [heldQueueLocked, setHeldQueueLocked] = useState(false);
  const queueLockReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anyEnginesEnabled = React.useMemo(() => {
    if (!engines || engines.length === 0) return true;
    return engines.some(e => e.enabled && e.status === 'ready');
  }, [engines]);
  const isQueueLocked = rawQueueLocked || heldQueueLocked || !anyEnginesEnabled;
  const queueVoiceStatus = resolveVoiceEngineStatus(effectiveSelectedVoice || getDefaultVoiceProfileName(speakerProfiles || []));
  const queueButtonLabel = !anyEnginesEnabled
    ? 'Disabled'
    : !queueVoiceStatus.enabled
      ? 'Unavailable'
      : (shouldWarnBeforeRequeue ? 'Rebuild' : hasPartialSegmentProgress ? 'Complete' : 'Queue');
  const queueButtonTitle = !anyEnginesEnabled
    ? 'All TTS engines are disabled in Settings'
    : (queueVoiceStatus.enabled
      ? (shouldWarnBeforeRequeue ? 'Rebuild Chapter' : hasPartialSegmentProgress ? 'Complete Chapter Audio' : 'Queue Chapter')
      : queueVoiceStatus.message || 'Selected voice is unavailable');

  const prevRawQueueLockedRef = useRef(rawQueueLocked);

  useEffect(() => {
    if (chapter?.audio_status === 'processing' || ['queued', 'preparing', 'running', 'finalizing'].includes(job?.status || '') || jobLooksPendingCompletion) {
      setQueuePending(false);
    }
  }, [chapter?.audio_status, job?.status, jobLooksPendingCompletion]);

  useEffect(() => {
    const wasRawQueueLocked = prevRawQueueLockedRef.current;
    prevRawQueueLockedRef.current = rawQueueLocked;

    if (queueLockReleaseTimerRef.current) {
      clearTimeout(queueLockReleaseTimerRef.current);
      queueLockReleaseTimerRef.current = null;
    }

    if (rawQueueLocked) {
      if (!heldQueueLocked) setHeldQueueLocked(true);
      return;
    }

    if (!hasRenderedOutput && wasRawQueueLocked) {
      if (!heldQueueLocked) setHeldQueueLocked(true);
      queueLockReleaseTimerRef.current = setTimeout(() => {
        setHeldQueueLocked(false);
        queueLockReleaseTimerRef.current = null;
      }, 500);
      return;
    }

    if (heldQueueLocked) {
      setHeldQueueLocked(false);
    }
  }, [rawQueueLocked, hasRenderedOutput, heldQueueLocked]);

  useEffect(() => {
    return () => {
      if (queueLockReleaseTimerRef.current) clearTimeout(queueLockReleaseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (completionPollTimerRef.current) {
      clearTimeout(completionPollTimerRef.current);
      completionPollTimerRef.current = null;
    }

    if (!needsCompletionRefresh) {
      completionPollAttemptsRef.current = 0;
      return;
    }

    if (completionPollAttemptsRef.current >= 30) {
      return;
    }

    let cancelled = false;

    const scheduleNextPoll = () => {
      if (cancelled) return;
      if (completionPollAttemptsRef.current >= 30) {
        return;
      }

      completionPollTimerRef.current = setTimeout(async () => {
        completionPollTimerRef.current = null;
        if (cancelled) return;

        completionPollAttemptsRef.current += 1;
        try {
          await loadChapter('completion-refresh');
        } catch (e) {
          console.error("Completion refresh failed", e);
        }

        if (!cancelled) {
          scheduleNextPoll();
        }
      }, 1000);
    };

    scheduleNextPoll();

    return () => {
      cancelled = true;
      if (completionPollTimerRef.current) {
        clearTimeout(completionPollTimerRef.current);
        completionPollTimerRef.current = null;
      }
    };
  }, [needsCompletionRefresh, chapterId, job?.id, job?.status]);

  const executeQueue = async () => {
    const queueVoiceStatus = resolveVoiceEngineStatus(effectiveSelectedVoice || getDefaultVoiceProfileName(speakerProfiles || []));
    if (!queueVoiceStatus.enabled) {
      setConfirmConfig({
        title: 'Queue Blocked',
        message: queueVoiceStatus.message || 'The selected voice is unavailable. Enable the engine or choose an available voice before queueing.',
        onConfirm: () => {},
        confirmText: 'OK'
      });
      return;
    }
    if (queueSyncTimerRef.current) {
      clearTimeout(queueSyncTimerRef.current);
      queueSyncTimerRef.current = null;
    }
    setQueuePending(true);
    setSubmitting(true);
    try {
        setQueueNotice('Queued. Keep this page open to watch progress.');
        await api.addProcessingQueue(projectId, chapterId, 0, effectiveSelectedVoice || undefined);
        await loadChapter('queue-submit');
        queueSyncTimerRef.current = setTimeout(async () => {
          queueSyncTimerRef.current = null;
          try {
            await loadChapter('queue-sync-delay');
          } catch (e) {
            console.error("Delayed queue sync failed", e);
          } finally {
            setQueuePending(false);
          }
        }, 1000);
    } catch (e) {
        setQueuePending(false);
        setQueueNotice(null);
        setConfirmConfig({
          title: 'Queue Blocked',
          message: e instanceof Error ? e.message : 'Failed to queue chapter.',
          onConfirm: () => {},
          confirmText: 'OK'
        });
    } finally { setSubmitting(false); }
  };

  useEffect(() => {
    if (!queueNotice) return;
    const timer = setTimeout(() => setQueueNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [queueNotice]);

  useEffect(() => {
    return () => {
      if (queueSyncTimerRef.current) clearTimeout(queueSyncTimerRef.current);
      if (segmentRefreshTimerRef.current) clearTimeout(segmentRefreshTimerRef.current);
      if (completionPollTimerRef.current) clearTimeout(completionPollTimerRef.current);
    };
  }, []);

  if (loading) return <div style={{ padding: '2rem' }}>Loading editor...</div>;
  if (!chapter) return <div style={{ padding: '2rem' }}>Chapter not found.</div>;

  const hasUnsavedChanges = (title || "").trim() !== (chapter.title || "").trim() || 
                           (text || "").replace(/\r\n/g, '\n') !== (chapter.text_content || "").replace(/\r\n/g, '\n');

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)', position: 'relative', zIndex: 100 }}>
      <ChapterHeader 
        chapter={chapter} title={title} setTitle={setTitle} saving={saving} hasUnsavedChanges={hasUnsavedChanges}
        onPrev={onPrev ? async () => { await handleSave(); onPrev(); } : undefined}
        onNext={onNext ? async () => { await handleSave(); onNext(); } : undefined}
        selectedVoice={chapterVoice} selectedVoiceLabel={selectedVoiceLabel} onVoiceChange={handleVoiceChange} availableVoices={availableVoices} defaultVoiceLabel={chapterDefaultVoiceLabel}
        submitting={submitting} queueLocked={isQueueLocked} queuePending={queuePending} job={job} generatingJob={generatingSegmentJob} generatingSegmentIdsCount={effectivePendingSegmentIds.size}
        queueLabel={queueButtonLabel}
        queueTitle={queueButtonTitle}
        onSaveWav={() => void handleExportAudio('wav')}
        onSaveMp3={() => void handleExportAudio('mp3')}
        exportingFormat={exportingFormat}
        onQueue={() => {
            if (shouldWarnBeforeRequeue) {
                setConfirmConfig({
                    title: 'Requeue Completed Chapter',
                    message: 'All audio for this chapter is already complete. Rebuilding will delete the existing final render and regenerate from the current segments. Continue?',
                    onConfirm: async () => { setConfirmConfig(null); await executeQueue(); },
                    confirmText: 'Yes, Rebuild It',
                    isDestructive: true
                });
            } else if (chapter?.char_count && chapter.char_count > 50000) {
                setConfirmConfig({
                    title: 'Large Chapter Warning',
                    message: `Chapter is long (${chapter.char_count.toLocaleString()} chars). Queue anyway?`,
                    onConfirm: async () => { setConfirmConfig(null); await executeQueue(); },
                    confirmText: 'Yes, Queue It',
                    isDestructive: false
                });
            } else executeQueue();
        }}
        onStopAll={async () => {
            try { await api.cancelChapterGeneration(chapterId); setGeneratingSegmentIds(new Set()); loadChapter('cancel'); }
            catch (e) { console.error("Cancel failed", e); }
        }}
        onCommitSourceText={handleRequestResyncPreview}
        canCommitSourceText={editorTab === 'edit' && sourceTextMode === 'edit' && (text !== chapter?.text_content)}
      />

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <EditorTabs 
                  editorTab={editorTab} setEditorTab={(tab) => {
                    if (tab === 'edit') {
                      setEditorTab('edit');
                      setSourceTextMode('view');
                    } else {
                      setEditorTab(tab);
                      setSourceTextMode('view');
                    }
                  }} onSave={handleSave} 
                  onEnsureVoiceChunks={() => ensureVoiceChunks(handleSave)}
                  onRequestEditSourceText={() => {
                    setConfirmConfig({
                      title: 'Edit Source Text',
                      message: 'Caution: Modifying the source text here will force a complete resynchronization of ALL segments, which may clobber granular assignments and render status if text is shifted. Are you sure you want to proceed?',
                      onConfirm: () => {
                        setConfirmConfig(null);
                        setSourceTextMode('edit');
                      },
                      confirmText: 'Continue to Edit',
                      isDestructive: true
                    });
                  }}
                  analysis={analysis} loadingVoiceChunks={loadingVoiceChunks}
                  sourceTextMode={sourceTextMode}
                />
                
                {editorTab === 'script' && scriptViewData && (
                  <ScriptView
                    data={scriptViewData}
                    characters={characters}
                    engines={engines}
                    speakerProfiles={speakerProfiles}
                    onGenerateBatch={!isQueueLocked ? handleGenerate : undefined}
                    pendingSpanIds={effectivePendingSegmentIds}
                    playingSpanId={playingSegmentId}
                    playingSpanIds={playingSegmentIds}
                    onPlaySpan={(sid) => playSegment(sid, segments.map(s => s.id))}
                    onAssign={handleScriptAssign}
                    onAssignRange={handleScriptAssignRange}
                    activeCharacterId={selectedCharacterId}
                    onCompact={handleScriptCompact}
                    isCompacting={compacting}
                  />
                )}
                {editorTab === 'script' && !scriptViewData && (
                  <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--surface-light)', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                      {scriptViewLoading
                        ? 'Loading script view. The chapter text is shown below so you can keep reading while the richer script layout arrives.'
                        : 'Script view is unavailable right now, so the chapter text is shown below instead.'}
                    </div>
                    <pre style={{
                      margin: 0,
                      padding: '1.25rem',
                      borderRadius: '12px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      fontSize: '1rem',
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                      overflow: 'auto',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                    }}>
                      {chapter?.text_content || text || 'No chapter text available.'}
                    </pre>
                  </div>
                )}
                {editorTab === 'edit' && (
                  <EditTab 
                    text={text} setText={setText} analysis={analysis} setAnalysis={setAnalysis} 
                    analyzing={analyzing} chapter={chapter} segmentsCount={segments.length} 
                    hasUnsavedChanges={hasUnsavedChanges}
                    sourceTextMode={sourceTextMode}
                  />
                )}
                {editorTab === 'performance' && (
                  <PerformanceTab 
                    chunkGroups={chunkGroups} characters={characters} playingSegmentId={playingSegmentId} 
                    playbackQueue={segments.map(s => s.id)} generatingSegmentIds={generatingSegmentIds} queuedSegmentIds={queuedSegmentJobIds}
                    allSegmentIds={segments.map(s => s.id)} segments={segments}
                    onPlay={playSegment} onStop={stopPlayback} onGenerate={handleGenerate}
                    generatingJob={generatingSegmentJob}
                    segmentProgress={segmentProgress}
                  />
                )}
                {editorTab === 'preview' && <PreviewTab analysis={analysis} analyzing={analyzing} />}
                {editorTab === 'production' && (
                  <ProductionTab 
                    chapterId={chapterId}
                    blocks={productionBlocks}
                    renderBatches={renderBatches}
                    baseRevisionId={productionBaseRevisionId}
                    characters={characters}
                    speakerProfiles={speakerProfiles}
                    selectedCharacterId={selectedCharacterId}
                    selectedProfileName={selectedProfileName}
                    hoveredBlockId={hoveredBlockId}
                    setHoveredBlockId={setHoveredBlockId}
                    activeBlockId={activeBlockId}
                    setActiveBlockId={setActiveBlockId}
                    onBulkAssign={handleParagraphBulkAssign}
                    onBulkReset={handleParagraphBulkReset}
                    onSaveBlocks={saveProductionBlocks}
                    onGenerateBatch={handleGenerate}
                    saveConflictError={saveConflictError}
                    onReloadBlocks={reloadLatestBlocks}
                    pendingSegmentIds={effectivePendingSegmentIds}
                    queuedSegmentIds={queuedSegmentJobIds}
                    segments={segments}
                    segmentsCount={segments.length}
                  />
                )}
            </div>
        </div>

        <CharacterSidebar 
            characters={characters} speakers={speakers} speakerProfiles={speakerProfiles}
            selectedCharacterId={selectedCharacterId} setSelectedCharacterId={setSelectedCharacterId}
            selectedProfileName={selectedProfileName} setSelectedProfileName={setSelectedProfileName}
            expandedCharacterId={expandedCharacterId} setExpandedCharacterId={setExpandedCharacterId}
            onUpdateCharacterColor={handleUpdateCharacterColor}
            segmentsCount={segments.length} wordCount={chapter.word_count || 0}
        />
      </div>

      <ConfirmModal
        isOpen={!!confirmConfig}
        title={confirmConfig?.title || ''}
        message={confirmConfig?.message || ''}
        onConfirm={() => { confirmConfig?.onConfirm(); setConfirmConfig(null); }}
        onCancel={() => setConfirmConfig(null)}
        isDestructive={confirmConfig?.isDestructive}
        confirmText={confirmConfig?.confirmText}
      />

      <ResyncPreviewModal
        isOpen={isPreviewingResync}
        data={resyncPreviewData}
        loading={isResyncing || (isPreviewingResync && !resyncPreviewData)}
        onConfirm={handleConfirmResync}
        onCancel={() => setIsPreviewingResync(false)}
      />

      {queueNotice && (
        <div style={{
          position: 'fixed',
          right: '1.5rem',
          bottom: '1.5rem',
          zIndex: 1500,
          background: 'var(--surface)',
          color: 'var(--text-primary)',
          border: '1px solid var(--accent)',
          boxShadow: 'var(--shadow-lg)',
          borderRadius: '14px',
          padding: '0.85rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          maxWidth: '360px'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'var(--accent-tint)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            flexShrink: 0
          }}>
            ✓
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            <span style={{ fontWeight: 700 }}>Queued</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{queueNotice}</span>
          </div>
        </div>
      )}
    </div>
  );
};
