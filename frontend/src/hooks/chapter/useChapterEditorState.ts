import { useState, useRef } from 'react';
import type {
  Chapter, ChapterSegment, Character, ScriptViewResponse
} from '@/types';
import { useChapterAnalysis } from '@/hooks/useChapterAnalysis';

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
  const [chapterNotFound, setChapterNotFound] = useState(false);

  const {
    analysis, setAnalysis, analyzing, loadingVoiceChunks,
    ensureVoiceChunks, runAnalysis
  } = useChapterAnalysis(chapterId, text);

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
    chapterNotFound, setChapterNotFound,
    analysis, setAnalysis,
    analyzing, loadingVoiceChunks,
    ensureVoiceChunks, runAnalysis
  };
};

export type ChapterEditorState = ReturnType<typeof useChapterEditorState>;
