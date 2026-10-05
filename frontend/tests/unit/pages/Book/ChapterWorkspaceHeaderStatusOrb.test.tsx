/**
 * Task 008 (north_star_screen_parity): the "Contents ▾" chapter-switcher dropdown
 * inside the Chapter Workspace should show each chapter's StatusOrb, matching the
 * status indicator already used in ChapterTable.tsx (INV-3: StatusOrb is the only
 * status indicator — no second/duplicate one should be built).
 *
 * Rendered via full BookLayout (MemoryRouter) so the dropdown is exercised end-to-end.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { BookLayout } from '@/pages/Book';
import { _resetCache } from '@/store/bookmarks';

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

function makeChapter(
  overrides: Partial<{
    id: string;
    title: string;
    sort_order: number;
    audio_status: string;
    total_segments_count: number;
    done_segments_count: number;
    has_wav: boolean;
  }>,
) {
  return {
    id: overrides.id ?? 'c1',
    project_id: 'book-1',
    title: overrides.title ?? 'Chapter',
    text_content: '',
    speaker_profile_name: null,
    sort_order: overrides.sort_order ?? 0,
    audio_status: overrides.audio_status ?? 'unprocessed',
    audio_file_path: null,
    text_last_modified: null,
    audio_generated_at: null,
    char_count: 50,
    word_count: 10,
    sent_count: 2,
    predicted_audio_length: 5,
    audio_length_seconds: 0,
    total_segments_count: overrides.total_segments_count ?? 0,
    done_segments_count: overrides.done_segments_count ?? 0,
    has_wav: overrides.has_wav ?? (overrides.audio_status === 'done'),
  } as any;
}

const CHAPTERS_MIXED = [
  makeChapter({ id: 'ch-done', title: 'Done Chapter', sort_order: 0, audio_status: 'done' }),
  makeChapter({ id: 'ch-partial', title: 'Partial Chapter', sort_order: 1, audio_status: 'processing', total_segments_count: 10, done_segments_count: 5 }),
  makeChapter({ id: 'ch-unrendered', title: 'Unrendered Chapter', sort_order: 2, audio_status: 'unprocessed' }),
];

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
  vi.mocked(api.fetchCharacters).mockResolvedValue([]);
  vi.mocked(api.fetchProjectAudiobooks).mockResolvedValue([]);
  vi.mocked(api.fetchProjectBackups).mockResolvedValue([]);
});

afterEach(() => {
  localStorage.clear();
  _resetCache();
});

describe('Chapter dropdown status orb (task 008)', () => {
  it('shows a StatusOrb (role="img") in every chapter row of the switcher dropdown', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue(CHAPTERS_MIXED);
    renderWorkspaceRoute('/book/book-1/chapter/ch-done');

    const trigger = await screen.findByRole('button', { name: 'Switch chapter' });
    fireEvent.click(trigger);

    const menu = await screen.findByRole('listbox', { name: 'Switch chapter' });
    const rows = within(menu).getAllByRole('option');
    expect(rows).toHaveLength(3);

    rows.forEach((row) => {
      const orb = within(row).getByRole('img');
      expect(orb).toBeInTheDocument();
    });
  });

  it('reflects the done chapter status distinctly from the unrendered one', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue(CHAPTERS_MIXED);
    renderWorkspaceRoute('/book/book-1/chapter/ch-done');

    const trigger = await screen.findByRole('button', { name: 'Switch chapter' });
    fireEvent.click(trigger);

    const menu = await screen.findByRole('listbox', { name: 'Switch chapter' });
    const doneRow = within(menu).getByRole('option', { name: /Done Chapter/ });
    const unrenderedRow = within(menu).getByRole('option', { name: /Unrendered Chapter/ });

    const doneOrb = within(doneRow).getByRole('img');
    const unrenderedOrb = within(unrenderedRow).getByRole('img');

    expect(doneOrb.getAttribute('title')).not.toEqual(unrenderedOrb.getAttribute('title'));
  });
});
