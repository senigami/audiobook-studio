/**
 * Tests for the Chapter Workspace surface (Phase 2).
 *
 * Covers:
 * - Director's Console renders as the workspace body.
 * - Chapter-switcher dropdown (Contents ▾) opens and lets you jump to a chapter.
 * - Prev/Next buttons navigate to adjacent chapters.
 * - Back button returns to /contents.
 * - setLastChapter is called on mount so the chapter persists across visits.
 * - Lexicon dockable panel toggle opens/closes the LexiconPanel.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { BookLayout } from '@/pages/Book';

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

// ── Stage stubs — keep workspace tests focused on navigation shell ─────────
vi.mock('@/pages/Book/components/ChapterTextPanel', () => ({
  ChapterTextPanel: () => <section aria-label="Chapter preview" />,
}));

vi.mock('@/pages/Book/components/ChapterTable', () => ({
  ChapterTable: () => <section aria-label="Manuscript chapters" />,
}));

// ── LexiconPanel stub — keep workspace tests focused on toggle behaviour ───
vi.mock('@/pages/Book/components/LexiconPanel', () => ({
  LexiconPanel: ({ projectId }: { projectId: string }) => (
    <div data-testid="lexicon-panel-stub" data-project-id={projectId}>Lexicon panel</div>
  ),
}));

// CastTool's body is a real port of StudioStage.tsx that pulls in the full
// studio data chain (useStudioChapter/useChapterEditor/useRenderGroups) —
// these workspace-navigation tests only need the Director's Console shell,
// not Cast's internals (covered by CastTool/CastTool.test.tsx), so stub it.
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const THREE_CHAPTERS = [
  {
    id: 'c1', project_id: 'book-1', title: 'Chapter One', text_content: '',
    speaker_profile_name: null, sort_order: 0, audio_status: 'unprocessed',
    audio_file_path: null, text_last_modified: null, audio_generated_at: null,
    char_count: 50, word_count: 10, sent_count: 2, predicted_audio_length: 5,
    audio_length_seconds: 0, total_segments_count: 0, done_segments_count: 0,
  },
  {
    id: 'c2', project_id: 'book-1', title: 'Chapter Two', text_content: '',
    speaker_profile_name: null, sort_order: 1, audio_status: 'unprocessed',
    audio_file_path: null, text_last_modified: null, audio_generated_at: null,
    char_count: 60, word_count: 12, sent_count: 3, predicted_audio_length: 6,
    audio_length_seconds: 0, total_segments_count: 0, done_segments_count: 0,
  },
  {
    id: 'c3', project_id: 'book-1', title: 'Chapter Three', text_content: '',
    speaker_profile_name: null, sort_order: 2, audio_status: 'unprocessed',
    audio_file_path: null, text_last_modified: null, audio_generated_at: null,
    char_count: 40, word_count: 8, sent_count: 2, predicted_audio_length: 4,
    audio_length_seconds: 0, total_segments_count: 0, done_segments_count: 0,
  },
] as any[];

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

describe('ChapterWorkspace', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.fetchProject).mockResolvedValue({
      id: 'book-1', name: 'Book One', series: null, author: null,
      speaker_profile_name: null, cover_image_path: null, created_at: 1, updated_at: 1,
    });
    vi.mocked(api.fetchChapters).mockResolvedValue(THREE_CHAPTERS);
    vi.mocked(api.fetchCharacters).mockResolvedValue([]);
    vi.mocked(api.fetchProjectAudiobooks).mockResolvedValue([]);
    vi.mocked(api.fetchProjectBackups).mockResolvedValue([]);
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── Back navigation ─────────────────────────────────────────────────────────
  it('back button navigates to /contents', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c2');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back to Contents' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back to Contents' }));

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/contents');
    });
  });

  // ── Director's Console ──────────────────────────────────────────────────────
  it("Director's Console renders as the workspace body", async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c1');

    await waitFor(() => {
      expect(screen.getByTestId('directors-console')).toBeInTheDocument();
    });
  });

  // ── Embedded read-along reader (synced-reader plan, Task 9) ─────────────────
  it('renders the embedded read-along reader card in the chapter workspace', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c1');

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Read along' })).toBeInTheDocument();
    });
  });

  // ── Chapter title shown in header ───────────────────────────────────────────
  it('shows the chapter title in the workspace header', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c2');

    await waitFor(() => {
      expect(screen.getByText('Chapter Two')).toBeInTheDocument();
    });
  });

  // ── Contents ▾ dropdown switcher ────────────────────────────────────────────
  it('Contents ▾ dropdown lists all chapters and opens on click', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c2');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Switch chapter' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch chapter' }));

    // All three chapters should be listed in the listbox
    expect(screen.getByRole('option', { name: /Chapter One/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Chapter Two/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Chapter Three/i })).toBeInTheDocument();
  });

  it('selecting a chapter from the dropdown navigates to that chapter route', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c2');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Switch chapter' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch chapter' }));
    fireEvent.click(screen.getByRole('option', { name: /Chapter Three/i }));

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/chapter/c3');
    });
  });

  it('persists the chosen chapter in localStorage via setLastChapter', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c2');

    // Wait for chapter data to load and effect to run
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Switch chapter' })).toBeInTheDocument();
    });

    expect(localStorage.getItem('studio.book.book-1.lastChapter')).toBe('c2');
  });

  // ── Prev / Next navigation ──────────────────────────────────────────────────
  it('Previous chapter button is disabled for the first chapter', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Previous chapter' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Previous chapter' })).toBeDisabled();
  });

  it('Next chapter button is disabled for the last chapter', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c3');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Next chapter' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Next chapter' })).toBeDisabled();
  });

  it('clicking Next navigates to the next chapter route', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c1');

    // The Next/Previous buttons render immediately (before chapters have
    // loaded from the mocked async fetchChapters), disabled until the
    // adjacent-chapter id is known. Waiting only for presence races the
    // fetch: clicking a still-disabled button is a silent no-op, and
    // jsdom does not dispatch click on disabled controls. Wait for the
    // settled (enabled) state instead of a longer timeout (R4).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Next chapter' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next chapter' }));

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/chapter/c2');
    });
  });

  it('clicking Previous navigates to the previous chapter route', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c3');

    // See "clicking Next navigates..." above: wait for enabled, not just present.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Previous chapter' })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Previous chapter' }));

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/book/book-1/chapter/c2');
    });
  });

  // ── Lexicon dockable panel toggle ───────────────────────────────────────────

  it('Lexicon panel is hidden by default', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Lexicon/i })).toBeInTheDocument();
    });

    expect(screen.queryByTestId('lexicon-panel-stub')).not.toBeInTheDocument();
  });

  it('clicking Lexicon toggle opens the panel', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Lexicon/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Lexicon/i }));

    expect(screen.getByTestId('lexicon-panel-stub')).toBeInTheDocument();
  });

  it('clicking the panel close button hides the panel', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Lexicon/i })).toBeInTheDocument();
    });

    // Open
    fireEvent.click(screen.getByRole('button', { name: /Lexicon/i }));
    expect(screen.getByTestId('lexicon-panel-stub')).toBeInTheDocument();

    // Close via X button inside the WorkspacePanel
    fireEvent.click(screen.getByRole('button', { name: /Close Lexicon panel/i }));

    expect(screen.queryByTestId('lexicon-panel-stub')).not.toBeInTheDocument();
  });

  it('clicking Lexicon toggle again closes the panel', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Lexicon/i })).toBeInTheDocument();
    });

    // Open then close via the same toggle button
    const toggle = screen.getByRole('button', { name: /Lexicon/i });
    fireEvent.click(toggle);
    expect(screen.getByTestId('lexicon-panel-stub')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByTestId('lexicon-panel-stub')).not.toBeInTheDocument();
  });

  it('LexiconPanel receives the current bookId as projectId', async () => {
    renderWorkspaceRoute('/book/book-1/chapter/c1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Lexicon/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Lexicon/i }));

    expect(screen.getByTestId('lexicon-panel-stub')).toHaveAttribute('data-project-id', 'book-1');
  });
});
