import { useCallback } from 'react';
import { api } from '../../api';
import { buildFallbackProductionBlocks } from '../../utils/chapterEditorHelpers';
import type { ChapterEditorState } from './useChapterEditorState';
import type { ProductionBlock } from '../../types';

export const useChapterPersistence = (
  state: ChapterEditorState,
  chapterId: string,
  loadChapter: (source?: string) => Promise<void>
) => {
  const {
    chapter, setChapter, title, text, runAnalysis,
    setSaving, setSegments, setScriptViewData,
    syncProductionBlocks, setProductionBlocks,
    setRenderBatches, setProductionBaseRevisionId,
    productionBaseRevisionId, setCharacters,
    setSaveConflictError
  } = state;

  const handleSave = useCallback(async (manualTitle?: string, manualText?: string) => {
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
  }, [chapter, chapterId, title, text, runAnalysis, syncProductionBlocks, setChapter, setSaving, setSegments, setScriptViewData, setProductionBlocks, setRenderBatches, setProductionBaseRevisionId]);

  const handleVoiceChange = useCallback(async (voice: string, onError?: (msg: string) => void) => {
      const previousVoice = state.localVoice;
      const previousChapterVoice = chapter?.speaker_profile_name ?? null;
      state.setLocalVoice(voice);
      setChapter(prev => prev ? { ...prev, speaker_profile_name: voice || null } : prev);
      try {
        await api.updateChapter(chapterId, { speaker_profile_name: voice || null });
      } catch (e) {
        console.error(e);
        state.setLocalVoice(previousVoice);
        setChapter(prev => prev ? { ...prev, speaker_profile_name: previousChapterVoice } : prev);
        onError?.(e instanceof Error ? e.message : 'The chapter voice could not be saved.');
      }
  }, [chapter, chapterId, state.localVoice, state.setLocalVoice, setChapter]);

  const saveProductionBlocks = useCallback(async (blocks: ProductionBlock[]) => {
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
      } else {
        throw e;
      }
    }
  }, [chapterId, productionBaseRevisionId, syncProductionBlocks, setSaveConflictError]);

  const handleUpdateCharacterColor = useCallback(async (id: string, color: string) => {
    try {
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, color } : c));
      await api.updateCharacter(id, undefined, undefined, undefined, color);
    } catch (e) { console.error("Color update failed", e); loadChapter('color-refresh'); }
  }, [loadChapter, setCharacters]);

  const reloadLatestBlocks = useCallback(async () => {
    try {
      const result = await api.fetchProductionBlocks(chapterId);
      syncProductionBlocks(result);
      setSaveConflictError(null);
      return result;
    } catch (e) {
      console.error("Failed to reload production blocks", e);
      return null;
    }
  }, [chapterId, syncProductionBlocks, setSaveConflictError]);

  return {
    handleSave,
    handleVoiceChange,
    saveProductionBlocks,
    handleUpdateCharacterColor,
    reloadLatestBlocks
  };
};
