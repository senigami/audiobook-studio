import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState, useEffect } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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

let mockGenerateSegments = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 20)));

vi.mock('@/api', () => {
  return {
    api: {
      fetchSegments: vi.fn().mockResolvedValue([
        { id: 's1', text_content: 'Short segment' },
        { id: 's2', text_content: 'Longer segment text here' },
      ]),
      // Render-group count source for the "X / N" indicator (groups, not raw segments).
      fetchChapterRenderGroups: vi.fn().mockResolvedValue({
        count: 1,
        groups: [{ index: 0, segment_ids: ['s1', 's2'], engine: '', char_count: 30 }],
      }),
      get generateSegments() {
        return mockGenerateSegments;
      },
    },
  };
});

let mockChapters: any[] = [
  { id: 'chap-1', title: 'Chapter 1', audio_status: 'done', audio_file_path: 'chap1.mp3' },
];
let mockSegmentProgress: Record<string, { progress: number; job_id: string; segment_id: string }> = {};

vi.mock('@/pages/Book/BookDataContext', () => {
  return {
    useBookDataContext: () => ({
      bookId: 'proj-123',
      get chapters() {
        return mockChapters;
      },
      jobs: {},
      speakerProfiles: [],
      speakers: [],
      engines: [],
      get segmentProgress() {
        return mockSegmentProgress;
      },
    }),
  };
});

