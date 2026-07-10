import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { ReviseTool } from '@/pages/ChapterEditor/components/DirectorsConsole/ReviseTool';

const ReviseToolBody = ReviseTool.component;

let mockUpdateSegment = vi.fn().mockResolvedValue({ status: 'ok' });
let mockGenerateSegments = vi.fn().mockResolvedValue({ success: true });
let mockFetchSegments = vi.fn();

// R2 mock-boundary rule: mock the network calls (the API layer), not
// SegmentSplitter's own logic — SegmentSplitter is exercised for real via
// its own unit tests (SegmentSplitter.test.ts) and, indirectly, via the
// real (unmocked) import in ReviseTool's commit handler.
vi.mock('@/api', () => {
  return {
    api: {
      get fetchSegments() {
        return mockFetchSegments;
      },
      get updateSegment() {
        return mockUpdateSegment;
      },
      get generateSegments() {
        return mockGenerateSegments;
      },
    },
  };
});

let mockChapters: any[] = [
  { id: 'chap-1', title: 'Chapter 1' },
];

vi.mock('@/pages/Book/BookDataContext', () => {
  return {
    useBookDataContext: () => ({
      bookId: 'proj-123',
      get chapters() {
        return mockChapters;
      },
    }),
  };
});

const mockSetDirty = vi.fn();

vi.mock('@/pages/ChapterEditor/components/DirectorsConsole/DirtyGuardContext', () => ({
  useDirtyGuard: () => ({ setDirty: mockSetDirty }),
}));

function renderReviseTool(chapterId = 'chap-1') {
  return render(
    <MemoryRouter initialEntries={[`/?chapter=${chapterId}`]}>
      <ReviseToolBody />
    </MemoryRouter>,
  );
}

