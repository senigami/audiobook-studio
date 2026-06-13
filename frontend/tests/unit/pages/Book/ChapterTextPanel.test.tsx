import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { ChapterTextPanel } from '@/pages/Book/components/ChapterTextPanel';
import type { Chapter } from '@/types';

vi.mock('@/api', () => ({
  api: {
    fetchChapter: vi.fn(),
    updateChapter: vi.fn(),
    previewSourceTextResync: vi.fn(),
  },
}));

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    motion: {
      ...actual.motion,
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
  };
});

const draftChapter: Chapter = {
  id: 'chapter-draft',
  project_id: 'book-1',
  title: 'Draft Chapter',
  text_content: 'Original draft text',
  speaker_profile_name: null,
  sort_order: 0,
  audio_status: 'unprocessed',
  audio_file_path: null,
  text_last_modified: null,
  audio_generated_at: null,
  char_count: 19,
  word_count: 3,
  sent_count: 1,
  predicted_audio_length: 3,
  audio_length_seconds: 0,
  total_segments_count: 1,
  done_segments_count: 0,
};

const producedChapter: Chapter = {
  ...draftChapter,
  id: 'chapter-rendered',
  title: 'Rendered Chapter',
  audio_status: 'done',
  has_wav: true,
  text_content: 'Original rendered text',
};

describe('ChapterTextPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchChapter).mockImplementation(async (chapterId) => (
      chapterId === producedChapter.id ? producedChapter : draftChapter
    ));
    vi.mocked(api.updateChapter).mockImplementation(async (chapterId, data) => ({
      status: 'ok',
      chapter: {
        ...(chapterId === producedChapter.id ? producedChapter : draftChapter),
        text_content: data.text_content ?? '',
      },
    }));
    vi.mocked(api.previewSourceTextResync).mockResolvedValue({
      total_segments_before: 2,
      total_segments_after: 3,
      preserved_assignments_count: 1,
      lost_assignments_count: 0,
      affected_character_names: [],
      is_destructive: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('autosaves draft and ready chapter text after the debounce', async () => {
    vi.useFakeTimers();
    const onSaved = vi.fn();
    render(<ChapterTextPanel chapter={draftChapter} onSaved={onSaved} />);

    await act(async () => {});
    expect(api.fetchChapter).toHaveBeenCalledWith('chapter-draft');

    fireEvent.change(screen.getByLabelText('Chapter manuscript text'), {
      target: { value: 'Updated draft text' },
    });

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(api.updateChapter).toHaveBeenCalledWith('chapter-draft', {
      text_content: 'Updated draft text',
    });
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByText(/autosaved/i)).toBeInTheDocument();
  });

  it('locks produced chapters until explicitly unlocked and previews resync before commit', async () => {
    render(<ChapterTextPanel chapter={producedChapter} />);

    await waitFor(() => {
      expect(screen.getByText('Original rendered text')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Chapter manuscript text')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit text' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Editing re-analyzes this chapter');

    fireEvent.click(screen.getByRole('button', { name: 'Edit anyway' }));
    fireEvent.change(screen.getByLabelText('Chapter manuscript text'), {
      target: { value: 'Updated rendered text' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Commit changes' }));

    await waitFor(() => {
      expect(api.previewSourceTextResync).toHaveBeenCalledWith('chapter-rendered', 'Updated rendered text');
    });
    expect(await screen.findByRole('dialog', { name: 'Source Text Resync Preview' })).toBeInTheDocument();
  });
});
