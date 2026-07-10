import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as playerBus from '@/store/playerBus';
import { useStudioChapter } from '@/pages/Book/studio/useStudioChapter';

// Task 003 — characterize CURRENT (pre-fix) segment-playback behavior through
// the *real* live path: CastTool's onPlaySpan wiring is
// `onPlaySpan={(spanId) => playSegment(spanId, playbackQueue)}` (see
// frontend/src/pages/ChapterEditor/components/DirectorsConsole/CastTool/index.tsx
// ~line 343), where playSegment/playbackQueue come straight out of
// useStudioChapter, which itself composes the real useChapterPlayback hook.
// This test drives useStudioChapter directly (renderHook) rather than
// mounting the full CastTool component tree — the exact call shape reaching
// playSegment is identical either way, and this avoids mocking away anything
// in the actual playback unit under test.
//
// Per this task's testing-standards compliance note, useChapterPlayback and
// the playerBus module are NEVER mocked here (R2) — only the data-fetching
// hook useChapterEditor (a different unit: chapter/segment loading, not
// playback) and other unrelated supporting hooks are mocked, mirroring the
// existing harness in
// frontend/tests/unit/pages/Book/studio/useStudioChapter.test.tsx.

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

const chapterId = 'chapter-1';

// Same AudioGroup-based block-membership fixture as
// frontend/tests/unit/hooks/useChapterPlayback.test.tsx's
// "block-navigation characterization (pre-fix)" describe block: s1+s2 only
// share playback identity via an AudioGroup (span_ids), neither has an
// individual audio_file_path.
const groupedSegments = [
  {
    id: 's1', chapter_id: chapterId, segment_order: 0, text_content: 'One', sanitized_text: 'One',
    character_id: null, speaker_profile_name: null, audio_file_path: null, audio_status: 'unprocessed', audio_generated_at: null,
  },
  {
    id: 's2', chapter_id: chapterId, segment_order: 1, text_content: 'Two', sanitized_text: 'Two',
    character_id: null, speaker_profile_name: null, audio_file_path: null, audio_status: 'unprocessed', audio_generated_at: null,
  },
  {
    id: 's3', chapter_id: chapterId, segment_order: 2, text_content: 'Three', sanitized_text: 'Three',
    character_id: null, speaker_profile_name: null, audio_file_path: 's3.wav', audio_status: 'done', audio_generated_at: null,
  },
] as any;

const audioGroups = [
  { id: 'g1', span_ids: ['s1', 's2'], status: 'rendered', audio_file_path: 'group.wav', asset_url: null, order_index: 0, estimated_work_weight: 1 },
] as any;

vi.mock('@/hooks/useChapterEditor', () => ({
  useChapterEditor: () => ({
    chapter: {
      id: 'chapter-1',
      title: 'Chapter 1',
      text_content: 'One. Two. Three.',
      audio_status: 'unprocessed',
      audio_file_path: null,
      has_wav: false,
      has_mp3: false,
      has_m4a: false,
      char_count: 20,
      word_count: 3,
      done_segments_count: 1,
      total_segments_count: 3,
    },
    title: 'Chapter 1',
    setTitle: vi.fn(),
    text: 'One. Two. Three.',
    setText: vi.fn(),
    loading: false,
    saving: false,
    submitting: false,
    localVoice: '',
    segments: groupedSegments,
    characters: [],
    scriptViewData: {
      chapter_id: chapterId,
      base_revision_id: 'rev-1',
      paragraphs: [],
      spans: [],
      render_batches: [],
      audio_groups: audioGroups,
    },
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

describe('CastTool segment playback — real onPlaySpan path (integration, unmocked playerBus)', () => {
  beforeEach(() => {
    playerBus.resetPlayerBusForTests();
  });

  it('documents PRE-FIX behavior — see task 004/005. This assertion is expected to change when those land. reproduces the restart-in-place bug end-to-end through CastTool\'s real onPlaySpan wiring (playSegment(spanId, playbackQueue)), the real useStudioChapter/useChapterPlayback hooks, and the real playerBus', async () => {
    const { result } = renderHook(() =>
      useStudioChapter({
        chapterId,
        projectId: 'project-1',
        speakerProfiles: [],
        speakers: [],
      }),
    );

    // Mirrors CastTool/index.tsx's exact wiring:
    // onPlaySpan={(spanId) => playSegment(spanId, playbackQueue)}
    await act(async () => {
      await result.current.playSegment('s1', result.current.playbackQueue);
    });

    expect(result.current.playingSegmentId).toBe('s1');
    const firstUrl = playerBus.getSnapshot().audioUrl;
    expect(firstUrl).toContain('group.wav');

    // Simulate the real bus's manual "Next" control (e.g. PlayerBar), which
    // the hook's registered onNext callback responds to.
    act(() => {
      playerBus.notifyNext();
    });

    const secondUrl = playerBus.getSnapshot().audioUrl;

    // Bug (documents PRE-FIX behavior — see task 004/005): the segment id
    // advances to s2 (idx+1, unconditionally), but s2 resolves to the SAME
    // AudioGroup audio_file_path as s1, so the real playerBus reloads the
    // identical clip from position 0 instead of skipping past the block.
    expect(result.current.playingSegmentId).toBe('s2');
    expect(secondUrl).toBe(firstUrl);
  });
});
