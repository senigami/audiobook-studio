import { useState, useRef, useCallback } from 'react';
import type { 
  Chapter, ChapterSegment, Character, ProductionBlock, 
  ProductionRenderBatch, ScriptViewResponse 
} from '../../types';
import { useChapterAnalysis } from '../useChapterAnalysis';

export const useChapterEditorState = (chapterId: string) => {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localVoice, setLocalVoice] = useState<string>('');
  
  const [segments, setSegments] = useState<ChapterSegment[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [productionBlocks, setProductionBlocks] = useState<ProductionBlock[]>([]);
  const [renderBatches, setRenderBatches] = useState<ProductionRenderBatch[]>([]);
  const [productionBaseRevisionId, setProductionBaseRevisionId] = useState<string | null>(null);
  const [scriptViewData, setScriptViewData] = useState<ScriptViewResponse | null>(null);
  const [scriptViewLoading, setScriptViewLoading] = useState(true);
  
  const [generatingSegmentIds, setGeneratingSegmentIds] = useState<Set<string>>(new Set());
  const pendingGenerationIdsRef = useRef<Set<string>>(new Set());
  const pendingGenerationTimesRef = useRef<Map<string, number>>(new Map());
  const segmentRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionPollAttemptsRef = useRef(0);
  const [saveConflictError, setSaveConflictError] = useState<string | null>(null);

  const { 
    analysis, setAnalysis, analyzing, loadingVoiceChunks, 
    ensureVoiceChunks, runAnalysis 
  } = useChapterAnalysis(chapterId, text);

  const syncProductionBlocks = useCallback((payload: {
    base_revision_id?: string | null;
    blocks: ProductionBlock[];
    render_batches?: ProductionRenderBatch[];
  }) => {
    setProductionBaseRevisionId(payload.base_revision_id ?? null);
    setProductionBlocks([...payload.blocks].sort((a, b) => a.order_index - b.order_index));
    setRenderBatches(payload.render_batches ? [...payload.render_batches] : []);
  }, []);

  return {
    chapter, setChapter,
    title, setTitle,
    text, setText,
    loading, setLoading,
    saving, setSaving,
    submitting, setSubmitting,
    localVoice, setLocalVoice,
    segments, setSegments,
    characters, setCharacters,
    productionBlocks, setProductionBlocks,
    renderBatches, setRenderBatches,
    productionBaseRevisionId, setProductionBaseRevisionId,
    scriptViewData, setScriptViewData,
    scriptViewLoading, setScriptViewLoading,
    generatingSegmentIds, setGeneratingSegmentIds,
    pendingGenerationIdsRef,
    pendingGenerationTimesRef,
    segmentRefreshTimerRef,
    completionPollTimerRef,
    queueSyncTimerRef,
    completionPollAttemptsRef,
    saveConflictError, setSaveConflictError,
    analysis, setAnalysis,
    analyzing, loadingVoiceChunks,
    ensureVoiceChunks, runAnalysis,
    syncProductionBlocks
  };
};

export type ChapterEditorState = ReturnType<typeof useChapterEditorState>;
