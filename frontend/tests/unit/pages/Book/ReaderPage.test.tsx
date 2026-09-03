/**
 * ReaderPage.test.tsx
 *
 * Tests for frontend/src/pages/Book/ReaderPage.tsx (synced-reader plan, Task 9
 * "entry points") — the standalone full-page reader route
 * `/book/:bookId/chapter/:chapterId/reader`. A lightweight route-rendering
 * test (real `ReaderContainer`, real routing) — not a full e2e.
 *
 * Mocks (R2): `@/api` (fetchChapter, fetchSegments — network) and `fetch`
 * (the timing route — network).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { ReaderPage } from '@/pages/Book/ReaderPage';
import { resetPlayerBusForTests } from '@/store/playerBus';
import type { Chapter } from '@/types';

vi.mock('@/api', () => ({
  api: {
    fetchChapter: vi.fn(),
    fetchSegments: vi.fn(),
  },
}));

const CHAPTER: Chapter = {
  id: 'chapter-page',
  project_id: 'book-page',
  title: 'Chapter Page',
  text_content: '',
  speaker_profile_name: null,
  sort_order: 0,
  audio_status: 'done',
  audio_file_path: 'chapter_page.wav',
  text_last_modified: null,
  audio_generated_at: 1,
  char_count: 100,
  word_count: 20,
  sent_count: 2,
  predicted_audio_length: 10,
  audio_length_seconds: 10,
};

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/book/book-page/chapter/chapter-page/reader']}>
      <Routes>
        <Route path="/book/:bookId/chapter/:chapterId/reader" element={<ReaderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReaderPage (standalone route)', () => {
  beforeEach(() => {
    resetPlayerBusForTests();
    vi.mocked(api.fetchChapter).mockResolvedValue(CHAPTER);
    vi.mocked(api.fetchSegments).mockResolvedValue([]);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the chapter and renders ReaderContainer, starting in the expanded (full-page) display state', async () => {
    renderRoute();

    expect(api.fetchChapter).toHaveBeenCalledWith('chapter-page', 'book-page');

    // startExpanded=true -> the dialog surface is present immediately, no
    // "expand" click needed (unlike the embedded card).
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('reader-idle')).toBeInTheDocument();
  });

  it('renders a back-to-chapter control', async () => {
    renderRoute();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to chapter/i })).toBeInTheDocument();
    });
  });
});