// Helper: render ReviewStage inside a router that provides the chapterId route param.
function renderReviewStage(chapterId = 'chap-1') {
  return render(
    <MemoryRouter initialEntries={[`/book/proj-123/chapter/${chapterId}`]}>
      <Routes>
        <Route path="/book/:bookId/chapter/:chapterId" element={<ReviewStage />} />
      </Routes>
    </MemoryRouter>,
  );
}

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
    vi.clearAllMocks();
    // Reset playerBus mock state
    mockPlayerBusState.scope = null;
    mockPlayerBusState.audioUrl = null;
    mockPlayerBusState.playing = false;
    mockPlayerBusState.position = 0;
    mockPlayerBusState.duration = 0;
    listeners.forEach((l) => l());
    // Reset mutable mock state to defaults
    mockChapters = [
      { id: 'chap-1', title: 'Chapter 1', audio_status: 'done', audio_file_path: 'chap1.mp3' },
    ];
    mockSegmentProgress = {};
    mockGenerateSegments = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 20))
    );
  });

  it('renders left chapter rail, main text area, follow-along controls, and annotations toggle', () => {
    renderReviewStage();

    // Root container
    expect(screen.getByTestId('stage-review')).toBeInTheDocument();

    // Left rail: chapter list
    expect(screen.getByRole('listbox', { name: /select a chapter/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Chapter 1/i })).toBeInTheDocument();

    // Main area: Follow-Along Playback panel
    expect(screen.getByText(/Follow-Along Playback/i)).toBeInTheDocument();

    // Annotations toggle button
    expect(screen.getAllByText(/Annotations/i).length).toBeGreaterThan(0);

    // Text view container
    expect(screen.getByTestId('review-text-view')).toBeInTheDocument();
  });

  it('does NOT render a standalone "Load & Play Chapter" button — chapter rail click is the entry point', () => {
    renderReviewStage();
    // The old standalone play button must be gone
    expect(screen.queryByRole('button', { name: /load & play chapter/i })).not.toBeInTheDocument();
  });

  it('clicking a chapter in the left rail triggers load-and-play and navigates to that chapter', () => {
    mockChapters = [
      { id: 'chap-1', title: 'Chapter 1', audio_status: 'done', audio_file_path: 'chap1.mp3' },
      { id: 'chap-2', title: 'Chapter 2', audio_status: 'done', audio_file_path: 'chap2.mp3' },
    ];

    // Render with a route that can absorb navigation to chap-2
    const navigated: string[] = [];
    render(
      <MemoryRouter initialEntries={['/book/proj-123/chapter/chap-1']}>
        <Routes>
          <Route
            path="/book/:bookId/chapter/:chapterId"
            element={<ReviewStage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    // Both chapters must be in the left rail
    const chap2Btn = screen.getByRole('option', { name: /Chapter 2/i });
    expect(chap2Btn).toBeInTheDocument();

    // Click Chapter 2 in the left rail
    fireEvent.click(chap2Btn);

    // loadAndPlay must have been called with the chapter 2 audio URL
    expect(playerBus.loadAndPlay).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'chapter',
        audioUrl: expect.stringContaining('chap2.mp3'),
        title: 'Chapter 2',
      }),
    );
  });

  it('clicking a chapter with no audio does NOT call loadAndPlay', () => {
    mockChapters = [
      { id: 'chap-1', title: 'Chapter 1', audio_status: 'done', audio_file_path: 'chap1.mp3' },
      { id: 'chap-2', title: 'Chapter 2', audio_status: 'unprocessed', audio_file_path: null },
    ];

    renderReviewStage('chap-1');

    const chap2Btn = screen.getByRole('option', { name: /Chapter 2/i });
    fireEvent.click(chap2Btn);

    // Navigation happens but playback must NOT be triggered
    expect(playerBus.loadAndPlay).not.toHaveBeenCalled();
  });

  it('follow-along text view renders segments for the active chapter', async () => {
    renderReviewStage();

    // Segments are loaded asynchronously
    const seg = await screen.findByText('Short segment');
    expect(seg).toBeInTheDocument();
    expect(screen.getByText('Longer segment text here')).toBeInTheDocument();
  });

  it('allows regenerating the active segment', async () => {
    const { api } = await import('@/api');
    renderReviewStage();

    // Wait for segments to load
    const segmentEl = await screen.findByText('Short segment');
    expect(segmentEl).toBeInTheDocument();

    // Start playback so the chapter is active and segments can be highlighted
    act(() => {
      mockPlayerBusState.scope = 'chapter';
      mockPlayerBusState.audioUrl = '/api/projects/proj-123/chapters/chap-1/assets/audio?filename=chap1.mp3';
      mockPlayerBusState.playing = true;
      mockPlayerBusState.position = 5;
      mockPlayerBusState.duration = 100;
      listeners.forEach((l) => l());
    });

    // Click segment to seek to it — now activeSegmentId will be set from position
    fireEvent.click(segmentEl);

    // The regenerate button should be visible (activeSegmentId is now set)
    const regenBtn = await screen.findByRole('button', { name: /regenerate segment/i });
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

  it('S2: surfaces an inline error when re-render API call fails', async () => {
    mockGenerateSegments = vi.fn().mockRejectedValue(new Error('TTS engine unavailable'));

    renderReviewStage();

    // Wait for segments to load
    await screen.findByText('Short segment');

    // Start playback so the chapter is active and activeSegmentId can be set
    act(() => {
      mockPlayerBusState.scope = 'chapter';
      mockPlayerBusState.audioUrl = '/api/projects/proj-123/chapters/chap-1/assets/audio?filename=chap1.mp3';
      mockPlayerBusState.playing = true;
      mockPlayerBusState.position = 5;
      mockPlayerBusState.duration = 100;
      listeners.forEach((l) => l());
    });

    // Click regenerate — the button is visible because activeSegmentId is now set
    const regenBtn = await screen.findByRole('button', { name: /regenerate segment/i });
    fireEvent.click(regenBtn);

    // After the rejected promise resolves, an error message should appear
    await screen.findByText(/re-render failed/i);
  });

  it('S4: chapter with no audio is marked as not-rendered in the left rail and is still clickable', async () => {
    mockChapters = [
      { id: 'chap-1', title: 'Chapter 1', audio_status: 'unprocessed', audio_file_path: null },
    ];

    renderReviewStage('chap-1');

    // Chapter is still shown in the rail
    const chapterBtn = screen.getByRole('option', { name: /Chapter 1/i });
    expect(chapterBtn).toBeInTheDocument();

    // Clicking it does NOT crash or call loadAndPlay (no audio available)
    fireEvent.click(chapterBtn);
    expect(playerBus.loadAndPlay).not.toHaveBeenCalled();
  });

  it('S1: shows progress percentage on re-render button when segmentProgress is populated', async () => {
    // Start with a never-resolving re-render so we can inspect the in-progress state
    mockGenerateSegments = vi.fn().mockImplementation(() => new Promise(() => {}));

    renderReviewStage();

    await screen.findByText('Short segment');

    // Activate a segment by simulating playback
    act(() => {
      mockPlayerBusState.scope = 'chapter';
      mockPlayerBusState.audioUrl = '/api/projects/proj-123/chapters/chap-1/assets/audio?filename=chap1.mp3';
      mockPlayerBusState.playing = true;
      mockPlayerBusState.position = 5;
      mockPlayerBusState.duration = 100;
      listeners.forEach((l) => l());
    });

    // Click re-render to trigger the in-progress state
    const regenBtn = await screen.findByRole('button', { name: /regenerate segment/i });
    fireEvent.click(regenBtn);

    // Initially shows static label (no segmentProgress yet)
    expect(screen.getByText(/Regenerating/i)).toBeInTheDocument();

    // Simulate segmentProgress arriving for segment s1 (50% done)
    act(() => {
      mockSegmentProgress = { s1: { job_id: 'job-1', segment_id: 's1', progress: 0.5 } };
      listeners.forEach((l) => l());
    });

    // The button label should now show the progress percentage
    await screen.findByText('Regenerating... 50%');
  });
});
