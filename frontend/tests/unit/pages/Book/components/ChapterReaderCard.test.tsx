/**
 * ChapterReaderCard.test.tsx
 *
 * Tests for frontend/src/pages/Book/components/ChapterReaderCard.tsx
 * (synced-reader plan, Task 9 "entry points") — the embedded read-along
 * card. Covers: the chapterAudioUrl gate (a regression here would silently
 * break the reader's sync to `ChapterTable`'s own play button), and the
 * "Open Full Reader" link navigating to the standalone route.
 *
 * Mocks (R2): `@/api` (fetchSegments — network) and `fetch` (the timing
 * route — network). `ReaderContainer`/`ReaderView`/`useReaderSync` are real
 * (this file's unit is the wiring, not those already-tested collaborators).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { ChapterReaderCard } from '@/pages/Book/components/ChapterReaderCard';
import { buildChapterAudioUrl } from '@/pages/Book/lib/chapterAudioUrl';
import { loadAndPlay, resetPlayerBusForTests } from '@/store/playerBus';
import type { Chapter } from '@/types';

vi.mock('@/api', () => ({
  api: {
    fetchSegments: vi.fn(),
  },
}));

const CHAPTER: Chapter = {
  id: 'chapter-card',
  project_id: 'book-card',
  title: 'Chapter Card',
  text_content: '',
  speaker_profile_name: null,
  sort_order: 0,
  audio_status: 'done',
  audio_file_path: 'chapter_card.wav',
  text_last_modified: null,
  audio_generated_at: 1,
  char_count: 100,
  word_count: 20,
  sent_count: 2,
  predicted_audio_length: 10,
  audio_length_seconds: 10,
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
}

function renderCard() {
  return render(
    <MemoryRouter initialEntries={['/book/book-card/chapter/chapter-card']}>
      <LocationProbe />
      <Routes>
        <Route
          path="/book/:bookId/chapter/:chapterId"
          element={<ChapterReaderCard bookId="book-card" chapter={CHAPTER} />}
        />
        <Route path="/book/:bookId/chapter/:chapterId/reader" element={<div>Standalone reader route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ChapterReaderCard', () => {
  beforeEach(() => {
    resetPlayerBusForTests();
    vi.mocked(api.fetchSegments).mockResolvedValue([]);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the embedded ReaderContainer card', async () => {
    renderCard();
    expect(screen.getByRole('region', { name: 'Read along' })).toBeInTheDocument();
    // Embedded state (Task 8): no dialog, an expand control shown.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText(/expand reader/i)).toBeInTheDocument();
    await waitFor(() => expect(api.fetchSegments).toHaveBeenCalled());
  });

  it('shows the idle (not playing) state when the bus is not playing this chapter', async () => {
    renderCard();
    expect(screen.getByTestId('reader-idle')).toBeInTheDocument();
    await waitFor(() => expect(api.fetchSegments).toHaveBeenCalled());
  });

  it("tracks this chapter once the bus plays the EXACT SAME audio URL ChapterTable's play button constructs", async () => {
    const chapterTableUrl = `/api/projects/${CHAPTER.project_id}/chapters/${CHAPTER.id}/assets/audio?filename=${encodeURIComponent(CHAPTER.audio_file_path!)}`;
    // Sanity: this is exactly what buildChapterAudioUrl produces too.
    expect(chapterTableUrl).toBe(buildChapterAudioUrl(CHAPTER));

    renderCard();
    act(() => {
      loadAndPlay({ scope: 'chapter', title: 'Chapter Card', audioUrl: chapterTableUrl });
    });

    // Timing sidecar mocked as unavailable (fetch not-ok) -> "sync unavailable",
    // NOT "not playing" -- proves the gate matched (isTrackingThisChapter true).
    await waitFor(() => {
      expect(screen.getByTestId('reader-unavailable')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('reader-idle')).toBeNull();
  });

  it('the "Open Full Reader" link navigates to the standalone reader route', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /open full reader/i }));
    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-card/chapter/chapter-card/reader');
    });
  });
});
