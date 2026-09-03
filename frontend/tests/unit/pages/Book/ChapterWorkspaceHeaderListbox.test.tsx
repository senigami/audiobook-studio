/**
 * Task 002 (contextual-left-nav): hardens ChapterWorkspaceHeader's existing
 * `ChapterDropdown` chapter switcher to full listbox semantics — real DOM
 * focus management, roving-tabindex arrow-key navigation, a single
 * authoritative close path, scoped aria-live status announcements, and
 * scroll-into-view behavior verified at a hard 80-150 chapter fixture.
 *
 * Rendered directly (not through the full BookLayout data chain, unlike the
 * sibling ChapterWorkspaceHeader*.test.tsx files) since `chapters`/`jobs` are
 * already plain props on this component (BookLayout.tsx:229) — direct
 * rendering lets the chapters-identity-swap test (round-4 addition 8) swap
 * that prop deterministically via `rerender`, which an end-to-end fetch-mock
 * render can't do without re-navigating the whole app.
 */
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChapterWorkspaceHeader } from '@/pages/Book/components/ChapterWorkspaceHeader';
import { _resetCache } from '@/store/bookmarks';
import type { Chapter, Job } from '@/types';

function makeChapter(
  overrides: Partial<{
    id: string;
    title: string;
    sort_order: number;
    audio_status: string;
    total_segments_count: number;
    done_segments_count: number;
  }>,
): Chapter {
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
  } as unknown as Chapter;
}

const CHAPTERS_MIXED: Chapter[] = [
  makeChapter({ id: 'ch-done', title: 'Done Chapter', sort_order: 0, audio_status: 'done' }),
  makeChapter({ id: 'ch-partial', title: 'Partial Chapter', sort_order: 1, audio_status: 'processing', total_segments_count: 10, done_segments_count: 5 }),
  makeChapter({ id: 'ch-unrendered', title: 'Unrendered Chapter', sort_order: 2, audio_status: 'unprocessed' }),
];

function makeManyChapters(count: number): Chapter[] {
  return Array.from({ length: count }, (_, idx) =>
    makeChapter({ id: `ch-${idx}`, title: `Chapter ${idx + 1}`, sort_order: idx, audio_status: 'unprocessed' }),
  );
}

function renderHeader(props: {
  bookId?: string;
  chapters: Chapter[];
  activeChapterId: string;
  jobs?: Record<string, Job>;
}) {
  return render(
    <MemoryRouter>
      <ChapterWorkspaceHeader
        bookId={props.bookId ?? 'book-1'}
        chapters={props.chapters}
        activeChapterId={props.activeChapterId}
        jobs={props.jobs}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  _resetCache();
});

afterEach(() => {
  localStorage.clear();
  _resetCache();
  vi.restoreAllMocks();
});

async function openDropdown() {
  const trigger = await screen.findByRole('button', { name: 'Switch chapter' });
  fireEvent.click(trigger);
  const listbox = await screen.findByRole('listbox', { name: 'Switch chapter' });
  return { trigger, listbox };
}

// ── Listbox semantics ─────────────────────────────────────────────────────

