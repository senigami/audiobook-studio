import { useCallback } from 'react';
import { api } from '@/api';
import type { ChapterEditorState } from '@/hooks/chapter/useChapterEditorState';

export const useChapterPersistence = (
  state: ChapterEditorState,
  chapterId: string,
  loadChapter: (source?: string) => Promise<void>
) => {
  const {
    chapter, setChapter, title, text, runAnalysis,
    setSaving, setSegments, setScriptViewData,
    setCharacters
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
          const [updatedSegs, updatedScript] = await Promise.all([
            api.fetchSegments(chapterId),
            api.fetchScriptView(chapterId).catch(() => null)
          ]);
          setSegments(updatedSegs);
          if (updatedScript) setScriptViewData(updatedScript);
          runAnalysis(finalText);
      }
      return true;
    } catch (e) { console.error("Save failed", e); return false; }
    finally { setTimeout(() => setSaving(false), 500); }
  }, [chapter, chapterId, title, text, runAnalysis, setChapter, setSaving, setSegments, setScriptViewData]);

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

  const handleUpdateCharacterColor = useCallback(async (id: string, color: string) => {
    try {
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, color } : c));
      await api.updateCharacter(id, undefined, undefined, undefined, color);
    } catch (e) { console.error("Color update failed", e); loadChapter('color-refresh'); }
  }, [loadChapter, setCharacters]);

  return {
    handleSave,
    handleVoiceChange,
    handleUpdateCharacterColor
  };
};
