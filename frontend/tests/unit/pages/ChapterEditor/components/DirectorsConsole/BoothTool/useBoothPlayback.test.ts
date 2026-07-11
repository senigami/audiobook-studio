import { renderHook, act } from '@testing-library/react';
import { useState, useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useBoothPlayback } from '@/pages/ChapterEditor/components/DirectorsConsole/BoothTool/useBoothPlayback';
import * as playerBus from '@/store/playerBus';

// Ported from frontend/tests/unit/pages/Book/stages/ReviewStage.test.tsx's
// "useReviewPlayback hook" describe block. useBoothPlayback is a faithful,
// unchanged-logic rename of useReviewPlayback (see
// design-docs/plans/active/directors_console_activation/tasks/004-booth-tool.md)
// so this hook-level karaoke-highlight-math coverage moves with it rather
// than being dropped when ReviewStage.tsx/its folder are deleted (task 007).

let listeners: Array<() => void> = [];
const mockPlayerBusState = {
  scope: null as any,
  title: '',
  subtitle: undefined as string | undefined,
  audioUrl: null as string | null,
  playing: false,
  position: 0,
  duration: 0,
  queue: { hasPrev: false, hasNext: false },
  requestId: 0,
};

vi.mock('@/store/playerBus', () => {
  return {
    usePlayerBus: () => {
      const [state, setState] = useState(mockPlayerBusState);
      useEffect(() => {
        const handler = () => setState({ ...mockPlayerBusState });
        listeners.push(handler);
        return () => {
          listeners = listeners.filter((l) => l !== handler);
        };
      }, []);
      return state;
    },
    loadAndPlay: vi.fn().mockImplementation((opts) => {
      mockPlayerBusState.scope = opts.scope;
      mockPlayerBusState.title = opts.title;
      mockPlayerBusState.subtitle = opts.subtitle;
      mockPlayerBusState.audioUrl = opts.audioUrl;
      mockPlayerBusState.playing = true;
      mockPlayerBusState.requestId++;
      listeners.forEach((l) => l());
    }),
    play: vi.fn().mockImplementation(() => {
      mockPlayerBusState.playing = true;
      listeners.forEach((l) => l());
    }),
    pause: vi.fn().mockImplementation(() => {
      mockPlayerBusState.playing = false;
      listeners.forEach((l) => l());
    }),
    stop: vi.fn().mockImplementation(() => {
      mockPlayerBusState.scope = null;
      mockPlayerBusState.audioUrl = null;
      mockPlayerBusState.playing = false;
      mockPlayerBusState.position = 0;
      mockPlayerBusState.duration = 0;
      listeners.forEach((l) => l());
    }),
    seek: vi.fn().mockImplementation((pos) => {
      mockPlayerBusState.position = pos;
      listeners.forEach((l) => l());
    }),
    resetPlayerBusForTests: vi.fn(),
  };
});

describe('useBoothPlayback hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayerBusState.scope = null;
    mockPlayerBusState.audioUrl = null;
    mockPlayerBusState.playing = false;
    mockPlayerBusState.position = 0;
    mockPlayerBusState.duration = 100;
    listeners.forEach((l) => l());
  });

  it('maps timestamps proportionally to segments and highlights correctly', () => {
    const segments = [
      { id: 's1', text_content: 'Short segment' },
      { id: 's2', text_content: 'Longer segment text here' },
    ] as any;

    const { result } = renderHook(() =>
      useBoothPlayback({
        chapterId: 'chap-1',
        segments,
      })
    );

    // Simulate play start
    act(() => {
      result.current.playChapter('/api/projects/proj-123/chapters/chap-1/assets/chap1.mp3', 'Chapter 1');
    });

    expect(playerBus.loadAndPlay).toHaveBeenCalled();
    expect(result.current.isCurrentChapterPlaying).toBe(true);

    // At position 10% (s1 has 13 chars, s2 has 24 chars, total = 37. s1 is ~35% of total length)
    act(() => {
      mockPlayerBusState.position = 10;
      mockPlayerBusState.duration = 100;
      listeners.forEach((l) => l());
    });

    expect(result.current.activeSegmentId).toBe('s1');

    // At position 60%
    act(() => {
      mockPlayerBusState.position = 60;
      listeners.forEach((l) => l());
    });

    expect(result.current.activeSegmentId).toBe('s2');
  });
});
