import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState, useEffect } from 'react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { BoothTool } from '@/pages/ChapterEditor/components/DirectorsConsole/BoothTool';
import * as playerBus from '@/store/playerBus';

const BoothToolBody = BoothTool.component;

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
let mockFetchSegments = vi.fn().mockResolvedValue([
  { id: 's1', text_content: 'Short segment' },
  { id: 's2', text_content: 'Longer segment text here' },
]);

vi.mock('@/api', () => {
  return {
    api: {
      get fetchSegments() {
        return mockFetchSegments;
      },
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

// Helper: render BoothTool's body inside a router that supplies the ?chapter= param
// the same way ChapterWorkspace's route-sync effect does — BoothTool is zero-prop
// (INV-1) and must resolve chapter context internally via useSearchParams().
function renderBoothTool(chapterId = 'chap-1') {
  return render(
    <MemoryRouter initialEntries={[`/?chapter=${chapterId}`]}>
      <BoothToolBody />
    </MemoryRouter>,
  );
}

describe('BoothTool', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.clearAllMocks();
    mockPlayerBusState.scope = null;
    mockPlayerBusState.audioUrl = null;
    mockPlayerBusState.playing = false;
    mockPlayerBusState.position = 0;
    mockPlayerBusState.duration = 0;
    listeners.forEach((l) => l());
    mockChapters = [
      { id: 'chap-1', title: 'Chapter 1', audio_status: 'done', audio_file_path: 'chap1.mp3' },
    ];
    mockSegmentProgress = {};
    mockGenerateSegments = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 20))
    );
    mockFetchSegments = vi.fn().mockResolvedValue([
      { id: 's1', text_content: 'Short segment' },
      { id: 's2', text_content: 'Longer segment text here' },
    ]);
  });

  it('renders the follow-along panel, annotations toggle, and text view — with no rendered chapter rail', async () => {
    renderBoothTool();

    expect(screen.getByTestId('booth-tool')).toBeInTheDocument();
    expect(screen.getByText(/Follow-Along Playback/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Annotations/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('review-text-view')).toBeInTheDocument();

    // No second chapter switcher: BoothTool must not render its own chapter list —
    // that's ChapterWorkspaceHeader's job.
    expect(screen.queryByRole('listbox', { name: /select a chapter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();

    // Let pending segment-fetch/auto-play effects settle before the test ends.
    await screen.findByText('Short segment');
  });

  it('renders segments for the active chapter', async () => {
    renderBoothTool();

    const seg = await screen.findByText('Short segment');
    expect(seg).toBeInTheDocument();
    expect(screen.getByText('Longer segment text here')).toBeInTheDocument();
  });

  it('automatically starts playback when Booth mode is entered for a chapter with audio', async () => {
    renderBoothTool();

    await screen.findByText('Short segment');

    expect(playerBus.loadAndPlay).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'chapter',
        audioUrl: expect.stringContaining('chap1.mp3'),
        title: 'Chapter 1',
      }),
    );
  });

  it('does NOT start playback automatically for a chapter with no rendered audio', async () => {
    mockChapters = [
      { id: 'chap-1', title: 'Chapter 1', audio_status: 'unprocessed', audio_file_path: null },
    ];

    renderBoothTool();
    await screen.findByText('Short segment');

    expect(playerBus.loadAndPlay).not.toHaveBeenCalled();
  });

  it('clicking a segment calls seekToSegment (seeks the player bus)', async () => {
    renderBoothTool();

    const segmentEl = await screen.findByText('Short segment');

    act(() => {
      mockPlayerBusState.scope = 'chapter';
      mockPlayerBusState.audioUrl = '/api/projects/proj-123/chapters/chap-1/assets/audio?filename=chap1.mp3';
      mockPlayerBusState.playing = true;
      mockPlayerBusState.duration = 100;
      listeners.forEach((l) => l());
    });

    fireEvent.click(segmentEl);

    expect(playerBus.seek).toHaveBeenCalled();
  });

  it('segments are keyboard-reachable: Enter/Space activate the same seek handler as click', async () => {
    renderBoothTool();

    const segmentEl = await screen.findByText('Short segment');
    expect(segmentEl).toHaveAttribute('role', 'button');
    expect(segmentEl).toHaveAttribute('tabIndex', '0');

    act(() => {
      mockPlayerBusState.scope = 'chapter';
      mockPlayerBusState.audioUrl = '/api/projects/proj-123/chapters/chap-1/assets/audio?filename=chap1.mp3';
      mockPlayerBusState.playing = true;
      mockPlayerBusState.duration = 100;
      listeners.forEach((l) => l());
    });

    fireEvent.keyDown(segmentEl, { key: 'Enter' });
    expect(playerBus.seek).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(segmentEl, { key: ' ' });
    expect(playerBus.seek).toHaveBeenCalledTimes(2);

    // Non-activation keys must not trigger a seek.
    fireEvent.keyDown(segmentEl, { key: 'a' });
    expect(playerBus.seek).toHaveBeenCalledTimes(2);
  });

  it('marks the currently active segment with aria-current', async () => {
    renderBoothTool();

    const segmentEl = await screen.findByText('Short segment');

    act(() => {
      mockPlayerBusState.scope = 'chapter';
      mockPlayerBusState.audioUrl = '/api/projects/proj-123/chapters/chap-1/assets/audio?filename=chap1.mp3';
      mockPlayerBusState.playing = true;
      mockPlayerBusState.position = 0;
      mockPlayerBusState.duration = 100;
      listeners.forEach((l) => l());
    });

    await waitFor(() => {
      expect(segmentEl).toHaveAttribute('aria-current', 'true');
    });

    const otherSegmentEl = screen.getByText('Longer segment text here');
    expect(otherSegmentEl).not.toHaveAttribute('aria-current');
  });

  it('clicking the regenerate button calls the re-render handler (api.generateSegments)', async () => {
    const { api } = await import('@/api');
    renderBoothTool();

    const segmentEl = await screen.findByText('Short segment');

    act(() => {
      mockPlayerBusState.scope = 'chapter';
      mockPlayerBusState.audioUrl = '/api/projects/proj-123/chapters/chap-1/assets/audio?filename=chap1.mp3';
      mockPlayerBusState.playing = true;
      mockPlayerBusState.position = 5;
      mockPlayerBusState.duration = 100;
      listeners.forEach((l) => l());
    });

    fireEvent.click(segmentEl);

    const regenBtn = await screen.findByRole('button', { name: /regenerate segment/i });
    expect(regenBtn).toBeInTheDocument();

    fireEvent.click(regenBtn);

    expect(api.generateSegments).toHaveBeenCalledWith(['s1']);
    expect(screen.getByText('Regenerating...')).toBeInTheDocument();
    expect(regenBtn).toBeDisabled();
  });

  it('toggles the Annotations panel open/closed', async () => {
    renderBoothTool();
    await screen.findByText('Short segment');

    // Annotations drawer starts open by default.
    expect(screen.getByText(/Select a segment to add a note/i)).toBeInTheDocument();

    const toggleBtn = screen.getByRole('button', { name: /toggle annotations panel/i });
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(toggleBtn);

    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/Select a segment to add a note/i)).not.toBeInTheDocument();

    fireEvent.click(toggleBtn);

    expect(toggleBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Select a segment to add a note/i)).toBeInTheDocument();
  });

  // Ported from frontend/tests/unit/pages/Book/stages/ReviewStage.test.tsx —
  // S1/S2 regression coverage for the regenerate button's error/progress
  // states, which is unchanged behavior carried over into BoothToolBody
  // (see tasks/007-cleanup-and-green-gate.md).
  it('S2: surfaces an inline error when re-render API call fails', async () => {
    mockGenerateSegments = vi.fn().mockRejectedValue(new Error('TTS engine unavailable'));

    renderBoothTool();

    const segmentEl = await screen.findByText('Short segment');

    act(() => {
      mockPlayerBusState.scope = 'chapter';
      mockPlayerBusState.audioUrl = '/api/projects/proj-123/chapters/chap-1/assets/audio?filename=chap1.mp3';
      mockPlayerBusState.playing = true;
      mockPlayerBusState.position = 5;
      mockPlayerBusState.duration = 100;
      listeners.forEach((l) => l());
    });

    fireEvent.click(segmentEl);

    const regenBtn = await screen.findByRole('button', { name: /regenerate segment/i });
    fireEvent.click(regenBtn);

    await screen.findByText(/re-render failed/i);
  });

  it('S1: shows progress percentage on re-render button when segmentProgress is populated', async () => {
    // Start with a never-resolving re-render so we can inspect the in-progress state
    mockGenerateSegments = vi.fn().mockImplementation(() => new Promise(() => {}));

    renderBoothTool();

    const segmentEl = await screen.findByText('Short segment');

    act(() => {
      mockPlayerBusState.scope = 'chapter';
      mockPlayerBusState.audioUrl = '/api/projects/proj-123/chapters/chap-1/assets/audio?filename=chap1.mp3';
      mockPlayerBusState.playing = true;
      mockPlayerBusState.position = 5;
      mockPlayerBusState.duration = 100;
      listeners.forEach((l) => l());
    });

    fireEvent.click(segmentEl);

    const regenBtn = await screen.findByRole('button', { name: /regenerate segment/i });
    fireEvent.click(regenBtn);

    expect(screen.getByText(/Regenerating/i)).toBeInTheDocument();

    act(() => {
      mockSegmentProgress = { s1: { job_id: 'job-1', segment_id: 's1', progress: 0.5 } };
      listeners.forEach((l) => l());
    });

    await screen.findByText('Regenerating... 50%');
  });

  it('keeps the later chapter\'s segments when an earlier chapter\'s fetch resolves after it (stale-response guard)', async () => {
    const resolvers: Record<string, (value: unknown) => void> = {};
    mockFetchSegments = vi.fn((chapterId: string) => new Promise((resolve) => {
      resolvers[chapterId] = resolve;
    }));
    mockChapters = [
      { id: 'chap-1', title: 'Chapter 1', audio_status: 'unprocessed', audio_file_path: null },
      { id: 'chap-2', title: 'Chapter 2', audio_status: 'unprocessed', audio_file_path: null },
    ];

    function Harness() {
      const [, setSearchParams] = useSearchParams();
      return (
        <>
          <button type="button" onClick={() => setSearchParams({ chapter: 'chap-2' })}>
            go-to-chap-2
          </button>
          <BoothToolBody />
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={['/?chapter=chap-1']}>
        <Harness />
      </MemoryRouter>,
    );

    // Switch to chapter 2 before chapter 1's fetch (issued on mount) resolves.
    fireEvent.click(screen.getByText('go-to-chap-2'));

    await waitFor(() => {
      expect(mockFetchSegments).toHaveBeenCalledWith('chap-2');
    });

    // Resolve the LATER request (chapter 2) first...
    act(() => {
      resolvers['chap-2']([{ id: 's2', text_content: 'Chapter two segment.' }]);
    });

    await screen.findByText('Chapter two segment.');

    // ...then resolve the now-stale EARLIER request (chapter 1) out of order.
    act(() => {
      resolvers['chap-1']([{ id: 's1', text_content: 'Chapter one segment.' }]);
    });

    // The final state must reflect chapter 2 (current), not the stale chapter 1 response.
    await waitFor(() => {
      expect(screen.queryByText('Chapter one segment.')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Chapter two segment.')).toBeInTheDocument();
  });
});
