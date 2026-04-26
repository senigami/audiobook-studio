import { useEffect } from 'react';
import type { 
  SpeakerProfile, TtsEngine, Job 
} from '../types';
import { useChapterEditorState } from './chapter/useChapterEditorState';
import { useChapterLoader } from './chapter/useChapterLoader';
import { useChapterPersistence } from './chapter/useChapterPersistence';
import { useChapterAssignments } from './chapter/useChapterAssignments';
import { useChapterQueue } from './chapter/useChapterQueue';

export const useChapterEditor = (
  chapterId: string, 
  projectId: string, 
  speakerProfiles: SpeakerProfile[],
  speakers: import('../types').Speaker[],
  engines: TtsEngine[] = [],
  chapterJobs: Job[] = [],
  segmentUpdate?: { chapterId: string; tick: number },
  chapterUpdate?: { chapterId: string; tick: number }
) => {
  // 1. Core State & Refs
  const state = useChapterEditorState(chapterId);

  // 2. Loading & Synchronization logic
  const { loadChapter, liveSegmentJobIds, hasRenderedOutput } = useChapterLoader(
    state,
    chapterId,
    projectId,
    chapterJobs,
    segmentUpdate,
    chapterUpdate
  );

  // 3. Persistence & Metadata actions
  const persistence = useChapterPersistence(
    state,
    chapterId,
    loadChapter
  );

  // 4. Mapping & Assignment actions
  const assignments = useChapterAssignments(
    state,
    chapterId,
    state.characters,
    speakers,
    speakerProfiles,
    loadChapter
  );

  // 5. Job Generation & Queue actions
  const queue = useChapterQueue(
    state,
    projectId,
    chapterId,
    speakerProfiles,
    engines,
    chapterJobs,
    loadChapter,
    liveSegmentJobIds
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (state.queueSyncTimerRef.current) {
          clearTimeout(state.queueSyncTimerRef.current);
      }
    };
  }, [state.queueSyncTimerRef]);

  // Return the stable API expected by ChapterEditor.tsx
  return {
    // State
    chapter: state.chapter, 
    setChapter: state.setChapter,
    title: state.title, 
    setTitle: state.setTitle,
    text: state.text, 
    setText: state.setText,
    loading: state.loading,
    saving: state.saving, 
    setSaving: state.setSaving,
    submitting: state.submitting, 
    setSubmitting: state.setSubmitting,
    localVoice: state.localVoice, 
    setLocalVoice: state.setLocalVoice,
    segments: state.segments, 
    setSegments: state.setSegments,
    characters: state.characters, 
    setCharacters: state.setCharacters,
    productionBlocks: state.productionBlocks, 
    setProductionBlocks: state.setProductionBlocks,
    renderBatches: state.renderBatches, 
    setRenderBatches: state.setRenderBatches,
    productionBaseRevisionId: state.productionBaseRevisionId,
    scriptViewData: state.scriptViewData, 
    setScriptViewData: state.setScriptViewData,
    scriptViewLoading: state.scriptViewLoading,
    generatingSegmentIds: state.generatingSegmentIds, 
    setGeneratingSegmentIds: state.setGeneratingSegmentIds,
    pendingGenerationIdsRef: state.pendingGenerationIdsRef,
    pendingGenerationTimesRef: state.pendingGenerationTimesRef,
    
    // Analysis
    analysis: state.analysis, 
    setAnalysis: state.setAnalysis,
    analyzing: state.analyzing, 
    loadingVoiceChunks: state.loadingVoiceChunks,
    ensureVoiceChunks: state.ensureVoiceChunks, 
    runAnalysis: state.runAnalysis,
    
    // Loading & Sync
    loadChapter,
    syncProductionBlocks: state.syncProductionBlocks,
    generatingSegmentJob: queue.generatingSegmentJob,
    liveSegmentJobIds,
    hasRenderedOutput,
    
    // Actions
    reloadLatestBlocks: persistence.reloadLatestBlocks,
    handleSave: persistence.handleSave,
    handleVoiceChange: persistence.handleVoiceChange,
    saveProductionBlocks: persistence.saveProductionBlocks,
    saveConflictError: state.saveConflictError, 
    setSaveConflictError: state.setSaveConflictError,
    handleUpdateCharacterColor: persistence.handleUpdateCharacterColor,
    
    handleScriptAssign: assignments.handleScriptAssign,
    handleScriptAssignRange: assignments.handleScriptAssignRange,
    handleParagraphBulkAssign: assignments.handleParagraphBulkAssign,
    handleParagraphBulkReset: assignments.handleParagraphBulkReset,
    
    handleGenerate: queue.handleGenerate,
    executeQueue: queue.executeQueue
  };
};
