/**
 * Tests for the new Chapter Workspace Header features:
 *   1. Jump-to-next-unrendered chapter
 *   2. Bookmark this chapter + bookmarks panel with navigation and removal
 *
 * Rendered via full BookLayout (MemoryRouter) so navigation is exercised end-to-end.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { BookLayout } from '@/pages/Book';
import { _resetCache } from '@/store/bookmarks';

// _resetCache is imported directly from the store — not from the header component

// ── API mock ──────────────────────────────────────────────────────────────────
vi.mock('@/api', () => ({
  api: {
    fetchProject: vi.fn(),
    fetchChapters: vi.fn(),
    fetchCharacters: vi.fn(),
    fetchProjectAudiobooks: vi.fn(),
    fetchProjectBackups: vi.fn(),
  },
}));

// ── Stage stubs ────────────────────────────────────────────────────────────────
vi.mock('@/pages/Book/components/ChapterTextPanel', () => ({
  ChapterTextPanel: () => <section aria-label="Chapter preview" />,
}));
vi.mock('@/pages/Book/components/ChapterTable', () => ({
  ChapterTable: () => <section aria-label="Manuscript chapters" />,
}));

// CastTool's body is a real port of StudioStage.tsx that pulls in the full
// studio data chain (useStudioChapter/useChapterEditor/useRenderGroups) —
// these header-feature tests only need the Director's Console shell, not
// Cast's internals (covered by CastTool/CastTool.test.tsx), so stub it.
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

// ── Chapter fixtures ───────────────────────────────────────────────────────────

function makeChapter(
  overrides: Partial<{
    id: string;
    title: string;
    sort_order: number;
    audio_status: string;
    total_segments_count: number;
    done_segments_count: number;
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
  } as any;
}

/**
 * Chapters: ch-done is fully rendered (audio_status=done), ch-partial is partially done,
 * ch-unrendered has nothing rendered.
 */
const CHAPTERS_MIXED = [
  makeChapter({ id: 'ch-done', title: 'Done Chapter', sort_order: 0, audio_status: 'done' }),
  makeChapter({ id: 'ch-partial', title: 'Partial Chapter', sort_order: 1, audio_status: 'processing', total_segments_count: 10, done_segments_count: 5 }),
  makeChapter({ id: 'ch-unrendered', title: 'Unrendered Chapter', sort_order: 2, audio_status: 'unprocessed' }),
];

const CHAPTERS_ALL_DONE = [
  makeChapter({ id: 'c1', title: 'Chapter One', sort_order: 0, audio_status: 'done' }),
  makeChapter({ id: 'c2', title: 'Chapter Two', sort_order: 1, audio_status: 'done' }),
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
}

function renderWorkspaceRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/book/:bookId/:stage" element={<BookLayout />} />
        <Route path="/book/:bookId/chapter/:chapterId" element={<BookLayout />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

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

// ── Jump to next unrendered ───────────────────────────────────────────────────

describe('Jump to next unrendered chapter', () => {
  it('button is present in the workspace header', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue(CHAPTERS_MIXED);
    renderWorkspaceRoute('/book/book-1/chapter/ch-done');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Jump to next unrendered chapter' })).toBeInTheDocument();
    });
  });

  it('navigates to the next unrendered chapter after the current one', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue(CHAPTERS_MIXED);
    // Start on ch-done (fully rendered), next unrendered in forward order is ch-partial
    renderWorkspaceRoute('/book/book-1/chapter/ch-done');

    // The button renders (disabled) before chapters have loaded from the
    // mocked async fetchChapters — waiting for mere presence races the
    // fetch, since a click on a still-disabled button is a silent no-op.
    // Wait for the settled (enabled) state instead (R4).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Jump to next unrendered chapter' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Jump to next unrendered chapter' }));

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/chapter/ch-partial');
    });
  });

  it('wraps around to earlier chapters when current is near the end', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue(CHAPTERS_MIXED);
    // Start on ch-unrendered (last). Next unrendered wrapping from ch-unrendered+1 = ch-done? No,
    // ch-done is rendered. So it wraps to ch-partial (index 1).
    renderWorkspaceRoute('/book/book-1/chapter/ch-unrendered');

    // See "navigates to the next unrendered chapter..." above: wait for
    // enabled, not just present — the button renders disabled until
    // fetchChapters resolves (R4).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Jump to next unrendered chapter' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Jump to next unrendered chapter' }));

    // Wrapping from ch-unrendered: next candidates in order are ch-done (rendered, skip),
    // then ch-partial (not rendered -> match).
    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/chapter/ch-partial');
    });
  });

  it('is disabled with "All chapters rendered" title when all chapters are done', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue(CHAPTERS_ALL_DONE);
    renderWorkspaceRoute('/book/book-1/chapter/c1');

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'Jump to next unrendered chapter' });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('title', 'All chapters rendered');
    });
  });

  it('jumps to the first unrendered chapter when current chapter itself is rendered', async () => {
    // Chapters: c1=done, c2=done, c3=unrendered
    const chapters = [
      makeChapter({ id: 'c1', title: 'Chapter One', sort_order: 0, audio_status: 'done' }),
      makeChapter({ id: 'c2', title: 'Chapter Two', sort_order: 1, audio_status: 'done' }),
      makeChapter({ id: 'c3', title: 'Chapter Three', sort_order: 2, audio_status: 'unprocessed' }),
    ];
    vi.mocked(api.fetchChapters).mockResolvedValue(chapters);
    renderWorkspaceRoute('/book/book-1/chapter/c2');

    // See "navigates to the next unrendered chapter..." above: wait for
    // enabled, not just present (R4).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Jump to next unrendered chapter' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Jump to next unrendered chapter' }));

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/chapter/c3');
    });
  });

  it('uses done_segments_count/total_segments_count to determine fully rendered when audio_status is not done', async () => {
    // ch-seg-done has all segments complete but audio_status is 'processing' — treat as rendered
    const chapters = [
      makeChapter({ id: 'ch-seg-done', title: 'Seg Done', sort_order: 0, audio_status: 'processing', total_segments_count: 10, done_segments_count: 10 }),
      makeChapter({ id: 'ch-pending', title: 'Pending', sort_order: 1, audio_status: 'unprocessed' }),
    ];
    vi.mocked(api.fetchChapters).mockResolvedValue(chapters);
    renderWorkspaceRoute('/book/book-1/chapter/ch-seg-done');

    // See "navigates to the next unrendered chapter..." above: wait for
    // enabled, not just present (R4).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Jump to next unrendered chapter' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Jump to next unrendered chapter' }));

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/chapter/ch-pending');
    });
  });
});

