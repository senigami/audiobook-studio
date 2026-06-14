import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState, useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ReviewStage } from '@/pages/Book/stages/ReviewStage';
import { useReviewPlayback } from '@/pages/Book/stages/ReviewStage/useReviewPlayback';
import * as playerBus from '@/store/playerBus';

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

vi.mock('@/api', () => {
  return {
    api: {
      fetchSegments: vi.fn().mockResolvedValue([
        { id: 's1', text_content: 'Short segment' },
        { id: 's2', text_content: 'Longer segment text here' },
      ]),
      generateSegments: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 20))),
    },
  };
});

vi.mock('@/pages/Book/BookDataContext', () => {
  return {
    useBookDataContext: () => ({
      bookId: 'proj-123',
      chapters: [
        { id: 'chap-1', title: 'Chapter 1', audio_status: 'done', audio_file_path: 'chap1.mp3' },
      ],
      jobs: {},
      speakerProfiles: [],
      speakers: [],
      engines: [],
      segmentProgress: {},
    }),
  };
});

describe('useReviewPlayback hook', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
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
      useReviewPlayback({
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

describe('ReviewStage component', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders sidebars, central text pane, annotations, and control actions', () => {
    render(
      <MemoryRouter>
        <ReviewStage />
      </MemoryRouter>
    );
    
    // Review title or container
    expect(screen.getByTestId('stage-review')).toBeInTheDocument();
    
    // Check controls panel / follow along panel elements
    expect(screen.getByText(/Follow-Along Playback/i)).toBeInTheDocument();
    
    // Check annotations panel
    expect(screen.getAllByText(/Annotations/i).length).toBeGreaterThan(0);
  });

  it('allows regenerating the active segment', async () => {
    const { api } = await import('@/api');
    render(
      <MemoryRouter>
        <ReviewStage />
      </MemoryRouter>
    );

    // Wait for segments to load
    const segmentEl = await screen.findByText('Short segment');
    expect(segmentEl).toBeInTheDocument();

    // Select the segment to make it active
    fireEvent.click(segmentEl);

    // The regenerate button should be visible
    const regenBtn = screen.getByRole('button', { name: /regenerate segment/i });
    expect(regenBtn).toBeInTheDocument();
    expect(regenBtn).not.toBeDisabled();

    // Click it to trigger regeneration
    fireEvent.click(regenBtn);

    // It should call api.generateSegments
    expect(api.generateSegments).toHaveBeenCalledWith(['s1']);

    // Button should show loading/disabled state
    expect(screen.getByText('Regenerating...')).toBeInTheDocument();
    expect(regenBtn).toBeDisabled();

    // After resolution, it should recover
    await screen.findByRole('button', { name: /regenerate segment/i });
  });
});