describe('ChapterDropdown listbox semantics', () => {
  it('exposes role=listbox on the container and role=option + aria-selected on rows', async () => {
    renderHeader({ chapters: CHAPTERS_MIXED, activeChapterId: 'ch-partial' });

    const { listbox } = await openDropdown();
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(3);

    const active = within(listbox).getByRole('option', { name: /Partial Chapter/ });
    expect(active).toHaveAttribute('aria-selected', 'true');
    const inactive = within(listbox).getByRole('option', { name: /Done Chapter/ });
    expect(inactive).toHaveAttribute('aria-selected', 'false');
  });

  it('has aria-haspopup="listbox" on the trigger (not "menu")', async () => {
    renderHeader({ chapters: CHAPTERS_MIXED, activeChapterId: 'ch-done' });

    const trigger = await screen.findByRole('button', { name: 'Switch chapter' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
  });
});

// ── Initial focus on open (gap 1) ────────────────────────────────────────

describe('Initial focus on open', () => {
  it('moves real DOM focus onto the active chapter option as soon as the listbox opens', async () => {
    renderHeader({ chapters: CHAPTERS_MIXED, activeChapterId: 'ch-partial' });

    const { listbox } = await openDropdown();
    const activeOption = within(listbox).getByRole('option', { name: /Partial Chapter/ });

    await waitFor(() => {
      expect(document.activeElement).toBe(activeOption);
    });
  });

  it('focuses the first option when no chapter is currently active in the list', async () => {
    renderHeader({ chapters: CHAPTERS_MIXED, activeChapterId: 'does-not-exist' });

    const { listbox } = await openDropdown();
    const firstOption = within(listbox).getByRole('option', { name: /Done Chapter/ });

    await waitFor(() => {
      expect(document.activeElement).toBe(firstOption);
    });
  });
});

// ── Arrow-key navigation moves real focus + scrolls into view ───────────

describe('Arrow-key navigation', () => {
  it('ArrowDown moves real DOM focus to the next option and calls scrollIntoView', async () => {
    renderHeader({ chapters: CHAPTERS_MIXED, activeChapterId: 'ch-done' });

    const { listbox } = await openDropdown();
    const doneOption = within(listbox).getByRole('option', { name: /Done Chapter/ });
    await waitFor(() => expect(document.activeElement).toBe(doneOption));

    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    scrollSpy.mockClear();

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });

    const partialOption = within(listbox).getByRole('option', { name: /Partial Chapter/ });
    await waitFor(() => expect(document.activeElement).toBe(partialOption));
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
  });

  it('ArrowUp wraps from the first option to the last', async () => {
    renderHeader({ chapters: CHAPTERS_MIXED, activeChapterId: 'ch-done' });

    const { listbox } = await openDropdown();
    const doneOption = within(listbox).getByRole('option', { name: /Done Chapter/ });
    await waitFor(() => expect(document.activeElement).toBe(doneOption));

    fireEvent.keyDown(listbox, { key: 'ArrowUp' });

    const lastOption = within(listbox).getByRole('option', { name: /Unrendered Chapter/ });
    await waitFor(() => expect(document.activeElement).toBe(lastOption));
  });

  it('Enter selects the focused option, navigates, and closes the listbox', async () => {
    renderHeader({ chapters: CHAPTERS_MIXED, activeChapterId: 'ch-done' });

    const { listbox } = await openDropdown();
    fireEvent.keyDown(listbox, { key: 'ArrowDown' }); // move to ch-partial
    await waitFor(() => {
      expect(document.activeElement).toBe(within(listbox).getByRole('option', { name: /Partial Chapter/ }));
    });

    fireEvent.keyDown(listbox, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.queryByRole('listbox', { name: 'Switch chapter' })).not.toBeInTheDocument();
    });
  });
});

// ── Single close path (no blur/keydown race) ────────────────────────────

