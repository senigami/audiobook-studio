import { useState, useRef, useEffect } from 'react';
import { api } from '../api';

export function useChapterAnalysis(chapterId: string, text: string) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingVoiceChunks, setLoadingVoiceChunks] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
      const formData = new FormData();
      formData.set('text_content', textContent);
      const res = await fetch('/api/analyze_text', { 
          method: 'POST', 
          body: formData,
          signal: controller.signal
      });
      const data = await res.json();
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

  const ensureVoiceChunks = async (handleSave: () => Promise<boolean>) => {
    if (analysis?.voice_chunks || !chapterId) return;
    setLoadingVoiceChunks(true);
    try {
      await handleSave();
      const data = await api.analyzeChapter(chapterId);
      setAnalysis((prev: any) => ({ ...prev, ...data }));
    } catch (e) {
      console.error("Voice chunk analysis failed", e);
    } finally {
      setLoadingVoiceChunks(false);
    }
  };

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

  return {
    analysis,
    setAnalysis,
    analyzing,
    loadingVoiceChunks,
    ensureVoiceChunks,
    runAnalysis
  };
}
