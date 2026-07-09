import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/api';
import { deriveChapterLifecycle } from '@/pages/Book/lib/chapterLifecycle';
import type { ResyncPreviewData } from '@/pages/ChapterEditor/components/ResyncPreviewModal';
import type { Chapter } from '@/types';

type SaveState = 'idle' | 'editing' | 'saving' | 'saved' | 'error';

export function useChapterText(chapter: Chapter | null, onSaved?: () => Promise<void> | void) {
  const [loadedChapter, setLoadedChapter] = useState<Chapter | null>(chapter);
  const [text, setText] = useState(chapter?.text_content || '');
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [previewData, setPreviewData] = useState<ResyncPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  // Refs so the autosave cleanup can flush with the latest values without
  // stale-closure issues.
  const pendingSaveRef = useRef(false);
  const latestTextRef = useRef(text);
  const latestChapterRef = useRef(loadedChapter);

  useEffect(() => {
    let cancelled = false;

    if (!chapter) {
      setLoadedChapter(null);
      setText('');
      setSaveState('idle');
      return;
    }

    setLoadedChapter(chapter);
    setText(chapter.text_content || '');
    setSaveState('idle');
    setLoading(true);
    void api.fetchChapter(chapter.id)
      .then((fullChapter) => {
        if (cancelled) return;
        setLoadedChapter(fullChapter);
        setText(fullChapter.text_content || '');
      })
      .catch((error) => {
        if (!cancelled) console.error('Failed to load chapter text', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chapter?.id]);

  const lifecycle = useMemo(
    () => (loadedChapter ? deriveChapterLifecycle(loadedChapter) : 'Draft'),
    [loadedChapter],
  );
  // Stale/Error chapters already have (or attempted) a production run, so edits
  // must go through the explicit resync flow rather than silently autosaving.
  const isProduced = lifecycle === 'Cast' || lifecycle === 'Rendered' || lifecycle === 'Stale' || lifecycle === 'Error';
  const originalText = loadedChapter?.text_content || '';
  const hasTextChanges = text.replace(/\r\n/g, '\n') !== originalText.replace(/\r\n/g, '\n');

  // Keep refs in sync so the cleanup closure always sees current values.
  useEffect(() => {
    latestTextRef.current = text;
  });
  useEffect(() => {
    latestChapterRef.current = loadedChapter;
  });

  useEffect(() => {
    if (!loadedChapter || isProduced || !hasTextChanges) return;
    setSaveState('editing');
    pendingSaveRef.current = true;
    const timer = setTimeout(async () => {
      pendingSaveRef.current = false;
      setSaveState('saving');
      try {
        const result = await api.updateChapter(loadedChapter.id, { text_content: text });
        setLoadedChapter(result.chapter);
        setSaveState('saved');
        await onSaved?.();
      } catch (error) {
        console.error('Failed to autosave chapter text', error);
        setSaveState('error');
      }
    }, 1500);

    return () => {
      clearTimeout(timer);
      // Flush: if the debounce was cancelled while a save was still pending
      // (e.g. the component unmounts within 1500ms of the last keystroke),
      // fire the save immediately so the edit is not lost.
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        const chapter = latestChapterRef.current;
        const textToSave = latestTextRef.current;
        if (chapter) {
          void api.updateChapter(chapter.id, { text_content: textToSave });
        }
      }
    };
  }, [hasTextChanges, isProduced, loadedChapter, onSaved, text]);

  const requestResyncPreview = async () => {
    if (!loadedChapter || !hasTextChanges) return false;
    setPreviewLoading(true);
    setPreviewData(null);
    try {
      const result = await api.previewSourceTextResync(loadedChapter.id, text);
      setPreviewData(result);
      return true;
    } catch (error) {
      console.error('Preview failed', error);
      return false;
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmResync = async () => {
    if (!loadedChapter) return false;
    setResyncing(true);
    try {
      const result = await api.updateChapter(loadedChapter.id, { text_content: text });
      setLoadedChapter(result.chapter);
      setPreviewData(null);
      setSaveState('saved');
      await onSaved?.();
      return true;
    } catch (error) {
      console.error('Resync save failed', error);
      return false;
    } finally {
      setResyncing(false);
    }
  };

  return {
    chapter: loadedChapter,
    text,
    setText,
    loading,
    lifecycle,
    isProduced,
    saveState,
    hasTextChanges,
    previewData,
    previewLoading,
    resyncing,
    requestResyncPreview,
    confirmResync,
    clearPreview: () => setPreviewData(null),
  };
}