describe('ReviseTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChapters = [{ id: 'chap-1', title: 'Chapter 1' }];
    mockFetchSegments = vi.fn().mockResolvedValue([
      { id: 's1', chapter_id: 'chap-1', segment_order: 0, text_content: 'The first segment.', character_id: null, speaker_profile_name: null, audio_file_path: null, audio_status: 'done', audio_generated_at: null },
      { id: 's2', chapter_id: 'chap-1', segment_order: 1, text_content: 'The second segment.', character_id: null, speaker_profile_name: null, audio_file_path: null, audio_status: 'done', audio_generated_at: null },
    ]);
    mockUpdateSegment = vi.fn().mockResolvedValue({ status: 'ok' });
    mockGenerateSegments = vi.fn().mockResolvedValue({ success: true });
  });

  it('registers with the id/label expected by the tool registry', () => {
    expect(ReviseTool.id).toBe('revise');
    expect(ReviseTool.label).toBe('Revise');
    expect(ReviseTool.demoPlaceholder).toBe(false);
  });

  it('renders segments for the active chapter, read-only by default', async () => {
    renderReviseTool();

    expect(await screen.findByText('The first segment.')).toBeInTheDocument();
    expect(screen.getByText('The second segment.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('clicking a segment shows an inline textarea for only that segment', async () => {
    renderReviseTool();

    const segmentEl = await screen.findByText('The first segment.');
    fireEvent.click(segmentEl.closest('[role="button"]')!);

    const textarea = await screen.findByRole('textbox', { name: /edit segment text/i });
    expect(textarea).toHaveValue('The first segment.');

    // The other segment stays read-only text, not editable.
    expect(screen.getByText('The second segment.')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    // The "editing" banner is shown while editing.
    expect(screen.getByRole('status')).toHaveTextContent(/editing.*save to re-render this section/i);
  });

  it('commit calls updateSegment then generateSegments for the edited segment only, and clears edit state', async () => {
    renderReviseTool();

    const segmentEl = await screen.findByText('The first segment.');
    fireEvent.click(segmentEl.closest('[role="button"]')!);

    const textarea = await screen.findByRole('textbox', { name: /edit segment text/i });
    fireEvent.change(textarea, { target: { value: 'The first segment, revised.' } });

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockUpdateSegment).toHaveBeenCalledWith('s1', {
        text_content: 'The first segment, revised.',
        audio_status: 'unprocessed',
      });
    });
    expect(mockGenerateSegments).toHaveBeenCalledWith(['s1']);

    // updateSegment must resolve before generateSegments fires (commit order).
    const updateOrder = mockUpdateSegment.mock.invocationCallOrder[0];
    const generateOrder = mockGenerateSegments.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(generateOrder);

    // Edit state clears back to read-only display of the new text.
    expect(await screen.findByText('The first segment, revised.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('cancel discards the draft without calling the API', async () => {
    renderReviseTool();

    const segmentEl = await screen.findByText('The first segment.');
    fireEvent.click(segmentEl.closest('[role="button"]')!);

    const textarea = await screen.findByRole('textbox', { name: /edit segment text/i });
    fireEvent.change(textarea, { target: { value: 'Some discarded draft.' } });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(await screen.findByText('The first segment.')).toBeInTheDocument();
    expect(mockUpdateSegment).not.toHaveBeenCalled();
    expect(mockGenerateSegments).not.toHaveBeenCalled();
  });

  describe('keyboard activation and shortcuts', () => {
    it('pressing Enter on a segment starts editing (role="button" divs do not synthesize clicks from key events)', async () => {
      renderReviseTool();

      const segmentEl = (await screen.findByText('The first segment.')).closest('[role="button"]')!;
      fireEvent.keyDown(segmentEl, { key: 'Enter' });

      const textarea = await screen.findByRole('textbox', { name: /edit segment text/i });
      expect(textarea).toHaveValue('The first segment.');
    });

    it('pressing Space on a segment starts editing', async () => {
      renderReviseTool();

      const segmentEl = (await screen.findByText('The first segment.')).closest('[role="button"]')!;
      fireEvent.keyDown(segmentEl, { key: ' ' });

      const textarea = await screen.findByRole('textbox', { name: /edit segment text/i });
      expect(textarea).toHaveValue('The first segment.');
    });

    it('exposes a descriptive aria-label on the segment (not a bare "button")', async () => {
      renderReviseTool();

      const segmentEl = (await screen.findByText('The first segment.')).closest('[role="button"]')!;
      expect(segmentEl).toHaveAttribute('aria-label', expect.stringMatching(/^Edit: The first segment\./));
    });

    it('the textarea receives focus when editing starts', async () => {
      renderReviseTool();

      const segmentEl = (await screen.findByText('The first segment.')).closest('[role="button"]')!;
      fireEvent.click(segmentEl);

      const textarea = await screen.findByRole('textbox', { name: /edit segment text/i });
      expect(textarea).toHaveFocus();
    });

    it('Escape cancels an in-progress edit without calling the API', async () => {
      renderReviseTool();

      const segmentEl = (await screen.findByText('The first segment.')).closest('[role="button"]')!;
      fireEvent.click(segmentEl);

      const textarea = await screen.findByRole('textbox', { name: /edit segment text/i });
      fireEvent.change(textarea, { target: { value: 'Some discarded draft.' } });
      fireEvent.keyDown(textarea, { key: 'Escape' });

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(await screen.findByText('The first segment.')).toBeInTheDocument();
      expect(mockUpdateSegment).not.toHaveBeenCalled();
    });

    it('Cmd+Enter (and Ctrl+Enter) commits the edit', async () => {
      renderReviseTool();

      const segmentEl = (await screen.findByText('The first segment.')).closest('[role="button"]')!;
      fireEvent.click(segmentEl);

      const textarea = await screen.findByRole('textbox', { name: /edit segment text/i });
      fireEvent.change(textarea, { target: { value: 'The first segment, revised.' } });
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

      await waitFor(() => {
        expect(mockUpdateSegment).toHaveBeenCalledWith('s1', {
          text_content: 'The first segment, revised.',
          audio_status: 'unprocessed',
        });
      });
      expect(mockGenerateSegments).toHaveBeenCalledWith(['s1']);
    });
  });

  it('an edit that exceeds the character buffer with a clean sentence-boundary split still commits as a single segment (no backend support for inserting a new segment today) and shows the overflow hint', async () => {
    renderReviseTool();

    const segmentEl = await screen.findByText('The first segment.');
    fireEvent.click(segmentEl.closest('[role="button"]')!);

    const textarea = await screen.findByRole('textbox', { name: /edit segment text/i });

    const first = 'Repeat this clause to pad it out nicely so it clears the floor comfortably.';
    const second = 'Then this second clause also needs enough characters to clear the floor too.';
    const overLimitText = `${first} ${second} ${first} ${second} ${first} ${second} ${first} ${second}`;
    expect(overLimitText.length).toBeGreaterThan(500);

    fireEvent.change(textarea, { target: { value: overLimitText } });

    // Passive, non-blocking indicator — not a validation error blocking save.
    expect(screen.getByText(/exceeds the engine's ~500 char buffer/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save$/i })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockUpdateSegment).toHaveBeenCalledTimes(1);
    });
    // A real two-segment split would require a backend segment-insert
    // endpoint that does not exist (confirmed — see ReviseTool's commit
    // handler comment); v1 persists the full, unsplit text as one segment
    // rather than silently losing the second half or faking a second
    // network call against a nonexistent segment id.
    expect(mockUpdateSegment).toHaveBeenCalledWith('s1', {
      text_content: overLimitText,
      audio_status: 'unprocessed',
    });
    expect(mockGenerateSegments).toHaveBeenCalledTimes(1);
    expect(mockGenerateSegments).toHaveBeenCalledWith(['s1']);
  });

  it('shows a save error and keeps the draft editable if the commit fails', async () => {
    mockUpdateSegment = vi.fn().mockRejectedValue(new Error('network error'));
    renderReviseTool();

    const segmentEl = await screen.findByText('The first segment.');
    fireEvent.click(segmentEl.closest('[role="button"]')!);

    const textarea = await screen.findByRole('textbox', { name: /edit segment text/i });
    fireEvent.change(textarea, { target: { value: 'Edited but will fail.' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/save failed/i);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(mockGenerateSegments).not.toHaveBeenCalled();
  });

  it('keeps the later chapter\'s segments when an earlier chapter\'s fetch resolves after it (stale-response guard)', async () => {
    const resolvers: Record<string, (value: unknown) => void> = {};
    mockFetchSegments = vi.fn((chapterId: string) => new Promise((resolve) => {
      resolvers[chapterId] = resolve;
    }));
    mockChapters = [
      { id: 'chap-1', title: 'Chapter 1' },
      { id: 'chap-2', title: 'Chapter 2' },
    ];

    function Harness() {
      const [, setSearchParams] = useSearchParams();
      return (
        <>
          <button type="button" onClick={() => setSearchParams({ chapter: 'chap-2' })}>
            go-to-chap-2
          </button>
          <ReviseToolBody />
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={['/?chapter=chap-1']}>
        <Harness />
      </MemoryRouter>,
    );

    // Switch to chapter 2 before chapter 1's fetch (issued on mount) resolves.
    fireEvent.click(screen.getByText('go-to-chap-2'));

    await waitFor(() => {
      expect(mockFetchSegments).toHaveBeenCalledWith('chap-2');
    });

    // Resolve the LATER request (chapter 2) first...
    act(() => {
      resolvers['chap-2']([
        { id: 's2', chapter_id: 'chap-2', segment_order: 0, text_content: 'Chapter two segment.', character_id: null, speaker_profile_name: null, audio_file_path: null, audio_status: 'done', audio_generated_at: null },
      ]);
    });

    await screen.findByText('Chapter two segment.');

    // ...then resolve the now-stale EARLIER request (chapter 1) out of order.
    act(() => {
      resolvers['chap-1']([
        { id: 's1', chapter_id: 'chap-1', segment_order: 0, text_content: 'Chapter one segment.', character_id: null, speaker_profile_name: null, audio_file_path: null, audio_status: 'done', audio_generated_at: null },
      ]);
    });

    // The final state must reflect chapter 2 (current), not the stale chapter 1 response.
    await waitFor(() => {
      expect(screen.queryByText('Chapter one segment.')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Chapter two segment.')).toBeInTheDocument();
  });

  describe('dirty-exit guard', () => {
    it('reports dirty via useDirtyGuard once the draft differs from the segment\'s saved text', async () => {
      renderReviseTool();

      const segmentEl = await screen.findByText('The first segment.');
      fireEvent.click(segmentEl.closest('[role="button"]')!);
      // Starting an edit with the unmodified text is not yet dirty.
      expect(mockSetDirty).toHaveBeenLastCalledWith(false, 'Uncommitted segment edit');

      const textarea = await screen.findByRole('textbox', { name: /edit segment text/i });
      fireEvent.change(textarea, { target: { value: 'The first segment, revised.' } });

      expect(mockSetDirty).toHaveBeenLastCalledWith(true, 'Uncommitted segment edit');
    });

    it('clears dirty on commit', async () => {
      renderReviseTool();

      const segmentEl = await screen.findByText('The first segment.');
      fireEvent.click(segmentEl.closest('[role="button"]')!);

      const textarea = await screen.findByRole('textbox', { name: /edit segment text/i });
      fireEvent.change(textarea, { target: { value: 'The first segment, revised.' } });
      expect(mockSetDirty).toHaveBeenLastCalledWith(true, 'Uncommitted segment edit');

      fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

      await waitFor(() => {
        expect(mockSetDirty).toHaveBeenLastCalledWith(false);
      });
    });

    it('clears dirty on cancel', async () => {
      renderReviseTool();

      const segmentEl = await screen.findByText('The first segment.');
      fireEvent.click(segmentEl.closest('[role="button"]')!);

      const textarea = await screen.findByRole('textbox', { name: /edit segment text/i });
      fireEvent.change(textarea, { target: { value: 'Some discarded draft.' } });
      expect(mockSetDirty).toHaveBeenLastCalledWith(true, 'Uncommitted segment edit');

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockSetDirty).toHaveBeenLastCalledWith(false);
    });

    it('has no active edit (and reports clean) on initial mount', async () => {
      renderReviseTool();

      await screen.findByText('The first segment.');
      expect(mockSetDirty).toHaveBeenLastCalledWith(false);
    });
  });

  describe('save button token pairing (design-system.md §2.1)', () => {
    // jsdom in this project doesn't process the theme stylesheet (no `css: true`
    // in vitest.config.ts), so computed-style assertions aren't available here.
    // Read the source rule directly instead — this still fails on the pre-fix
    // `color: var(--surface)` pairing and passes once it matches `.btn-primary`'s
    // `background: var(--action-primary)` / `color: var(--on-action)` convention.
    it('pairs --on-action with the accent background, matching .btn-primary\'s convention', () => {
      const cssPath = resolve(process.cwd(), 'src/theme/components.css');
      const css = readFileSync(cssPath, 'utf-8');

      const saveBtnRule = css.match(/\.revise-text-view__save-btn\s*\{[^}]*\}/)?.[0];
      expect(saveBtnRule).toBeTruthy();
      expect(saveBtnRule).toMatch(/color:\s*var\(--on-action\)/);
      expect(saveBtnRule).not.toMatch(/color:\s*var\(--surface\)/);
    });
  });
});
