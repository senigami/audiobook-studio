import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/api', () => ({
  api: {
    previewSourceTextResync: vi.fn(),
    exportChapterAudio: vi.fn(),
    resetChapter: vi.fn(),
    cancelChapterGeneration: vi.fn(),
  },
}));

vi.mock('@/hooks/useDeferredWhileHeld', () => ({
  useDeferredWhileHeld: (value: unknown) => value,
}));

vi.mock('@/hooks/useRenderGroups', () => ({
  useRenderGroups: () => ({ count: 0, firstSpanGroupNumber: 1 }),
}));

vi.mock('@/hooks/useSegmentHandoffQueue', () => ({
  useSegmentHandoffQueue: () => ({
    displayedSegmentId: 'none',
    displayedProgress: 0,
    hasPending: false,
  }),
  getHandoffTransitions: () => [],
  recordExternalHandoffEvent: vi.fn(),
}));


vi.mock('@/hooks/useChapterPlayback', () => ({
  useChapterPlayback: () => ({
    playingSegmentId: null,
    playingSegmentIds: new Set<string>(),
    playSegment: vi.fn(),
    stopPlayback: vi.fn(),
    togglePause: vi.fn(),
    seekTo: vi.fn(),
    isPlaying: false,
    isPaused: false,
    currentTime: 0,
    duration: 0,
    startSkim: vi.fn(),
    stopSkim: vi.fn(),
  }),
}));

vi.mock('@/hooks/useChapterEditor', () => ({
  useChapterEditor: () => ({
    chapter: {
      id: 'chapter-1',
      title: 'Chapter 1',
      text_content: 'One. Two.',
      audio_status: 'unprocessed',
      audio_file_path: null,
      has_wav: false,
      has_mp3: false,
      has_m4a: false,
      char_count: 9,
      word_count: 2,
      done_segments_count: 0,
      total_segments_count: 0,
    },
    title: 'Chapter 1',
    setTitle: vi.fn(),
    text: 'One. Two.',
    setText: vi.fn(),
    loading: false,
    saving: false,
    submitting: false,
    localVoice: '',
    segments: [],
    characters: [],
    scriptViewData: null,
    scriptViewLoading: false,
    generatingSegmentIds: new Set<string>(),
    analysis: null,
    setAnalysis: vi.fn(),
    analyzing: false,
    loadChapter: vi.fn(),
    generatingSegmentJob: null,
    liveSegmentJobIds: new Set<string>(),
    handleSave: vi.fn().mockResolvedValue(true),
    handleVoiceChange: vi.fn(),
    hasRenderedOutput: false,
    handleScriptAssign: vi.fn(),
    handleScriptAssignRange: vi.fn(),
    handleUpdateCharacterColor: vi.fn(),
    handleGenerate: vi.fn(),
    executeQueue: vi.fn(),
  }),
}));

import { useStudioChapter } from '@/pages/Book/studio/useStudioChapter';

describe('useStudioChapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes live state setters for the studio shell', () => {
    const { result } = renderHook(() =>
      useStudioChapter({
        chapterId: 'chapter-1',
        projectId: 'project-1',
        speakerProfiles: [],
        speakers: [],
      }),
    );

    expect(result.current.queueNotice).toBeNull();
    expect(result.current.confirmConfig).toBeNull();
    expect(result.current.exportingFormat).toBeNull();

    act(() => {
      result.current.setQueueNotice('Queued');
      result.current.setConfirmConfig({
        title: 'Confirm',
        message: 'Proceed?',
        onConfirm: vi.fn(),
      });
      result.current.setIsPreviewingResync(true);
      result.current.setIsResyncing(true);
      result.current.setExportingFormat('wav');
    });

    expect(result.current.queueNotice).toBe('Queued');
    expect(result.current.confirmConfig?.title).toBe('Confirm');
    expect(result.current.isPreviewingResync).toBe(true);
    expect(result.current.isResyncing).toBe(true);
    expect(result.current.exportingFormat).toBe('wav');
  });
});