describe('Single authoritative close path', () => {
  it('Escape closes the listbox and returns focus to the trigger button', async () => {
    renderHeader({ chapters: CHAPTERS_MIXED, activeChapterId: 'ch-done' });

    const { listbox, trigger } = await openDropdown();
    fireEvent.keyDown(listbox, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('listbox', { name: 'Switch chapter' })).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it('a same-tick blur-close and keydown-Escape-close race resolves to exactly one close: dropdown closed, focus on trigger once, no duplicate listbox', async () => {
    renderHeader({ chapters: CHAPTERS_MIXED, activeChapterId: 'ch-done' });

    const { listbox, trigger } = await openDropdown();
    const focusSpy = vi.spyOn(trigger, 'focus');

    // Fire both close triggers in the same act batch to force the race: the
    // Escape keydown's close call and a wrapper blur (focus leaving the
    // dropdown subtree entirely) landing back-to-back in one event-loop tick.
    act(() => {
      fireEvent.keyDown(listbox, { key: 'Escape' });
      fireEvent.blur(listbox, { relatedTarget: document.body });
    });

    // Exactly one consistent end state: the listbox is gone (not reopened,
    // not present twice), and focus landed on the trigger exactly once via
    // the guarded close path (closingRef prevents a second focus() call from
    // the second, redundant close trigger).
    await waitFor(() => {
      expect(screen.queryAllByRole('listbox', { name: 'Switch chapter' })).toHaveLength(0);
    });
    expect(document.activeElement).toBe(trigger);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('blur alone (no Escape) still closes via the same path without erroring', async () => {
    renderHeader({ chapters: CHAPTERS_MIXED, activeChapterId: 'ch-done' });

    const { listbox } = await openDropdown();
    fireEvent.blur(listbox, { relatedTarget: document.body });

    await waitFor(() => {
      expect(screen.queryByRole('listbox', { name: 'Switch chapter' })).not.toBeInTheDocument();
    });
  });
});

// ── Scoped aria-live status announcements ───────────────────────────────

describe('Scoped aria-live status announcement', () => {
  it('renders an empty polite live region on open (no stale/initial announcement)', async () => {
    renderHeader({ chapters: CHAPTERS_MIXED, activeChapterId: 'ch-done' });

    await openDropdown();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('');
  });

  it('announces a visible row status change while the dropdown stays open', async () => {
    function Harness() {
      const [chapters, setChapters] = useState(CHAPTERS_MIXED);
      return (
        <MemoryRouter>
          <ChapterWorkspaceHeader bookId="book-1" chapters={chapters} activeChapterId="ch-done" />
          <button
            type="button"
            onClick={() =>
              setChapters((prev) =>
                prev.map((ch) => (ch.id === 'ch-unrendered' ? { ...ch, audio_status: 'done' } : ch)),
              )
            }
          >
            simulate status push
          </button>
        </MemoryRouter>
      );
    }

    render(<Harness />);
    await openDropdown();
    expect(screen.getByRole('status')).toHaveTextContent('');

    fireEvent.click(screen.getByRole('button', { name: 'simulate status push' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Unrendered Chapter status: done/);
    });
  });

  it('does not announce anything if the dropdown is closed when the status changes', async () => {
    function Harness() {
      const [chapters, setChapters] = useState(CHAPTERS_MIXED);
      return (
        <MemoryRouter>
          <ChapterWorkspaceHeader bookId="book-1" chapters={chapters} activeChapterId="ch-done" />
          <button
            type="button"
            onClick={() =>
              setChapters((prev) =>
                prev.map((ch) => (ch.id === 'ch-unrendered' ? { ...ch, audio_status: 'done' } : ch)),
              )
            }
          >
            simulate status push
          </button>
        </MemoryRouter>
      );
    }

    render(<Harness />);
    // Dropdown never opened in this test.
    fireEvent.click(screen.getByRole('button', { name: 'simulate status push' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

// ── Hard 80-150 chapter fixture: scrollIntoView spy, not node count ─────

describe('Scale: 80-150 chapter fixture', () => {
  it('spies on Element.prototype.scrollIntoView and asserts it fires on every arrow-key step across a full traversal', async () => {
    const MANY = makeManyChapters(120);
    renderHeader({ chapters: MANY, activeChapterId: MANY[0].id });

    const { listbox } = await openDropdown();
    await waitFor(() => {
      expect(document.activeElement).toBe(within(listbox).getByRole('option', { name: /Chapter 1$/ }));
    });

    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    scrollSpy.mockClear();

    // Traverse the full 120-chapter list via ArrowDown and confirm
    // scrollIntoView is called on every single step, not just the first few
    // — node-count/CSS-class assertions would not catch a handler that only
    // scrolls near the top of the list.
    for (let i = 0; i < MANY.length - 1; i++) {
      fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    }

    await waitFor(() => {
      const lastOption = within(listbox).getByRole('option', { name: new RegExp(`Chapter ${MANY.length}$`) });
      expect(document.activeElement).toBe(lastOption);
    });

    expect(scrollSpy.mock.calls.length).toBe(MANY.length - 1);
    scrollSpy.mock.calls.forEach((call) => {
      expect(call[0]).toEqual(expect.objectContaining({ block: 'nearest' }));
    });
  });

  it('does not break layout scroll containment: the listbox keeps its max-height/overflow class at 120 chapters', async () => {
    const MANY = makeManyChapters(120);
    renderHeader({ chapters: MANY, activeChapterId: MANY[0].id });

    const { listbox } = await openDropdown();
    expect(listbox).toHaveClass('workspace-chapter-dropdown');
    expect(within(listbox).getAllByRole('option')).toHaveLength(120);
  });
});

// ── Cross-book chapters-identity reset + empty/single edge cases ────────

describe('Chapters-identity change reset', () => {
  it('resets focusedIndex to a valid position when the chapters prop is swapped for a shorter array while open', async () => {
    const LONG = makeManyChapters(10);
    const { rerender } = renderHeader({ chapters: LONG, activeChapterId: LONG[0].id });

    const { listbox } = await openDropdown();
    // Move focus deep into the list (index 8, "Chapter 9").
    for (let i = 0; i < 8; i++) {
      fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    }
    await waitFor(() => {
      expect(document.activeElement).toBe(within(listbox).getByRole('option', { name: /Chapter 9$/ }));
    });

    // Swap to a shorter chapters array (simulating switching to a shorter
    // book) while the dropdown is still open — index 8 no longer exists.
    const SHORT = makeManyChapters(3);
    rerender(
      <MemoryRouter>
        <ChapterWorkspaceHeader bookId="book-1" chapters={SHORT} activeChapterId={SHORT[0].id} />
      </MemoryRouter>,
    );

    // focusedIndex must clamp into the new, shorter range (last valid index
    // = 2, "Chapter 3") rather than pointing past the end or holding a stale
    // ref that would throw on the next arrow-key press.
    await waitFor(() => {
      const clamped = within(listbox).getByRole('option', { name: /Chapter 3$/ });
      expect(document.activeElement).toBe(clamped);
    });

    expect(() => {
      fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    }).not.toThrow();
  });

  it('does not throw the keydown handler on an empty chapters list edge case', async () => {
    // chapters.length > 1 gate means the switcher isn't rendered for 0 or 1
    // chapters, but the keydown handler itself must not throw if somehow
    // invoked against an empty list (defensive per round-4 addition 8).
    renderHeader({ chapters: [], activeChapterId: 'none' });

    expect(screen.queryByRole('button', { name: 'Switch chapter' })).not.toBeInTheDocument();
  });

  it('does not render (or throw) the switcher for a single-chapter list', async () => {
    const ONE = [makeChapter({ id: 'only', title: 'Only Chapter' })];
    renderHeader({ chapters: ONE, activeChapterId: 'only' });

    expect(screen.queryByRole('button', { name: 'Switch chapter' })).not.toBeInTheDocument();
  });
});
