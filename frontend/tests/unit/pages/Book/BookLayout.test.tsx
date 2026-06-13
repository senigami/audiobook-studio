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
      </Routes>
    </MemoryRouter>,
  );
}

describe('BookLayout', () => {
  beforeEach(() => {
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
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders the five stage tabs and manuscript content for the current stage', () => {
    renderBookRoute('/book/book-1/manuscript');

    expect(screen.getByRole('link', { name: 'Manuscript' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Casting' })).toHaveAttribute('href', '/book/book-1/casting');
    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute('href', '/book/book-1/studio');
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/book/book-1/review');
    expect(screen.getByRole('link', { name: 'Publish' })).toHaveAttribute('href', '/book/book-1/publish');
    expect(screen.getByRole('region', { name: 'Manuscript' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Manuscript chapters' })).toBeInTheDocument();
  });

  it('redirects /book/:bookId to studio by default', async () => {
    renderBookRoute('/book/book-1');

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/studio');
    });

    expect(screen.getByTestId('stage-studio')).toHaveTextContent('Studio');
  });

  it('redirects /book/:bookId to the last visited stage when present', async () => {
    localStorage.setItem('studio.book.book-1.lastStage', 'publish');

    renderBookRoute('/book/book-1');

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/publish');
    });

    expect(screen.getByRole('region', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Book info' })).toBeInTheDocument();
  });

  it('persists the selected stage when a stage tab is clicked', () => {
    renderBookRoute('/book/book-1/studio');

    fireEvent.click(screen.getByRole('link', { name: 'Casting' }));

    expect(localStorage.getItem('studio.book.book-1.lastStage')).toBe('casting');
  });

  it('redirects invalid stages back to the book index redirect', async () => {
    renderBookRoute('/book/book-1/unknown-stage');

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/studio');
    });
  });
});
