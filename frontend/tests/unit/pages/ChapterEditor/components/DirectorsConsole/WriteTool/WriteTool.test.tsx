import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { WriteTool } from '@/pages/ChapterEditor/components/DirectorsConsole/WriteTool';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import type { Chapter } from '@/types';

vi.mock('@/pages/Book/BookDataContext', () => ({
  useBookDataContext: vi.fn(),
}));

vi.mock('@/pages/Book/components/ChapterTextPanel', () => ({
  ChapterTextPanel: (props: any) => (
    <section aria-label="Chapter text panel">
      <span data-testid="resolved-chapter-id">{props.chapter?.id ?? 'none'}</span>
      <button type="button" onClick={() => props.onSaved?.()}>Save</button>
      <button type="button" onClick={() => props.onDirtyChange?.(true)}>Simulate dirty</button>
      <button type="button" onClick={() => props.onDirtyChange?.(false)}>Simulate clean</button>
    </section>
  ),
}));

const mockSetDirty = vi.fn();

vi.mock('@/pages/ChapterEditor/components/DirectorsConsole/DirtyGuardContext', () => ({
  useDirtyGuard: () => ({ setDirty: mockSetDirty }),
}));

function makeChapter(id: string): Chapter {
  return {
    id,
    project_id: 'book-1',
    title: `Chapter ${id}`,
    text_content: 'text',
    speaker_profile_name: null,
    sort_order: 0,
    audio_status: 'unprocessed',
    audio_file_path: null,
    text_last_modified: null,
    audio_generated_at: null,
    char_count: 20,
    word_count: 4,
    sent_count: 1,
    predicted_audio_length: 3,
    audio_length_seconds: 0,
    total_segments_count: 1,
    done_segments_count: 0,
  } as Chapter;
}

function renderInRouter(initialEntry: string) {
  const WriteToolBody = WriteTool.component;
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WriteToolBody />
    </MemoryRouter>,
  );
}

describe('WriteTool', () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBookDataContext).mockReturnValue({
      chapters: [makeChapter('ch-1'), makeChapter('ch-2')],
      reload,
    } as any);
  });

  it('is registered with the expected id, label, and non-placeholder flag', () => {
    expect(WriteTool.id).toBe('write');
    expect(WriteTool.label).toBe('Write');
    expect(WriteTool.demoPlaceholder).toBe(false);
  });

  it('resolves the chapter from the "chapter" search param', () => {
    renderInRouter('/book/book-1/editor?chapter=ch-2');

    expect(screen.getByTestId('resolved-chapter-id')).toHaveTextContent('ch-2');
  });

  it('falls back to the first chapter when no search param is present', () => {
    renderInRouter('/book/book-1/editor');

    expect(screen.getByTestId('resolved-chapter-id')).toHaveTextContent('ch-1');
  });

  it('passes the context reload callback through as onSaved', async () => {
    renderInRouter('/book/book-1/editor?chapter=ch-1');

    screen.getByRole('button', { name: 'Save' }).click();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('forwards ChapterTextPanel\'s dirty signal to the console via useDirtyGuard', () => {
    renderInRouter('/book/book-1/editor?chapter=ch-1');

    screen.getByRole('button', { name: 'Simulate dirty' }).click();
    expect(mockSetDirty).toHaveBeenLastCalledWith(true, 'Uncommitted chapter text edit');

    screen.getByRole('button', { name: 'Simulate clean' }).click();
    expect(mockSetDirty).toHaveBeenLastCalledWith(false, undefined);
  });
});
