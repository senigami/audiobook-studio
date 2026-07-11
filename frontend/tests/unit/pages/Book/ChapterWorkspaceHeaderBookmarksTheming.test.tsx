/**
 * The Chapter Workspace header's "Show bookmarks" dropdown used to be a bespoke
 * local component (`BookmarksPanel` in ChapterWorkspaceHeader.tsx) with zero
 * theme CSS defined anywhere — it rendered as an unstyled white box with no
 * dark-mode background at all (found via the North Star Screen Parity plan's
 * task 011 designer visual verification + an independent Fable adversarial
 * review). The fix reuses the shared, already-themed `BookmarkList` component
 * (frontend/src/components/BookmarkList.tsx, styled in
 * frontend/src/theme/components/shared.css) instead — the same component
 * already used by the Contents-tab and library-wide bookmark panels.
 *
 * This test asserts the dropdown renders BookmarkList's themed classes
 * (`.bookmark-list*`), not the old bespoke `.workspace-bookmarks-panel*`
 * classes — it would have failed on the pre-fix code.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { BookLayout } from '@/pages/Book';
import { _resetCache, addBookmark } from '@/store/bookmarks';

vi.mock('@/api', () => ({
  api: {
    fetchProject: vi.fn(),
    fetchChapters: vi.fn(),
    fetchCharacters: vi.fn(),
    fetchProjectAudiobooks: vi.fn(),
    fetchProjectBackups: vi.fn(),
  },
}));

vi.mock('@/pages/Book/components/ChapterTextPanel', () => ({
  ChapterTextPanel: () => <section aria-label="Chapter preview" />,
}));
vi.mock('@/pages/Book/components/ChapterTable', () => ({
  ChapterTable: () => <section aria-label="Manuscript chapters" />,
}));
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

function makeChapter(overrides: Partial<{ id: string; title: string; sort_order: number }>) {
  return {
    id: overrides.id ?? 'c1',
    project_id: 'book-1',
    title: overrides.title ?? 'Chapter',
    text_content: '',
    speaker_profile_name: null,
    sort_order: overrides.sort_order ?? 0,
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
    has_wav: false,
  } as any;
}

const CHAPTERS = [makeChapter({ id: 'ch-1', title: 'Chapter One', sort_order: 0 })];

function renderWorkspaceRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/book/:bookId/:stage" element={<BookLayout />} />
        <Route path="/book/:bookId/chapter/:chapterId" element={<BookLayout />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  _resetCache();

  vi.mocked(api.fetchProject).mockResolvedValue({
    id: 'book-1', name: 'Book One', series: null, author: null,
    speaker_profile_name: null, cover_image_path: null, created_at: 1, updated_at: 1,
  });
  vi.mocked(api.fetchChapters).mockResolvedValue(CHAPTERS);
  vi.mocked(api.fetchCharacters).mockResolvedValue([]);
  vi.mocked(api.fetchProjectAudiobooks).mockResolvedValue([]);
  vi.mocked(api.fetchProjectBackups).mockResolvedValue([]);
});

afterEach(() => {
  localStorage.clear();
  _resetCache();
});

describe('Chapter Workspace bookmarks dropdown theming', () => {
  it('reuses the shared, themed BookmarkList component instead of an unstyled bespoke panel', async () => {
    addBookmark({ bookId: 'book-1', chapterId: 'ch-1', label: 'Chapter One' });
    renderWorkspaceRoute('/book/book-1/chapter/ch-1');

    const trigger = await screen.findByRole('button', { name: 'Show bookmarks' });
    fireEvent.click(trigger);

    const menu = await screen.findByRole('menu', { name: 'Bookmarks' });

    // The old bespoke panel used `.workspace-bookmarks-panel*` classes with no
    // theme CSS behind them — the fix must not resurrect that markup anywhere
    // inside the dropdown.
    expect(menu.innerHTML).not.toContain('workspace-bookmarks-panel');

    // The shared, themed BookmarkList renders `.bookmark-list` + `.bookmark-list__item`.
    expect(menu.querySelector('.bookmark-list')).not.toBeNull();
    const item = within(menu).getByText('Chapter One').closest('.bookmark-list__item');
    expect(item).not.toBeNull();
  });

  it('still supports removing a bookmark via the shared component', async () => {
    addBookmark({ bookId: 'book-1', chapterId: 'ch-1', label: 'Chapter One' });
    renderWorkspaceRoute('/book/book-1/chapter/ch-1');

    const trigger = await screen.findByRole('button', { name: 'Show bookmarks' });
    fireEvent.click(trigger);

    const menu = await screen.findByRole('menu', { name: 'Bookmarks' });
    const removeBtn = within(menu).getByRole('button', { name: /Remove bookmark: Chapter One/ });
    fireEvent.click(removeBtn);

    expect(within(menu).queryByText('Chapter One')).toBeNull();
  });
});