// ── Bookmarks ─────────────────────────────────────────────────────────────────

describe('Bookmarks', () => {
  it('"Bookmark this chapter" button is present in the header', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue(CHAPTERS_MIXED);
    renderWorkspaceRoute('/book/book-1/chapter/ch-done');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bookmark this chapter' })).toBeInTheDocument();
    });
  });

  it('clicking "Bookmark this chapter" persists the bookmark and it appears in the panel', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue(CHAPTERS_MIXED);
    renderWorkspaceRoute('/book/book-1/chapter/ch-done');

    // "Bookmark this chapter" is present (and clickable) before chapters
    // have loaded from the mocked async fetchChapters. Unlike the nav
    // buttons it has no disabled state to gate on, so it silently records
    // the wrong label — activeChapter is still unresolved at that point,
    // and handleAddBookmark falls back to the raw chapterId. Wait for the
    // header to show the real title (proof chapters have loaded) before
    // clicking, rather than a longer timeout (R4).
    await waitFor(() => {
      expect(screen.getByText('Done Chapter')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bookmark this chapter' }));

    // Open the bookmarks panel
    fireEvent.click(screen.getByRole('button', { name: 'Show bookmarks' }));

    await waitFor(() => {
      // The bookmark label appears inside the panel's nav button (rendered
      // by the shared, themed BookmarkList component).
      expect(screen.getByRole('button', { name: 'Done Chapter' })).toBeInTheDocument();
    });
  });

  it('bookmarks panel opens and closes via the Show bookmarks button', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue(CHAPTERS_MIXED);
    renderWorkspaceRoute('/book/book-1/chapter/ch-done');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show bookmarks' })).toBeInTheDocument();
    });

    // Initially closed — no panel
    expect(screen.queryByRole('menu', { name: 'Bookmarks' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show bookmarks' }));
    expect(screen.getByRole('menu', { name: 'Bookmarks' })).toBeInTheDocument();
  });

  it('clicking a bookmark in the panel navigates to the correct chapter route', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue(CHAPTERS_MIXED);
    renderWorkspaceRoute('/book/book-1/chapter/ch-done');

    // See "clicking Bookmark this chapter persists..." above: wait for
    // chapters to have actually loaded (real title, not the raw id) before
    // the first click — both the bookmark label and the enabled state of
    // Next chapter below depend on it (R4).
    await waitFor(() => {
      expect(screen.getByText('Done Chapter')).toBeInTheDocument();
    });

    // Bookmark ch-done
    fireEvent.click(screen.getByRole('button', { name: 'Bookmark this chapter' }));

    // Navigate to a different chapter
    fireEvent.click(screen.getByRole('button', { name: 'Next chapter' }));
    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/chapter/ch-partial');
    });

    // Open bookmarks and navigate back
    fireEvent.click(screen.getByRole('button', { name: 'Show bookmarks' }));
    await waitFor(() => {
      expect(screen.getByRole('menu', { name: 'Bookmarks' })).toBeInTheDocument();
    });

    const menu = screen.getByRole('menu', { name: 'Bookmarks' });
    fireEvent.click(within(menu).getByRole('button', { name: 'Done Chapter' }));

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/chapter/ch-done');
    });
  });

  it('removing a bookmark via the remove button removes it from the panel', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue(CHAPTERS_MIXED);
    renderWorkspaceRoute('/book/book-1/chapter/ch-done');

    // See "clicking Bookmark this chapter persists..." above: wait for the
    // real title (chapters loaded) before clicking (R4).
    await waitFor(() => {
      expect(screen.getByText('Done Chapter')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bookmark this chapter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show bookmarks' }));

    await waitFor(() => {
      const menu = screen.getByRole('menu', { name: 'Bookmarks' });
      expect(within(menu).getByRole('button', { name: 'Done Chapter' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove bookmark: Done Chapter' }));

    await waitFor(() => {
      const menu = screen.getByRole('menu', { name: 'Bookmarks' });
      expect(within(menu).queryByRole('button', { name: 'Done Chapter' })).not.toBeInTheDocument();
    });
  });

  it('shows "No bookmarks yet" when the bookmarks list is empty', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue(CHAPTERS_MIXED);
    renderWorkspaceRoute('/book/book-1/chapter/ch-done');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show bookmarks' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Show bookmarks' }));

    await waitFor(() => {
      expect(screen.getByText('No bookmarks yet')).toBeInTheDocument();
    });
  });
});
