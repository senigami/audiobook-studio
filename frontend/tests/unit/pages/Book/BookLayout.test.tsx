import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { BookIndexRedirect, BookLayout } from '@/pages/Book';

vi.mock('@/api', () => ({
  api: {
    fetchProject: vi.fn(),
    fetchChapters: vi.fn(),
    fetchCharacters: vi.fn(),
    fetchProjectAudiobooks: vi.fn(),
    fetchProjectBackups: vi.fn(),
    listVoicesWithMetadata: vi.fn(),
  },
}));

// ChapterTextPanel triggers a fetchChapter call on mount; mock it for routing tests.
vi.mock('@/pages/Book/components/ChapterTextPanel', () => ({
  ChapterTextPanel: () => <section aria-label="Chapter preview" />,
}));

// ChapterTable mock ensures we get a stable anchor without framer-motion/reorder deps.
vi.mock('@/pages/Book/components/ChapterTable', () => ({
  ChapterTable: () => <section aria-label="Manuscript chapters" />,
}));

// CastTool's body is a real port of StudioStage.tsx that pulls in the full
// studio data chain (useStudioChapter/useChapterEditor/useRenderGroups) —
// these routing tests only need the Director's Console shell, not Cast's
// internals (covered by CastTool/CastTool.test.tsx), so stub it.
vi.mock('@/pages/ChapterEditor/components/DirectorsConsole/CastTool', () => ({
  CastTool: {
    id: 'cast',
    label: 'Cast',
    icon: (props: any) => <svg data-testid="cast-icon-stub" {...props} />,
    component: () => <div data-testid="cast-tool-stub">Cast tool</div>,
    shortcut: 'V',
    demoPlaceholder: false,
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
}

function renderBookRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/book/:bookId" element={<BookIndexRedirect />} />
        <Route path="/book/:bookId/:stage" element={<BookLayout />} />
        <Route path="/book/:bookId/chapter/:chapterId" element={<BookLayout />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BookLayout', () => {
  const ensureLocalStorage = () => {
    if (typeof localStorage.clear === 'function') return;
    const store = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
          return store.size;
        },
      },
    });
  };

  beforeEach(() => {
    ensureLocalStorage();
    localStorage.clear();
    vi.mocked(api.fetchProject).mockResolvedValue({
      id: 'book-1',
      name: 'Book One',
      series: null,
      author: null,
      speaker_profile_name: null,
      cover_image_path: null,
      created_at: 1,
      updated_at: 1,
    });
    vi.mocked(api.fetchChapters).mockResolvedValue([]);
    vi.mocked(api.fetchCharacters).mockResolvedValue([]);
    vi.mocked(api.fetchProjectAudiobooks).mockResolvedValue([]);
    vi.mocked(api.fetchProjectBackups).mockResolvedValue([]);
    vi.mocked(api.listVoicesWithMetadata).mockResolvedValue([]);
  });

  afterEach(() => {
    ensureLocalStorage();
    localStorage.clear();
  });

  it('renders the book tabs and contents stage for the current stage', () => {
    renderBookRoute('/book/book-1/contents');

    expect(screen.getByRole('link', { name: 'Book' })).toHaveAttribute('href', '/book/book-1/book');
    expect(screen.getByRole('link', { name: 'Contents' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Cast' })).toHaveAttribute('href', '/book/book-1/cast');
    expect(screen.getByRole('link', { name: 'Publish' })).toHaveAttribute('href', '/book/book-1/publish');
    expect(screen.getByRole('link', { name: 'Backups' })).toHaveAttribute('href', '/book/book-1/backups');
    expect(screen.getByRole('region', { name: 'Contents' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Manuscript chapters' })).toBeInTheDocument();
  });

  it('renders the book info stage when the Book tab is selected', async () => {
    renderBookRoute('/book/book-1/book');

    expect(screen.getByRole('link', { name: 'Book' })).toHaveAttribute('aria-current', 'page');
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Book info' })).toBeInTheDocument();
    });
  });

  it('redirects /book/:bookId to book by default', async () => {
    renderBookRoute('/book/book-1');

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/book');
    });

    expect(screen.getByRole('region', { name: 'Book info' })).toBeInTheDocument();
  });

  it('redirects /book/:bookId to the last visited stage when present', async () => {
    localStorage.setItem('studio.book.book-1.lastStage', 'publish');

    renderBookRoute('/book/book-1');

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/publish');
    });

    expect(screen.getByRole('region', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Book identity' })).toBeInTheDocument();
  });

  it('persists the selected stage when a stage tab is clicked', () => {
    renderBookRoute('/book/book-1/contents');

    fireEvent.click(screen.getByRole('link', { name: 'Cast' }));

    expect(localStorage.getItem('studio.book.book-1.lastStage')).toBe('cast');
  });

  it('redirects invalid stages back to the book index redirect', async () => {
    renderBookRoute('/book/book-1/unknown-stage');

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/book');
    });
  });

  it('hides the tab bar and shows a back-to-contents affordance in the chapter workspace', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue([
      {
        id: 'c1',
        project_id: 'book-1',
        title: 'Chapter One',
        text_content: '',
        speaker_profile_name: null,
        sort_order: 0,
        audio_status: 'unprocessed',
        audio_file_path: null,
        text_last_modified: null,
        audio_generated_at: null,
        char_count: 50,
        word_count: 10,
        sent_count: 2,
        predicted_audio_length: 5,
        audio_length_seconds: 0,
        total_segments_count: 0,
        done_segments_count: 0,
      } as any,
    ]);

    render(
      <MemoryRouter initialEntries={['/book/book-1/chapter/c1']}>
        <LocationProbe />
        <Routes>
          <Route path="/book/:bookId/:stage" element={<BookLayout />} />
          <Route path="/book/:bookId/chapter/:chapterId" element={<BookLayout />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back to Contents' })).toBeInTheDocument();
    });

    // Tab bar must not be visible in the workspace
    expect(screen.queryByRole('navigation', { name: 'Book tabs' })).not.toBeInTheDocument();

    // Director's Console renders as the chapter workspace body
    expect(screen.getByTestId('directors-console')).toBeInTheDocument();

    // Clicking back navigates to /contents
    fireEvent.click(screen.getByRole('button', { name: 'Back to Contents' }));
    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/contents');
    });
  });
});
