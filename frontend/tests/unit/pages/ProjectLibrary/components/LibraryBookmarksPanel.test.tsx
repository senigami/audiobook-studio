/**
 * LibraryBookmarksPanel.test.tsx
 *
 * Tests for frontend/src/pages/ProjectLibrary/components/LibraryBookmarksPanel.tsx.
 *
 * Mocks (R2 — boundaries outside the unit): `@/store/bookmarks` (the data
 * source) and `react-router-dom`'s `useNavigate`. The component itself is
 * never mocked.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { LibraryBookmarksPanel } from '@/pages/ProjectLibrary/components/LibraryBookmarksPanel';
import * as bookmarksStore from '@/store/bookmarks';
import type { Project } from '@/types';

vi.mock('@/store/bookmarks', async () => {
  const actual = await vi.importActual<typeof import('@/store/bookmarks')>('@/store/bookmarks');
  return { ...actual, useBookmarks: vi.fn() };
});

const projects: Project[] = [{ id: 'book-1', name: 'Book One' } as Project];

function renderPanel() {
  return render(
    <MemoryRouter>
      <LibraryBookmarksPanel projects={projects} />
    </MemoryRouter>,
  );
}

describe('LibraryBookmarksPanel', () => {
  it('excludes kind: "auto" (continue-listening marker) bookmarks from the visible list and count', () => {
    (bookmarksStore.useBookmarks as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'bm-1', bookId: 'book-1', chapterId: 'ch-1', label: 'A great scene', createdAt: 1, kind: 'user' },
      { id: 'bm-auto', bookId: 'book-1', chapterId: 'ch-7', label: '__auto_resume__', createdAt: 2, kind: 'auto', positionSeconds: 120 },
    ]);

    renderPanel();

    expect(screen.getByText('A great scene')).toBeInTheDocument();
    expect(screen.queryByText('__auto_resume__')).not.toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('treats a bookmark with no kind field as user-visible (back-compat)', () => {
    (bookmarksStore.useBookmarks as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'bm-legacy', bookId: 'book-1', chapterId: 'ch-1', label: 'Legacy bookmark', createdAt: 1 },
    ]);

    renderPanel();

    expect(screen.getByText('Legacy bookmark')).toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });
});
